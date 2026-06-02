export function handleTimeoutAction(req, res, onTimeout) {
  if (typeof onTimeout === "function") {
    onTimeout(req, res);
  } else {
    res.status(504).send("Gateway Timeout");
  }
}

export function registerTimerCleanup(res, timer) {
  const cleanup = () => {
    clearTimeout(timer);
  };
  res.on("finish", cleanup);
  res.on("close", cleanup);
}

export function timeout(timeoutMs = 5000, opts = {}) {
  return function timeoutMiddleware(req, res, next) {
    let timedOut = false;

    const originalWrite = res.write;
    const originalEnd = res.end;
    const originalWriteHead = res.writeHead;

    const timer = setTimeout(() => {
      timedOut = true;
      handleTimeoutAction(req, res, opts.onTimeout);

      // Make subsequent response actions no-ops to prevent crashes
      res.write = () => false;
      res.end = () => res;
      res.writeHead = () => res;
      res.json = () => res;
      res.send = () => res;
    }, timeoutMs);

    const restore = () => {
      clearTimeout(timer);
      if (!timedOut) {
        res.write = originalWrite;
        res.end = originalEnd;
        res.writeHead = originalWriteHead;
      }
    };
    res.on("finish", restore);
    res.on("close", restore);

    // Override next so it is a no-op if timeout has triggered
    const wrappedNext = (err) => {
      if (timedOut) return;
      next(err);
    };

    wrappedNext();
  };
}

