function sanitizeObject(obj, keysToMask) {
  if (!obj || !keysToMask || keysToMask.length === 0) return obj;
  const sanitized = Object.assign({}, obj);
  keysToMask.forEach((key) => {
    const lowerKey = key.toLowerCase();
    for (const k of Object.keys(sanitized)) {
      if (k.toLowerCase() === lowerKey) {
        sanitized[k] = "[MASKED]";
      }
    }
  });
  return sanitized;
}

export function logger(opts = {}) {
  const sanitizeHeaders = opts.sanitizeHeaders || ["authorization", "cookie", "set-cookie"];
  const sanitizeBodyFields = opts.sanitizeBodyFields || [];

  return function loggerMiddleware(req, res, next) {
    const startTime = process.hrtime();

    res.on("finish", () => {
      const diff = process.hrtime(startTime);
      const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      const reqHeaders = sanitizeObject(req.headers, sanitizeHeaders);
      const reqBody = sanitizeObject(req.body, sanitizeBodyFields);

      const logData = {
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? "error" : (res.statusCode >= 400 ? "warn" : "info"),
        message: req.error ? `Request failed: ${req.error.message}` : "Request completed",
        request: {
          id: req.id,
          method: req.method,
          path: req.path,
          ip: req.ip || req.socket.remoteAddress,
          headers: reqHeaders,
          body: reqBody,
        },
        response: {
          statusCode: res.statusCode,
          durationMs: parseFloat(durationMs),
        },
      };

      if (req.error) {
        logData.error = {
          message: req.error.message,
          stack: req.error.stack,
        };
      }

      console.log(JSON.stringify(logData));
    });

    next();
  };
}

