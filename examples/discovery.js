import { createServer, client, globalRegistry, registerServiceInstance } from "../index.js";
import http from "http";

// 1. Spin up 3 instance servers (on ports 3001, 3002, and 3003)
const instancePorts = [3001, 3002, 3003];
const servers = [];
const healthStatus = { 3001: true, 3002: true, 3003: true };

for (const port of instancePorts) {
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(healthStatus[port] ? 200 : 500);
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ port, instance: `server-${port}` }));
    }
  });

  server.listen(port, () => {
    console.log(`[Service Instance] Running on http://localhost:${port}`);
  });
  servers.push(server);

  // Register in global registry
  registerServiceInstance("my-service", `http://localhost:${port}`);
}

// 2. Set up background health checks on global registry every 100ms
globalRegistry.healthCheckInterval = 100;
globalRegistry.startHealthChecks();

// 3. Setup a main orchestrator server on port 3000 to demonstrate load balancing
const app = createServer();

app.get("/request-lb", async (req, res) => {
  console.log("\n--- Resolving service: my-service ---");
  try {
    const response = await client.request(req, "http://my-service/info");
    const data = await response.json();
    res.json({ success: true, resolvedTo: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/toggle-health/:port", (req, res) => {
  const port = parseInt(req.params.port);
  if (!healthStatus.hasOwnProperty(port)) {
    return res.status(400).send("Invalid port");
  }
  healthStatus[port] = !healthStatus[port];
  console.log(`\n[Control] Instance on port ${port} set to healthy:`, healthStatus[port]);
  res.json({ success: true, port, healthy: healthStatus[port] });
});

app.runServerOn(3000, () => {
  console.log("\nMain LB Orchestrator server running at http://localhost:3000");
  
  console.log("\nTo test client-side Round Robin load balancing:");
  console.log("  Run multiple times: curl http://localhost:3000/request-lb");

  console.log("\nTo simulate instance 3001 going down:");
  console.log("  Run: curl -X POST http://localhost:3000/toggle-health/3001");
  console.log("  Wait 200ms for healthcheck, then run request-lb again to see it skip 3001.");

  console.log("\nPress Ctrl+C to terminate all servers.");
});

// Cleanup servers on process termination
process.on("SIGINT", () => {
  console.log("\nShutting down all instances...");
  globalRegistry.stopHealthChecks();
  for (const s of servers) {
    s.close();
  }
  process.exit();
});
