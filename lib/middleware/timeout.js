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

    const timer = setTimeout(() => {
      timedOut = true;
      handleTimeoutAction(req, res, opts.onTimeout);
    }, timeoutMs);

    registerTimerCleanup(res, timer);

    // Override next so it is a no-op if timeout has triggered
    const wrappedNext = (err) => {
      if (timedOut) return;
      next(err);
    };

    wrappedNext();
  };
}
