import { createServer, logger, client } from "../index.js";

// --- 1. Service B (Target Service) ---
const serviceB = createServer();
serviceB.use(logger());

serviceB.get("/api/service-b", (req, res) => {
  console.log(`[Service B] Request received with correlation ID: ${req.id}`);
  res.json({
    success: true,
    message: "Greetings from Service B!",
    correlationId: req.id
  });
});

serviceB.runServerOn(3001, () => {
  console.log("Service B running at http://localhost:3001");
});

// --- 2. Service A (Gateway / Calling Service) ---
const serviceA = createServer();
serviceA.use(logger());

serviceA.get("/api/service-a", async (req, res) => {
  console.log(`[Service A] Request received with correlation ID: ${req.id}`);
  
  try {
    // Resilient outbound call: auto-propagates correlation ID, retries on failure, sets 3s timeout
    const outboundResponse = await client.request(req, "http://localhost:3001/api/service-b", {
      method: "GET",
      timeout: 3000,
      retries: 2,
      retryDelay: 50
    });

    const data = await outboundResponse.json();
    res.json({
      gateway: "Service A",
      downstream: data
    });
  } catch (err) {
    console.error(`[Service A] Outbound request failed: ${err.message}`);
    res.status(502).json({ error: "Failed to communicate with Service B" });
  }
});

// Endpoint to demonstrate retry logic when calling a down server
serviceA.get("/api/retry-demo", async (req, res) => {
  console.log(`[Service A] Retry demo started. Correlation ID: ${req.id}`);
  try {
    // Intentionally call a non-existent port (e.g. 9999) to force retries
    await client.request(req, "http://localhost:9999/does-not-exist", {
      method: "GET",
      timeout: 100, // short timeout to speed up demo
      retries: 3,
      retryDelay: 50
    });
    res.send("Success");
  } catch (err) {
    res.status(500).send(`Failed after retries: ${err.message}`);
  }
});

serviceA.runServerOn(3000, () => {
  console.log("Service A running at http://localhost:3000");
});
