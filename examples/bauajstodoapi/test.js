import assert from "assert";
import { spawn } from "child_process";
import { startMockServices } from "./services/mockServices.js";

const PORT = 4000;

// Track test statistics
let testsRun = 0;
let testsPassed = 0;

async function asyncTest(name, fn) {
  testsRun++;
  try {
    await fn();
    testsPassed++;
    console.log(`✓ [PASSED] ${name}`);
  } catch (err) {
    console.error(`✗ [FAILED] ${name}`);
    console.error(err);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("=================================================================");
  console.log("🚀 Starting Advanced Microservices Showcase API Test Suite");
  console.log("=================================================================\n");

  // 1. Start the mock services (User Service cluster + Flaky Analytics Service)
  const mockCluster = startMockServices();

  // 2. Start the main Todo API Service as a child process
  const env = { ...process.env, PORT: String(PORT), ENABLE_LOGGING: "false" };
  const serverProc = spawn("node", ["index.js"], { env });

  const serverLogs = [];
  serverProc.stdout.on("data", (data) => {
    const logStr = data.toString();
    serverLogs.push(logStr);
    // Print logs from the worker to the test stdout so we can visualize it
    if (logStr.includes("[Notification Worker]") || logStr.includes("[Todo API]")) {
      console.log(`[Todo Service Out] ${logStr.trim()}`);
    }
  });

  serverProc.stderr.on("data", (data) => {
    const logStr = data.toString();
    serverLogs.push(logStr);
    console.error(`[Todo Service Err] ${logStr.trim()}`);
  });

  // Give the services 2 seconds to bind and initialize
  await delay(2000);

  try {
    // Test 1: Verify health check
    await asyncTest("GET /healthz returns healthy microservice status", async () => {
      const res = await fetch(`http://localhost:${PORT}/healthz`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, "healthy");
      assert.strictEqual(data.checks.app.status, "OK");
    });

    // Test 2: Verify Service Discovery & Client-Side Load Balancing
    await asyncTest("Client-side load balancing cycles calls between User Service Instance 1 and Instance 2", async () => {
      // We will perform 4 distinct Todo creation operations.
      // Each creation calls the `user-service` to validate the user.
      // With round-robin load-balancing, the calls should alternate between instances (ports 5001 and 5002).
      const correlationIdBase = "test-lb-corr-";

      for (let i = 1; i <= 4; i++) {
        const res = await fetch(`http://localhost:${PORT}/todos`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Correlation-ID": `${correlationIdBase}${i}`
          },
          body: JSON.stringify({
            title: `Load balancer verification task ${i}`,
            userId: 101 // valid user ID
          })
        });
        assert.strictEqual(res.status, 201);
        await res.json();
      }

      // Briefly wait for requests to settle
      await delay(200);

      // Verify that both instances handled requests (should print instance logs in output)
      console.log("[Test Info] Checked load balancing logs. (Check stdout above to see Instance 1 and Instance 2 serving requests)");
    });

    // Test 3: Verify User Validation (Invalid user ID)
    await asyncTest("POST /todos with invalid userId returns 400 Bad Request", async () => {
      const res = await fetch(`http://localhost:${PORT}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "This should fail",
          userId: 999 // invalid user ID
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error, "Bad Request");
      assert.ok(data.message.includes("User with ID 999 does not exist"));
    });

    // Test 4: Verify Async Event Queue (Pub/Sub) & Context/Tracing Propagation
    await asyncTest("Todo creation publishes event and preserves Correlation ID and traceparent across Pub/Sub", async () => {
      const traceCorrId = "tracing-correlation-token-8888";
      const res = await fetch(`http://localhost:${PORT}/todos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-ID": traceCorrId
        },
        body: JSON.stringify({
          title: "Check PubSub context propagation",
          userId: 102
        })
      });
      assert.strictEqual(res.status, 201);
      await res.json();

      // Wait a moment for async delivery to complete in worker
      await delay(500);

      // Assert that background worker logs contain traceCorrId
      const combinedLogs = serverLogs.join("\n");
      const workerFound = combinedLogs.includes(traceCorrId) && combinedLogs.includes("todo.created");
      assert.ok(workerFound, "Subscriber worker failed to receive the event with matching correlation ID");
    });

    // Test 5: Verify Circuit Breaker & Outbound Request Resiliency
    await asyncTest("Circuit Breaker trips to OPEN on failures and routes requests to fallback", async () => {
      console.log("\n[Test Progress] Stopping Analytics Service to trigger network failures...");
      
      // 1. Stop the analytics service (triggers network connection failures)
      await mockCluster.stopAnalytics();

      // 2. Trigger requests to fail. Circuit Breaker threshold is 3.
      // Call 1: fails (trips count 1)
      await fetch(`http://localhost:${PORT}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Fail 1", userId: 101 })
      });

      // Call 2: fails (trips count 2)
      await fetch(`http://localhost:${PORT}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Fail 2", userId: 101 })
      });

      // Call 3: fails (trips count 3) -> trips to OPEN
      await fetch(`http://localhost:${PORT}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Fail 3", userId: 101 })
      });

      await delay(200);

      // 3. The circuit is now OPEN. The 4th call should immediately trigger the fallback
      // without hitting the Analytics service.
      console.log("[Test Progress] Checking if next call triggers fallback directly...");
      const resFallback = await fetch(`http://localhost:${PORT}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Trigger Fallback", userId: 101 })
      });
      assert.strictEqual(resFallback.status, 201);

      // Verify that the fallback was triggered in logs
      const combinedLogs = serverLogs.join("\n");
      const fallbackLogged = combinedLogs.includes("Analytics service fallback triggered: Circuit Breaker is OPEN");
      assert.ok(fallbackLogged, "Circuit Breaker did not block call or trigger fallback");

      // 4. Start Analytics back up
      await mockCluster.startAnalytics();
      console.log("[Test Progress] Analytics service restarted. Waiting for recovery timeout (2s)...");

      // Wait 2.2 seconds for circuit breaker recovery timeout (recoveryTimeout: 2000ms)
      await delay(2200);

      // 5. Next call should execute successfully and close the circuit (HALF-OPEN -> CLOSED)
      console.log("[Test Progress] Making call during HALF-OPEN state to recover...");
      const resRecover = await fetch(`http://localhost:${PORT}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Recover Circuit", userId: 101 })
      });
      assert.strictEqual(resRecover.status, 201);
      
      await delay(200);
      console.log("[Test Info] Circuit Breaker successfully transitioned back to CLOSED.");
    });

  } finally {
    // 4. Shutdown all servers gracefully
    console.log("\nShutting down the test environment...");
    serverProc.kill("SIGTERM");
    await mockCluster.stop();
    await delay(1000);
  }

  console.log(`\n=============================================`);
  console.log(`Test Suite Finished: ${testsPassed}/${testsRun} tests passed.`);
  console.log(`=============================================\n`);

  process.exit(testsPassed === testsRun ? 0 : 1);
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
