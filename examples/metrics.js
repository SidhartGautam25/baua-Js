import { createServer, metrics } from "../index.js";

const app = createServer();

// Register the metrics middleware globally
app.use(metrics());

// Fast normal endpoint
app.get("/api/fast", (req, res) => {
  res.send("This is a fast endpoint!");
});

// Slow endpoint to demonstrate histogram bucket latency
app.get("/api/slow", (req, res) => {
  const delay = Math.random() * 200 + 50; // Random delay between 50ms and 250ms
  setTimeout(() => {
    res.json({ message: "This is a slow endpoint!", latencyMs: Math.round(delay) });
  }, delay);
});

// Failing endpoint to show status code distribution in metrics
app.get("/api/error", (req, res) => {
  res.status(500).send("Simulated internal error!");
});

app.runServerOn(3000, () => {
  console.log("Metrics example server running at http://localhost:3000");
  console.log("\nTo generate traffic, execute these requests:");
  console.log("  curl http://localhost:3000/api/fast");
  console.log("  curl http://localhost:3000/api/slow");
  console.log("  curl http://localhost:3000/api/error");
  
  console.log("\nTo view the exposed Prometheus metrics, run:");
  console.log("  curl http://localhost:3000/metrics");
});
