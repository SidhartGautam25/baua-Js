import { createServer, timeout, rateLimiter } from "../index.js";

const app = createServer();

// 1. Apply request timeout (500ms) on all routes
app.use(timeout(500));

// 2. Apply rate limiter (max 3 requests per 10 seconds) on all routes
app.use(rateLimiter({ limit: 3, windowMs: 10000 }));

// Normal fast route
app.get("/fast", (req, res) => {
  res.send("Fast response!");
});

// Slow route that triggers timeout
app.get("/slow", (req, res) => {
  setTimeout(() => {
    // If timeout triggered, res.writableEnded/headersSent is true, so send does nothing
    res.send("Slow response finished!");
  }, 1000);
});

app.runServerOn(3000, () => {
  console.log("Resiliency example server running at http://localhost:3000");
});
