import { createRequestHandler } from "./final-handler.js";
import { Router } from "./router.js";
import http from "http";
import { errorOccured } from "./utils/errorOccured.js";
import { nothingMatches } from "./utils/whenNothingMatches.js";

export class BasicServer {
  constructor(opts = {}) {
    this.noMatches = opts.noMatches || nothingMatches;
    this.error = opts.error || errorOccured;
    this.router = new Router();
    this.runsOnEveryRequest = createRequestHandler(this);
    this._initializeMethods();
  }

  _initializeMethods() {
    const methods = ["get", "post", "put", "delete", "options", "head"];
    methods.forEach((method) => {
      this[method] = (path, ...handlers) => {
        this.router[method](path, ...handlers);
        return this;
      };
    });
  }

  addMiddleware(base, ...fns) {
    if (typeof base === "function") {
      this.router.use("/", base, ...fns);
    } else {
      this.router.use(base, ...fns);
    }
    return this;
  }

  use(base, ...fns) {
    return this.addMiddleware(base, ...fns);
  }

  runServerOn(port, callback) {
    if (!this.server) {
      this.server = http.createServer();
      this.server.on("request", this.runsOnEveryRequest);
    }

    this.server.listen(port, callback);
    return this;
  }

  enableGracefulShutdown(onShutdown, opts = {}) {
    const timeout = opts.timeout || 10000;
    const signals = ["SIGTERM", "SIGINT"];
    let shuttingDown = false;

    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;

      console.log(`\n[Graceful Shutdown] Received ${signal}. Starting shutdown process...`);

      if (this.server) {
        this.server.close(async (err) => {
          if (err) {
            console.error("[Graceful Shutdown] Error closing HTTP server:", err);
          } else {
            console.log("[Graceful Shutdown] HTTP server closed successfully.");
          }

          if (typeof onShutdown === "function") {
            try {
              await onShutdown();
              console.log("[Graceful Shutdown] Custom cleanup completed.");
            } catch (cleanErr) {
              console.error("[Graceful Shutdown] Custom cleanup error:", cleanErr);
            }
          }

          process.exit(err ? 1 : 0);
        });
      } else {
        process.exit(0);
      }

      setTimeout(() => {
        console.error(`[Graceful Shutdown] Forced shutdown after ${timeout}ms.`);
        process.exit(1);
      }, timeout).unref();
    };

    signals.forEach((signal) => {
      process.on(signal, () => shutdown(signal));
    });

    return this;
  }
}
