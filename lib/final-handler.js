import { decorateRequest, decorateResponse } from "./utils/decorate.js";
import { getBase } from "./utils/getBase.js";
import { parser } from "./utils/parser.js";

export function createRequestHandler(server, logger = console) {
  function prepareContext(req, res, extra) {
    if (!extra) {
      extra = parser(req);
    }
    decorateRequest(req, extra);
    decorateResponse(res);

    // Set correlation ID response header
    res.setHeader("X-Correlation-ID", req.id);

    return {
      req,
      res,
      base: getBase(req.path),
      path: req.path,
      method: req.method,
    };
  }

  function executeChain(matches, context, parentNext) {
    const { req, res } = context;
    const originalParams = Object.assign({}, req.params || {});
    let matchIndex = 0;
    let handlerIndex = 0;

    const next = (err) => {
      if (err === "route") {
        matchIndex++;
        handlerIndex = 0;
        err = null;
      }
      if (err) {
        req.error = err;
      }

      if (matchIndex >= matches.length) {
        if (err) {
          if (typeof parentNext === "function") {
            return parentNext(err);
          }
          if (server.error && typeof server.error === "function") {
            return server.error(err, req, res, next);
          }
          logger.error("Unhandled request failure:", err);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end("Internal Server Error");
          }
          return;
        }

        if (typeof parentNext === "function") {
          return parentNext();
        } else {
          const defaultNoMatches = (req, res) => {
            res.statusCode = 404;
            res.end(`Cannot ${req.method} ${req.path || req.url}`);
          };
          const fallbackFn = (server.noMatches || defaultNoMatches).bind(server);
          return fallbackFn(req, res);
        }
      }

      const currentMatch = matches[matchIndex];
      if (handlerIndex === 0) {
        req.params = Object.assign({}, originalParams, currentMatch.params || {});
      }

      if (handlerIndex >= currentMatch.handlers.length) {
        matchIndex++;
        handlerIndex = 0;
        return next(err);
      }

      const handler = currentMatch.handlers[handlerIndex++];

      try {
        const isErrorHandler = handler.length === 4;
        if (err) {
          if (isErrorHandler) {
            handler(err, req, res, next);
          } else {
            next(err);
          }
        } else {
          if (isErrorHandler) {
            next();
          } else {
            handler(req, res, next);
          }
        }
      } catch (catchErr) {
        next(catchErr);
      }
    };

    return next();
  }

  return function handleRequest(req, res, next) {
    try {
      const context = prepareContext(req, res);
      const parentNext = typeof next === "function" ? next : null;
      const router = server.router || server;
      const matches = router.find(context.method, context.path) || [];
      executeChain(matches, context, parentNext);
    } catch (err) {
      req.error = err;
      if (typeof next === "function") {
        next(err);
      } else {
        logger.error("Request failed ", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }
  };
}

