export function errorOccured(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.status ? err.message : "Internal Server Error";

  console.error(`[Error] Request ${req.method} ${req.path || req.url} failed with status ${status}:`, err);

  if (!res.writableEnded) {
    if (typeof res.status === "function") {
      res.status(status).send(message);
    } else {
      res.statusCode = status;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(message);
    }
  }
}
