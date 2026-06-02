export function getClientIp(req) {
  return req.socket.remoteAddress || "unknown";
}

export function checkRateLimit(store, ip, limit, windowMs) {
  const now = Date.now();
  let clientRecord = store.get(ip);

  if (!clientRecord || now > clientRecord.windowResetTime) {
    clientRecord = {
      count: 0,
      windowResetTime: now + windowMs,
    };
  }

  clientRecord.count += 1;
  store.set(ip, clientRecord);

  return {
    limited: clientRecord.count > limit,
    currentCount: clientRecord.count,
    resetTime: clientRecord.windowResetTime,
  };
}

export function setRateLimitHeaders(res, count, limit, resetTime) {
  const remaining = Math.max(0, limit - count);
  res.setHeader("X-RateLimit-Limit", limit);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000));
}

export function rateLimiter(opts = {}) {
  const limit = opts.limit || 60; // 60 requests
  const windowMs = opts.windowMs || 60000; // 1 minute window
  const store = new Map();

  // Periodic cleanup of expired entries in memory store
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of store.entries()) {
      if (now > record.windowResetTime) {
        store.delete(ip);
      }
    }
  }, windowMs).unref();

  return function rateLimiterMiddleware(req, res, next) {
    const ip = getClientIp(req);
    const result = checkRateLimit(store, ip, limit, windowMs);

    setRateLimitHeaders(res, result.currentCount, limit, result.resetTime);

    if (result.limited) {
      res.status(429).send("Too Many Requests");
      return;
    }

    next();
  };
}
