export function cors(options = {}) {
  const defaultMethods = "GET,HEAD,PUT,PATCH,POST,DELETE";

  return function corsMiddleware(req, res, next) {
    const originHeader = req.headers["origin"];
    if (!originHeader) {
      // Not a CORS request, proceed
      return next();
    }

    // 1. Resolve Origin
    let allowedOrigin = null;
    const optOrigin = options.origin;
    
    if (!optOrigin || optOrigin === "*") {
      allowedOrigin = "*";
    } else if (typeof optOrigin === "string") {
      allowedOrigin = optOrigin;
    } else if (Array.isArray(optOrigin)) {
      if (optOrigin.includes(originHeader)) {
        allowedOrigin = originHeader;
      }
    } else if (optOrigin instanceof RegExp) {
      if (optOrigin.test(originHeader)) {
        allowedOrigin = originHeader;
      }
    } else if (typeof optOrigin === "function") {
      try {
        const allowed = optOrigin(originHeader);
        if (allowed) {
          allowedOrigin = originHeader;
        }
      } catch (err) {
        return next(err);
      }
    }

    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      if (allowedOrigin !== "*") {
        res.setHeader("Vary", "Origin");
      }
    }

    // 2. Credentials
    if (options.credentials === true) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // 3. Exposed Headers
    if (options.exposedHeaders) {
      const exposed = Array.isArray(options.exposedHeaders)
        ? options.exposedHeaders.join(",")
        : options.exposedHeaders;
      res.setHeader("Access-Control-Expose-Headers", exposed);
    }

    // 4. Preflight OPTIONS request handling
    if (req.method === "OPTIONS") {
      // Methods
      const methods = Array.isArray(options.methods)
        ? options.methods.join(",")
        : (options.methods || defaultMethods);
      res.setHeader("Access-Control-Allow-Methods", methods);

      // Allowed Headers
      let allowedHeaders = options.allowedHeaders;
      if (!allowedHeaders) {
        allowedHeaders = req.headers["access-control-request-headers"];
      }
      if (allowedHeaders) {
        const headers = Array.isArray(allowedHeaders)
          ? allowedHeaders.join(",")
          : allowedHeaders;
        res.setHeader("Access-Control-Allow-Headers", headers);
      }

      // Max Age
      if (options.maxAge !== undefined) {
        res.setHeader("Access-Control-Max-Age", String(options.maxAge));
      }

      res.statusCode = 204;
      res.setHeader("Content-Length", "0");
      res.end();
      return;
    }

    next();
  };
}
