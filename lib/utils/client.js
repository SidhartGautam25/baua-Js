import crypto from "crypto";
import { globalRegistry, globalLoadBalancer } from "./discovery.js";

export function injectCorrelationId(headers, correlationId, incomingHeaders = {}) {
  const newHeaders = Object.assign({}, headers);
  if (correlationId) {
    newHeaders["X-Correlation-ID"] = correlationId;
    newHeaders["X-Request-ID"] = correlationId;
  }

  // Support W3C traceparent header propagation
  const traceparent = incomingHeaders["traceparent"] || incomingHeaders["Traceparent"];
  if (traceparent) {
    newHeaders["traceparent"] = traceparent;
  } else if (correlationId) {
    const cleanId = correlationId.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
    const spanId = crypto.randomBytes
      ? crypto.randomBytes(8).toString("hex")
      : Math.random().toString(16).substring(2, 10).padEnd(16, "0");
    newHeaders["traceparent"] = `00-${cleanId}-${spanId}-01`;
  }
  return newHeaders;
}

export async function withTimeout(fetchFn, timeoutMs) {
  if (!timeoutMs) return fetchFn();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(controller.signal);
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function retryRequest(fetchFn, retries = 3, delay = 100) {
  let attempt = 0;
  while (true) {
    try {
      return await fetchFn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) {
        throw err;
      }
      const backoffDelay = delay * Math.pow(2, attempt);
      console.warn(`[Client] Request failed. Retrying in ${backoffDelay}ms... (Attempt ${attempt}/${retries})`);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }
}

export class CircuitBreaker {
  constructor(opts = {}) {
    this.failureThreshold = opts.failureThreshold || 5;
    this.recoveryTimeout = opts.recoveryTimeout || 10000;
    this.state = "CLOSED"; // CLOSED, OPEN, HALF-OPEN
    this.consecutiveFailures = 0;
    this.nextAttemptTime = 0;
  }

  async execute(fetchFn, fallbackFn) {
    const now = Date.now();
    
    if (this.state === "OPEN") {
      if (now > this.nextAttemptTime) {
        this.state = "HALF-OPEN";
      } else {
        if (typeof fallbackFn === "function") {
          return fallbackFn(new Error("Circuit Breaker is OPEN"));
        }
        throw new Error("Circuit Breaker is OPEN");
      }
    }

    try {
      const result = await fetchFn();
      if (this.state === "HALF-OPEN") {
        this.state = "CLOSED";
        this.consecutiveFailures = 0;
      }
      return result;
    } catch (err) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold || this.state === "HALF-OPEN") {
        this.state = "OPEN";
        this.nextAttemptTime = Date.now() + this.recoveryTimeout;
        console.warn(`[Client] Circuit Breaker tripped to OPEN. Next attempt in ${this.recoveryTimeout}ms.`);
      }
      if (typeof fallbackFn === "function") {
        return fallbackFn(err);
      }
      throw err;
    }
  }
}

export function createCircuitBreaker(opts = {}) {
  return new CircuitBreaker(opts);
}

export async function request(req, url, options = {}) {
  const {
    timeout: timeoutMs = 5000,
    retries = 3,
    retryDelay = 100,
    headers = {},
    circuitBreaker,
    fallback,
    registry = globalRegistry,
    loadBalancer = globalLoadBalancer,
    lbStrategy = "round-robin",
    ...fetchOptions
  } = options;

  let finalUrl = url;
  let resolvedInstance = null;

  try {
    const parsedUrl = new URL(url);
    const serviceName = parsedUrl.hostname;
    const instances = registry.resolve(serviceName);

    if (instances && instances.length > 0) {
      resolvedInstance = loadBalancer.select(serviceName, lbStrategy);
      loadBalancer.incrementConnections(resolvedInstance);

      const resolvedParsed = new URL(resolvedInstance);
      parsedUrl.protocol = resolvedParsed.protocol;
      parsedUrl.host = resolvedParsed.host;
      finalUrl = parsedUrl.toString();
    }
  } catch (err) {
    // Fail-safe: if not a valid URL or host not in registry, use original URL
  }

  const correlationId = req ? req.id : null;
  const incomingHeaders = req ? req.headers : {};
  const finalHeaders = injectCorrelationId(headers, correlationId, incomingHeaders);

  const fetchTask = (signal) => {
    return fetch(finalUrl, {
      ...fetchOptions,
      headers: finalHeaders,
      signal,
    });
  };

  const timeoutTask = () => withTimeout(fetchTask, timeoutMs);
  const runTask = () => retryRequest(timeoutTask, retries, retryDelay);

  const decrementConnections = () => {
    if (resolvedInstance) {
      loadBalancer.decrementConnections(resolvedInstance);
    }
  };

  let resultPromise;
  if (circuitBreaker) {
    resultPromise = circuitBreaker.execute(runTask, fallback);
  } else {
    resultPromise = runTask();
  }

  return resultPromise.then(
    (res) => {
      decrementConnections();
      return res;
    },
    (err) => {
      decrementConnections();
      throw err;
    }
  );
}

