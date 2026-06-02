import assert from "assert";
import {
  createServer,
  Router,
  json,
  urlencoded,
  logger,
  healthz,
  timeout,
  rateLimiter,
  cors,
  client,
  validateRequest,
  metrics,
  createMetricsCollector,
  createPubSub,
  MemoryDriver,
  ServiceRegistry,
  LoadBalancer,
  helmet
} from "./index.js";

const PORT = 4000;
const app = createServer();

// Mount CORS middleware at the very top
app.use(cors({
  origin: "http://example.com",
  credentials: true,
  allowedHeaders: ["X-Test-Request"]
}));

// Initialize metrics collector and mount metrics middleware
const testCollector = createMetricsCollector();
app.use(metrics({ collector: testCollector }));

// Track test statistics
let testsRun = 0;
let testsPassed = 0;

function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`✓ [PASSED] ${name}`);
  } catch (err) {
    console.error(`✗ [FAILED] ${name}`);
    console.error(err);
  }
}

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

// -------------------------------------------------------------
// SETUP ROUTES FOR TESTING
// -------------------------------------------------------------

// Step 1: Wildcards, Router Nesting, and all()
const apiRouter = new Router();
apiRouter.get("/users/:id", (req, res) => {
  res.json({ userId: req.params.id, fromSubRouter: true });
});

// next('route') support
apiRouter.get(
  "/route-skip",
  (req, res, next) => {
    next("route");
  },
  (req, res) => {
    res.send("should not reach here");
  }
);
apiRouter.get("/route-skip", (req, res) => {
  res.send("reached next route");
});

app.use("/api", apiRouter);

// app.all and wildcards
app.all("/wildcard/*", (req, res) => {
  res.json({ method: req.method, wildcard: req.params["*"] });
});

// Step 2: Request / Response Decorators
app.get("/test-decorators", (req, res) => {
  res.cookie("session", "abc-123", { httpOnly: true });
  res.set("X-Custom-Header", "Hello");
  res.json({
    ip: req.ip,
    xhr: req.xhr,
    protocol: req.protocol,
    secure: req.secure,
    hostname: req.hostname,
    headerValue: req.get("x-test-header"),
    cookieValue: req.cookies.session_in,
  });
});

app.get("/send-status/:code", (req, res) => {
  res.sendStatus(parseInt(req.params.code, 10));
});

// Step 3: Resiliency (Timeout & Payload Limits)
app.get("/slow-route", timeout(100), (req, res) => {
  setTimeout(() => {
    res.send("should be ignored");
  }, 200);
});

app.post("/limit-route", json({ limit: 50 }), (req, res) => {
  res.json({ body: req.body });
});// Step 4: CORS & Error Handling Middleware

// Standard error middleware (4 arguments)
app.get("/force-error", (req, res, next) => {
  next(new Error("custom error triggered"));
});

// Mount custom error-handling middleware
app.use((err, req, res, next) => {
  if (err.message === "custom error triggered") {
    res.status(400).send("Handled by error middleware");
  } else {
    next(err);
  }
});

// Step 5: Distributed Tracing & Healthz
app.get("/health-live", healthz({ type: "liveness" }));
app.get("/health-ready", healthz({
  type: "readiness",
  checks: {
    db: () => "OK"
  }
}));

app.get("/trace-demo", (req, res) => {
  res.json({ traceparent: req.headers.traceparent });
});

// Step 6: Input Validation Middleware
app.post("/validate-user/:userId", json(), validateRequest({
  params: {
    userId: { type: "number", required: true }
  },
  query: {
    admin: { type: "boolean", default: false }
  },
  body: {
    username: { type: "string", required: true, pattern: /^[a-zA-Z0-9]+$/ },
    email: { type: "string", required: true },
    age: { type: "number", min: 18, max: 120 }
  }
}), (req, res) => {
  res.json({
    params: req.params,
    query: req.query,
    body: req.body
  });
});

// Step 7: Metrics dummy endpoint
app.get("/metrics-slow", (req, res) => {
  setTimeout(() => {
    res.send("slow response");
  }, 20);
});

