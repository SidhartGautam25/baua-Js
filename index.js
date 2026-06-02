import { BasicServer } from "./lib/server.js";
import { Router } from "./lib/router.js";
import { json, urlencoded } from "./lib/utils/bodyParser.js";
import { logger } from "./lib/middleware/logger.js";
import { healthz } from "./lib/middleware/healthz.js";
import { timeout } from "./lib/middleware/timeout.js";
import { rateLimiter } from "./lib/middleware/rateLimiter.js";
import { cors } from "./lib/middleware/cors.js";
import * as client from "./lib/utils/client.js";
import { loadAndValidate as config } from "./lib/utils/config.js";
import { validateRequest } from "./lib/middleware/validator.js";
import { metrics, createMetricsCollector } from "./lib/middleware/metrics.js";
import { createPubSub, MemoryDriver, PubSub } from "./lib/utils/pubsub.js";
import { ServiceRegistry, LoadBalancer, globalRegistry, globalLoadBalancer, registerServiceInstance, deregisterServiceInstance } from "./lib/utils/discovery.js";

export function createServer(opts = {}) {
  const basic_server = new BasicServer(opts);
  return basic_server;
}

export { Router, json, urlencoded, logger, healthz, timeout, rateLimiter, cors, client, config, validateRequest, metrics, createMetricsCollector, createPubSub, MemoryDriver, PubSub, ServiceRegistry, LoadBalancer, globalRegistry, globalLoadBalancer, registerServiceInstance, deregisterServiceInstance };



