import { BasicServer } from "./lib/server.js";
import { json, urlencoded } from "./lib/utils/bodyParser.js";
import { logger } from "./lib/middleware/logger.js";
import { healthz } from "./lib/middleware/healthz.js";
import { timeout } from "./lib/middleware/timeout.js";
import { rateLimiter } from "./lib/middleware/rateLimiter.js";
import * as client from "./lib/utils/client.js";
import { loadAndValidate as config } from "./lib/utils/config.js";

export function createServer(opts = {}) {
  const basic_server = new BasicServer(opts);
  return basic_server;
}

export { json, urlencoded, logger, healthz, timeout, rateLimiter, client, config };
