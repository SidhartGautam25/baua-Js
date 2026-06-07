import { createServer, json, helmet, logger, cors, metrics, healthz, config, registerServiceInstance } from "bauajs";
import { todosRouter } from "./todosRouter.js";
import { pubsub } from "./context.js";
import { startNotificationWorker } from "./services/notificationWorker.js";

// 1. Load and validate environment configuration
const configSchema = {
  PORT: { type: "number", default: 3000, required: true },
  ENABLE_LOGGING: { type: "boolean", default: true, required: true }
};

const appConfig = config(configSchema);

// 2. Initialize the BauaJS server
const app = createServer();

// 3. Mount global middlewares
app.use(helmet());
app.use(cors());
app.use(json({ limit: 100 * 1024 })); // 100KB body limit
app.use(metrics()); // exposes /metrics

if (appConfig.ENABLE_LOGGING) {
  app.use(logger);
}

// 4. Mount health probe endpoint
app.get("/healthz", healthz({
  app: async () => {
    return "Todo API microservice is running normally.";
  }
}));

// 5. Mount the Todo router
app.use("/todos", todosRouter);

// 6. Register mock service instances in the global service discovery registry
registerServiceInstance("user-service", "http://localhost:5001");
registerServiceInstance("user-service", "http://localhost:5002");
registerServiceInstance("analytics-service", "http://localhost:5003");

// 7. Start the background notification worker subscribing to Pub/Sub events
startNotificationWorker(pubsub);

// 8. Enable Graceful Shutdown
app.enableGracefulShutdown(async () => {
  console.log("[Todo API] Cleaning up service state...");
  console.log("[Todo API] Cleanup complete.");
}, { timeout: 5000 });

// 9. Start the microservice
app.runServerOn(appConfig.PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 Todo Microservice API is running on port ${appConfig.PORT}`);
  console.log(`📊 Prometheus Metrics: http://localhost:${appConfig.PORT}/metrics`);
  console.log(`💚 Health Check Probe: http://localhost:${appConfig.PORT}/healthz`);
  console.log(`📝 Todo CRUD endpoints: http://localhost:${appConfig.PORT}/todos`);
  console.log(`=================================================\n`);
});
