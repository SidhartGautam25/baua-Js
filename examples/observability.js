import { createServer, logger } from "../index.js";

const app = createServer();

// Register the structured JSON logging middleware globally
app.use(logger());

app.get("/api/ping", (req, res) => {
  res.json({ message: "pong", correlationId: req.id });
});

app.get("/api/delay", (req, res) => {
  // Simulate database or downstream API delay
  setTimeout(() => {
    res.json({ 
      message: "delayed response", 
      correlationId: req.id 
    });
  }, 100);
});

app.runServerOn(3000, () => {
  console.log("Observability example server running at http://localhost:3000");
});
