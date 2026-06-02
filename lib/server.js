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
    this.connections = null;
    this.shuttingDown = false;
    this._initializeMethods();
  }

  _initializeMethods() {
    const methods = ["get", "post", "put", "delete", "options", "head", "patch", "all"];
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

    if (!this.connections) {
      this.connections = new Set();
      this.server.on("connection", (socket) => {
        socket._isIdle = true;
        this.connections.add(socket);
        socket.on("close", () => {
          this.connections.delete(socket);
        });
      });

      this.server.on("request", (req, res) => {
        const socket = req.socket;
        socket._isIdle = false;
        res.on("finish", () => {
          socket._isIdle = true;
          if (this.shuttingDown) {
            socket.destroy();
          }
        });
      });
    }

    this.server.listen(port, callback);
    return this;
  }

  enableGracefulShutdown(onShutdown, opts = {}) {
    const timeout = opts.timeout || 10000;
    const signals = ["SIGTERM", "SIGINT"];

    const shutdown = (signal) => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;

      console.log(`\n[Graceful Shutdown] Received ${signal}. Starting shutdown process...`);

      // Destroy all idle sockets immediately
      if (this.connections) {
        for (const socket of this.connections) {
          if (socket._isIdle) {
            socket.destroy();
          }
        }
      }

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

