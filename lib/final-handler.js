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

  function buildMiddleware(context, parentNext) {
    const routeHandlers = server.router.find(context.method, context.path) || {
      handlers: [],
      params: {},
    };
    
    // Combine existing params (from parent app) with newly matched sub-app params
    context.req.params = Object.assign({}, context.req.params || {}, routeHandlers.params || {});

    let fallback;
    if (typeof parentNext === "function") {
      fallback = function(req, res, next) {
        parentNext();
      };
    } else {
      fallback = server.noMatches.bind(server);
    }

    return [
      ...routeHandlers.handlers,
      fallback,
    ];
  }

  function executeChain(middlewares, context) {
    const { req, res } = context;
    let index = 0;

    const next = (err) => {
      if (err) {
        return server.error(err, req, res, next);
      }
      if (index >= middlewares.length) {
        return;
      }
      const middleware = middlewares[index++];
      try {
        middleware(req, res, next);
      } catch (err) {
        next(err);
      }
    };

    return next();
  }

  return function handleRequest(req, res, next) {
    try {
      const context = prepareContext(req, res);
      const parentNext = typeof next === "function" ? next : null;
      const middlewares = buildMiddleware(context, parentNext);
      executeChain(middlewares, context);
    } catch (err) {
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
