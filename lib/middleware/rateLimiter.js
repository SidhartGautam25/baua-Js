class MemoryStore {
  constructor(cleanupMs) {
    this.store = new Map();
    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.store.entries()) {
        if (now > record.windowResetTime) {
          this.store.delete(key);
        }
      }
    }, cleanupMs).unref();
  }
  get(key) {
    return this.store.get(key);
  }
  set(key, record) {
    this.store.set(key, record);
  }
}

export function rateLimiter(opts = {}) {
  const limit = opts.limit || 60; // 60 requests
  const windowMs = opts.windowMs || 60000; // 1 minute window
  const store = opts.store || new MemoryStore(windowMs);
  const keyGenerator = opts.keyGenerator || ((req) => req.ip || "unknown");

  return async function rateLimiterMiddleware(req, res, next) {
    try {
      const key = keyGenerator(req);
      const now = Date.now();
      let clientRecord = await store.get(key);

      if (!clientRecord || now > clientRecord.windowResetTime) {
        clientRecord = {
          count: 0,
          windowResetTime: now + windowMs,
        };
      }

      clientRecord.count += 1;
      await store.set(key, clientRecord);

      const remaining = Math.max(0, limit - clientRecord.count);
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(clientRecord.windowResetTime / 1000));

      if (clientRecord.count > limit) {
        res.status(429).send("Too Many Requests");
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

