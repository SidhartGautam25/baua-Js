export function logger() {
  return function loggerMiddleware(req, res, next) {
    const startTime = process.hrtime();

    res.on("finish", () => {
      const diff = process.hrtime(startTime);
      const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

      const logData = {
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Request completed",
        request: {
          id: req.id,
          method: req.method,
          path: req.path,
          ip: req.socket.remoteAddress,
        },
        response: {
          statusCode: res.statusCode,
          durationMs: parseFloat(durationMs),
        },
      };

      console.log(JSON.stringify(logData));
    });

    next();
  };
}
