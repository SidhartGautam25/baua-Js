import { createServer, healthz } from "../index.js";

const app = createServer();

// Simulate a database state
let isDbConnected = true;

// Define health check probes
app.get("/healthz", healthz({
  database: async () => {
    if (!isDbConnected) {
      throw new Error("Database connection lost");
    }
    return "Connected successfully";
  }
}));

// Route to simulate database going down
app.get("/toggle-db", (req, res) => {
  isDbConnected = !isDbConnected;
  res.send(`Database is now ${isDbConnected ? "UP" : "DOWN"}`);
});

app.get("/work", (req, res) => {
  res.send("Doing some heavy microservice calculations...");
});

// Enable Graceful Shutdown with a 5-second timeout and clean up callback
app.enableGracefulShutdown(async () => {
  console.log("[App] Disconnecting from database...");
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate disconnect delay
  console.log("[App] Database disconnected.");
}, { timeout: 5000 });

app.runServerOn(3000, () => {
  console.log("Orchestrator integration server running at http://localhost:3000");
  console.log("Press Ctrl+C (SIGINT) or send SIGTERM to verify graceful shutdown.");
});