// Step 8: Helmet security middleware endpoint
app.get("/helmet-test", helmet({ "X-Frame-Options": "DENY", "X-DNS-Prefetch-Control": false }), (req, res) => {
  res.setHeader("X-Powered-By", "BauaJS-Super-Server");
  res.send("secured");
});

// -------------------------------------------------------------
// RUN SERVER AND RUN TESTS
// -------------------------------------------------------------
app.runServerOn(PORT, async () => {
  console.log(`Test Server running on port ${PORT}\n`);

  // Test 1: Sub-router mounting and parameter propagation
  await asyncTest("Sub-router mounting & parameters", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/users/99`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.userId, "99");
    assert.strictEqual(data.fromSubRouter, true);
  });

  // Test 2: next('route') support
  await asyncTest("next('route') skip logic", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/route-skip`);
    const text = await res.text();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(text, "reached next route");
  });

  // Test 3: app.all and wildcard parameters
  await asyncTest("app.all() & wildcard route matching", async () => {
    const res = await fetch(`http://localhost:${PORT}/wildcard/some/deep/path`, {
      method: "POST"
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.method, "POST");
    assert.strictEqual(data.wildcard, "some/deep/path");
  });

  // Test 4: Decorators, headers, cookies, and properties
  await asyncTest("Request/Response decorators, headers & cookies", async () => {
    const res = await fetch(`http://localhost:${PORT}/test-decorators`, {
      headers: {
        "x-test-header": "custom-val",
        "Cookie": "session_in=xyz-789"
      }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.headerValue, "custom-val");
    assert.strictEqual(data.cookieValue, "xyz-789");
    assert.strictEqual(res.headers.get("x-custom-header"), "Hello");
    
    const setCookie = res.headers.get("set-cookie");
    assert.ok(setCookie.includes("session=abc-123"));
    assert.ok(setCookie.includes("HttpOnly"));
  });

  // Test 5: sendStatus helper
  await asyncTest("res.sendStatus helper function", async () => {
    const res = await fetch(`http://localhost:${PORT}/send-status/400`);
    const text = await res.text();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(text, "Bad Request");
  });

  // Test 6: Timeout write prevention
  await asyncTest("Timeout middleware write prevention", async () => {
    const res = await fetch(`http://localhost:${PORT}/slow-route`);
    const text = await res.text();
    assert.strictEqual(res.status, 504);
    assert.strictEqual(text, "Gateway Timeout");
    // Wait for the timeout's post-timeout write to ensure no crash happens
    await new Promise((resolve) => setTimeout(resolve, 250));
  });

  // Test 7: Body parser payload size limit
  await asyncTest("BodyParser payload size limit", async () => {
    const largeBody = JSON.stringify({ data: "a".repeat(100) });
    const res = await fetch(`http://localhost:${PORT}/limit-route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: largeBody
    });
    assert.strictEqual(res.status, 413); // Payload Too Large
  });

  // Test 8: CORS headers and OPTIONS preflight
  await asyncTest("CORS headers & OPTIONS Preflight checks", async () => {
    // Preflight
    const preflight = await fetch(`http://localhost:${PORT}/test-decorators`, {
      method: "OPTIONS",
      headers: {
        "Origin": "http://example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "X-Test-Request"
      }
    });
    assert.strictEqual(preflight.status, 204);
    assert.strictEqual(preflight.headers.get("access-control-allow-origin"), "http://example.com");
    assert.strictEqual(preflight.headers.get("access-control-allow-credentials"), "true");
    assert.strictEqual(preflight.headers.get("access-control-allow-headers"), "X-Test-Request");

    // Regular request
    const regular = await fetch(`http://localhost:${PORT}/test-decorators`, {
      headers: { "Origin": "http://example.com" }
    });
    assert.strictEqual(regular.headers.get("access-control-allow-origin"), "http://example.com");
  });

  // Test 9: Custom error-handling middleware
  await asyncTest("Custom 4-argument error-handling middleware", async () => {
    const res = await fetch(`http://localhost:${PORT}/force-error`);
    const text = await res.text();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(text, "Handled by error middleware");
  });

  // Test 10: Health Check liveness vs readiness probes
  await asyncTest("Liveness vs Readiness check separation", async () => {
    const liveRes = await fetch(`http://localhost:${PORT}/health-live`);
    const liveData = await liveRes.json();
    assert.strictEqual(liveRes.status, 200);
    assert.strictEqual(liveData.type, "liveness");
    assert.ok(!liveData.checks); // no checks for liveness

    const readyRes = await fetch(`http://localhost:${PORT}/health-ready`);
    const readyData = await readyRes.json();
    assert.strictEqual(readyRes.status, 200);
    assert.strictEqual(readyData.type, "readiness");
    assert.strictEqual(readyData.checks.db.status, "OK");
  });

  // Test 11: Traceparent header generation & propagation
  await asyncTest("Traceparent distributed tracing propagation", async () => {
    // 1. Generation by decorateRequest when correlation ID is present
    const res = await fetch(`http://localhost:${PORT}/trace-demo`, {
      headers: { "X-Correlation-ID": "test-uuid-value" }
    });
    const data = await res.json();
    assert.ok(data.traceparent);
    assert.ok(data.traceparent.startsWith("00-"));
    // traceparent contains stripped uuid value
    assert.ok(data.traceparent.includes("testuuidvalue"));

    // 2. Outbound client tracing propagation
    const cb = client.createCircuitBreaker();
    // Setup a mock target endpoint
    app.get("/target-trace", (req, res) => {
      res.json({ traceparent: req.headers.traceparent });
    });
    
    // Call outbound trace-propagating endpoint
    const mockReq = { id: "outbound-correlation-id", headers: { traceparent: "00-outboundtraceid-1234567890abcdef-01" } };
    const outboundRes = await client.request(mockReq, `http://localhost:${PORT}/target-trace`, {
      circuitBreaker: cb
    });
    const outboundData = await outboundRes.json();
    assert.strictEqual(outboundData.traceparent, "00-outboundtraceid-1234567890abcdef-01");
  });

  // Test 12: Circuit Breaker execution
  await asyncTest("Circuit Breaker state transitions & fallbacks", async () => {
    const cb = client.createCircuitBreaker({ failureThreshold: 2, recoveryTimeout: 100 });
    
    // Trigger failures to trip the circuit
    let calledFallback = false;
    const fallbackFn = (err) => {
      calledFallback = true;
      return { fallback: true };
    };

    // First call: fail
    try {
      await client.request(null, `http://localhost:9999/does-not-exist`, {
        circuitBreaker: cb,
        timeout: 50,
        retries: 0
      });
    } catch (err) {
      // expected fail
    }

    // Second call: fail -> trips circuit to OPEN
    try {
      await client.request(null, `http://localhost:9999/does-not-exist`, {
        circuitBreaker: cb,
        timeout: 50,
        retries: 0,
        fallback: fallbackFn
      });
    } catch (err) {
      // expected fail
    }

    // Circuit is OPEN now. Next call should immediately hit fallback without executing request
    assert.strictEqual(cb.state, "OPEN");
    
    const fallbackResult = await client.request(null, `http://localhost:${PORT}/api/users/1`, {
      circuitBreaker: cb,
      fallback: fallbackFn
    });

    assert.ok(calledFallback);
    assert.strictEqual(fallbackResult.fallback, true);

    // Wait for recovery timeout to transition to HALF-OPEN on next attempt
    await new Promise((resolve) => setTimeout(resolve, 150));
    
    // Make successful call to close the circuit
    const successRes = await client.request(null, `http://localhost:${PORT}/api/users/42`, {
      circuitBreaker: cb
    });
    const successData = await successRes.json();
    assert.strictEqual(successData.userId, "42");
    assert.strictEqual(cb.state, "CLOSED");
  });

  // Test 13: Request validation middleware
  await asyncTest("Request schema validation (success & failure & coercion)", async () => {
    // 1. Success case with coercion and defaults
    const successRes = await fetch(`http://localhost:${PORT}/validate-user/123?admin=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "johndoe",
        email: "john@example.com",
        age: 25
      })
    });
    assert.strictEqual(successRes.status, 200);
    const successData = await successRes.json();
    assert.strictEqual(successData.params.userId, 123); // coerced to number
    assert.strictEqual(successData.query.admin, true);  // coerced to boolean
    assert.strictEqual(successData.body.username, "johndoe");
    assert.strictEqual(successData.body.age, 25);

    // 2. Success case with missing optional field triggering default
    const defaultRes = await fetch(`http://localhost:${PORT}/validate-user/456`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "janedoe",
        email: "jane@example.com"
      })
    });
    assert.strictEqual(defaultRes.status, 200);
    const defaultData = await defaultRes.json();
    assert.strictEqual(defaultData.query.admin, false); // default false
    assert.strictEqual(defaultData.body.age, undefined); // optional and no default

    // 3. Failure case
    const failRes = await fetch(`http://localhost:${PORT}/validate-user/not-a-number`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "invalid_name_$",
        email: "jane@example.com",
        age: 10 // below min 18
      })
    });
    assert.strictEqual(failRes.status, 400);
    const failData = await failRes.json();
    assert.strictEqual(failData.error, "Bad Request");
    assert.strictEqual(failData.message, "Validation Failed");
    assert.ok(failData.details.length >= 3);
    
    const paramsError = failData.details.find(d => d.location === "params" && d.field === "userId");
    assert.strictEqual(paramsError.issue, "Must be a number");

    const patternError = failData.details.find(d => d.location === "body" && d.field === "username");
    assert.strictEqual(patternError.issue, "Must match pattern");

    const minError = failData.details.find(d => d.location === "body" && d.field === "age");
    assert.strictEqual(minError.issue, "Must be at least 18");
  });

  // Test 14: Prometheus Metrics
  await asyncTest("Prometheus Metrics collector & middleware", async () => {
    // Make request to slow endpoint to record metrics
    const slowRes = await fetch(`http://localhost:${PORT}/metrics-slow`);
    assert.strictEqual(slowRes.status, 200);

    // Call /metrics endpoint
    const metricsRes = await fetch(`http://localhost:${PORT}/metrics`);
    assert.strictEqual(metricsRes.status, 200);
    const metricsText = await metricsRes.text();

    // Verify presence of standard Prometheus metrics
    assert.ok(metricsText.includes("http_requests_active"));
    assert.ok(metricsText.includes("http_requests_total"));
    assert.ok(metricsText.includes("http_request_duration_seconds"));

    // Verify our specific route `/metrics-slow` metrics
    assert.ok(metricsText.includes(`http_requests_total{method="GET",route="/metrics-slow",status="200"}`));
    assert.ok(metricsText.includes(`http_request_duration_seconds_count{method="GET",route="/metrics-slow",status="200"}`));
    assert.ok(metricsText.includes(`http_request_duration_seconds_sum{method="GET",route="/metrics-slow",status="200"}`));
  });

  // Test 15: Event-Driven Messaging Pub/Sub
  await asyncTest("Event-Driven Messaging Pub/Sub with tracing context propagation", async () => {
    const pubsub = createPubSub(new MemoryDriver());

    const received = [];
    pubsub.subscribe("test.topic", (payload, context) => {
      received.push({ payload, context });
    });

    // 1. Publish with no parent (generates context)
    await pubsub.publish("test.topic", { value: "hello" });
    
    // 2. Publish with parent
    const mockParent = {
      id: "parent-correlation-id-123",
      headers: {
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
      }
    };
    await pubsub.publish("test.topic", { value: "world" }, { parent: mockParent });

    // Wait for the memory driver asynchronous delivery
    await new Promise((resolve) => setImmediate(resolve));

    // Verify assertions
    assert.strictEqual(received.length, 2);

    // First message: auto-generated context
    assert.strictEqual(received[0].payload.value, "hello");
    assert.ok(received[0].context.id);
    assert.ok(received[0].context.headers.traceparent);

    // Second message: propagated context
    assert.strictEqual(received[1].payload.value, "world");
    assert.strictEqual(received[1].context.id, "parent-correlation-id-123");
    assert.strictEqual(received[1].context.headers["x-correlation-id"], "parent-correlation-id-123");
    assert.strictEqual(received[1].context.headers.traceparent, "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
  });

  // Test 16: Client-Side Load Balancing and Service Discovery
  await asyncTest("Client-Side Load Balancing & Service Discovery with Health Checks", async () => {
    const http = await import("http");

    // 1. Setup mock instance servers
    let health1 = true;
    let health2 = true;

    const s1 = http.createServer((req, res) => {
      if (req.url === "/healthz") {
        res.writeHead(health1 ? 200 : 500);
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ instance: 1 }));
      }
    });

    const s2 = http.createServer((req, res) => {
      if (req.url === "/healthz") {
        res.writeHead(health2 ? 200 : 500);
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ instance: 2 }));
      }
    });

    await new Promise(r => s1.listen(4001, r));
    await new Promise(r => s2.listen(4002, r));

    // 2. Setup custom registry & load balancer to avoid polluting global state
    const registry = new ServiceRegistry({ healthCheckInterval: 50, healthCheckPath: "/healthz" });
    const loadBalancer = new LoadBalancer(registry);

    registry.register("test-service", "http://localhost:4001");
    registry.register("test-service", "http://localhost:4002");

    // 3. Test Round-Robin Selection
    const res1 = await client.request(null, "http://test-service/info", { registry, loadBalancer, lbStrategy: "round-robin" });
    const data1 = await res1.json();
    
    const res2 = await client.request(null, "http://test-service/info", { registry, loadBalancer, lbStrategy: "round-robin" });
    const data2 = await res2.json();

    const res3 = await client.request(null, "http://test-service/info", { registry, loadBalancer, lbStrategy: "round-robin" });
    const data3 = await res3.json();

    // Verify it cycles 1 -> 2 -> 1
    assert.strictEqual(data1.instance, 1);
    assert.strictEqual(data2.instance, 2);
    assert.strictEqual(data3.instance, 1);

    // 4. Test Least-Connections Selection
    // Manually increment s1 connections so s2 is picked
    loadBalancer.incrementConnections("http://localhost:4001");
    const resLC = await client.request(null, "http://test-service/info", { registry, loadBalancer, lbStrategy: "least-connections" });
    const dataLC = await resLC.json();
    assert.strictEqual(dataLC.instance, 2);
    loadBalancer.decrementConnections("http://localhost:4001");

    // 5. Test Health Check Exclusion
    health1 = false;
    // Wait for health check interval to check status (interval is 50ms)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Now s1 (4001) is unhealthy, so s2 (4002) should always be resolved
    const resH1 = await client.request(null, "http://test-service/info", { registry, loadBalancer, lbStrategy: "round-robin" });
    const dataH1 = await resH1.json();
    const resH2 = await client.request(null, "http://test-service/info", { registry, loadBalancer, lbStrategy: "round-robin" });
    const dataH2 = await resH2.json();

    assert.strictEqual(dataH1.instance, 2);
    assert.strictEqual(dataH2.instance, 2);

    registry.stopHealthChecks();
    await new Promise(r => s1.close(r));
    await new Promise(r => s2.close(r));
  });

  // Test 17: Helmet Security Headers Middleware
  await asyncTest("Helmet Security Headers Middleware", async () => {
    const res = await fetch(`http://localhost:${PORT}/helmet-test`);
    assert.strictEqual(res.status, 200);

    // Verify presence of standard security headers
    assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
    assert.strictEqual(res.headers.get("referrer-policy"), "no-referrer");
    assert.strictEqual(res.headers.get("content-security-policy"), "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests");

    // Verify overrides
    assert.strictEqual(res.headers.get("x-frame-options"), "DENY");

    // Verify disabled headers
    assert.strictEqual(res.headers.get("x-dns-prefetch-control"), null);

    // Verify stripping of X-Powered-By
    assert.strictEqual(res.headers.get("x-powered-by"), null);
  });

  // -------------------------------------------------------------
  // TEST SUMMARY AND EXIT
  // -------------------------------------------------------------
  console.log(`\n=============================================`);
  console.log(`Test Suite Completed: ${testsPassed}/${testsRun} tests passed.`);
  console.log(`=============================================\n`);

  // Exit server gracefully
  process.exit(testsPassed === testsRun ? 0 : 1);
});
