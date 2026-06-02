export function healthz(options = {}) {
  let type = "readiness";
  let checks = {};
  let includeSystem = true;

  if (options.type || options.checks) {
    type = options.type || "readiness";
    checks = options.checks || {};
    includeSystem = options.includeSystem !== false;
  } else {
    checks = options;
    type = Object.keys(checks).length === 0 ? "liveness" : "readiness";
  }

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

    const systemInfo = includeSystem ? {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    } : undefined;

    const responseBody = {
      status: status === 200 ? "healthy" : "unhealthy",
      type,
      timestamp: new Date().toISOString(),
    };

    if (Object.keys(results).length > 0) {
      responseBody.checks = results;
    }
    if (systemInfo) {
      responseBody.system = systemInfo;
    }

    res.status(status).json(responseBody);
  };
}

