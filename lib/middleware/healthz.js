export function healthz(checks = {}) {
  return async function healthzMiddleware(req, res) {
    const results = {};
    let status = 200;

    for (const [name, checkFn] of Object.entries(checks)) {
      try {
        const result = await checkFn();
        results[name] = { status: "OK", detail: result || null };
      } catch (err) {
        status = 503;
        results[name] = { status: "FAIL", error: err.message || String(err) };
      }
    }

    const systemInfo = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };

    res.status(status).json({
      status: status === 200 ? "healthy" : "unhealthy",
      checks: results,
      system: systemInfo,
    });
  };
}
