export class PrometheusCollector {
  constructor(opts = {}) {
    this.buckets = opts.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    this.activeRequests = 0;
    
    // Structure: Map containing key: `${method}__${route}__${status}`
    this.requestsTotal = new Map();
    this.durationSum = new Map();
    this.durationBuckets = new Map(); // value: Array matching this.buckets length + 1 (for +Inf)
  }

  incActive() {
    this.activeRequests++;
  }

  decActive() {
    this.activeRequests--;
  }

  observe(method, route, status, durationSeconds) {
    const key = `${method}__${route}__${status}`;
    
    // 1. Increment total requests counter
    this.requestsTotal.set(key, (this.requestsTotal.get(key) || 0) + 1);

    // 2. Add to total duration sum
    this.durationSum.set(key, (this.durationSum.get(key) || 0) + durationSeconds);

    // 3. Increment cumulative duration buckets
    let counts = this.durationBuckets.get(key);
    if (!counts) {
      counts = new Array(this.buckets.length + 1).fill(0);
      this.durationBuckets.set(key, counts);
    }

    for (let i = 0; i < this.buckets.length; i++) {
      if (durationSeconds <= this.buckets[i]) {
        counts[i]++;
      }
    }
    // Increment the +Inf bucket
    counts[this.buckets.length]++;
  }

  expose() {
    const lines = [];

    // http_requests_active
    lines.push("# HELP http_requests_active Number of active HTTP requests currently in flight.");
    lines.push("# TYPE http_requests_active gauge");
    lines.push(`http_requests_active ${this.activeRequests}`);
    lines.push("");

    // http_requests_total
    lines.push("# HELP http_requests_total Total number of HTTP requests processed by method, route, and status.");
    lines.push("# TYPE http_requests_total counter");
    for (const [key, val] of this.requestsTotal.entries()) {
      const [method, route, status] = key.split("__");
      lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${val}`);
    }
    lines.push("");

    // http_request_duration_seconds
    lines.push("# HELP http_request_duration_seconds HTTP request latency distribution in seconds.");
    lines.push("# TYPE http_request_duration_seconds histogram");
    for (const [key, sum] of this.durationSum.entries()) {
      const [method, route, status] = key.split("__");
      const counts = this.durationBuckets.get(key);
      const total = this.requestsTotal.get(key);

      for (let i = 0; i < this.buckets.length; i++) {
        lines.push(`http_request_duration_seconds_bucket{method="${method}",route="${route}",status="${status}",le="${this.buckets[i]}"} ${counts[i]}`);
      }
      lines.push(`http_request_duration_seconds_bucket{method="${method}",route="${route}",status="${status}",le="+Inf"} ${counts[this.buckets.length]}`);
      lines.push(`http_request_duration_seconds_sum{method="${method}",route="${route}",status="${status}"} ${sum.toFixed(6)}`);
      lines.push(`http_request_duration_seconds_count{method="${method}",route="${route}",status="${status}"} ${total}`);
    }
    lines.push("");

    return lines.join("\n");
  }
}

export function createMetricsCollector(opts = {}) {
  return new PrometheusCollector(opts);
}

const defaultCollector = createMetricsCollector();

export function metrics(opts = {}) {
  const collector = opts.collector || defaultCollector;
  const metricsPath = opts.path || "/metrics";

  return function metricsMiddleware(req, res, next) {
    if (req.path === metricsPath && req.method === "GET") {
      res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      return res.end(collector.expose());
    }

    const startTime = process.hrtime();
    collector.incActive();

    const cleanup = () => {
      res.removeListener("finish", onFinish);
      res.removeListener("close", onClose);
    };

    const recordMetrics = () => {
      collector.decActive();
      const diff = process.hrtime(startTime);
      const durationSeconds = diff[0] + diff[1] * 1e-9;
      
      const status = res.statusCode;
      const method = req.method;
      // fallback to path or "not_found"
      const route = req.routePath || "not_found";

      collector.observe(method, route, status, durationSeconds);
    };

    let recorded = false;
    const onFinish = () => {
      if (recorded) return;
      recorded = true;
      recordMetrics();
      cleanup();
    };

    const onClose = () => {
      if (recorded) return;
      recorded = true;
      recordMetrics();
      cleanup();
    };

    res.on("finish", onFinish);
    res.on("close", onClose);

    next();
  };
}
