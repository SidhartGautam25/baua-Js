export class ServiceRegistry {
  constructor(opts = {}) {
    this.services = new Map(); // serviceName -> Array of { url, healthy }
    this.healthCheckInterval = opts.healthCheckInterval || 0; // 0 means disabled
    this.healthCheckPath = opts.healthCheckPath || "/healthz";
    this.timer = null;

    if (this.healthCheckInterval > 0) {
      this.startHealthChecks();
    }
  }

  register(serviceName, url) {
    let instances = this.services.get(serviceName);
    if (!instances) {
      instances = [];
      this.services.set(serviceName, instances);
    }
    if (!instances.some((i) => i.url === url)) {
      instances.push({ url, healthy: true });
    }
  }

  deregister(serviceName, url) {
    const instances = this.services.get(serviceName);
    if (instances) {
      const idx = instances.findIndex((i) => i.url === url);
      if (idx !== -1) {
        instances.splice(idx, 1);
      }
      if (instances.length === 0) {
        this.services.delete(serviceName);
      }
    }
  }

  resolve(serviceName) {
    const instances = this.services.get(serviceName) || [];
    return instances.filter((i) => i.healthy).map((i) => i.url);
  }

  async checkHealth() {
    for (const [serviceName, instances] of this.services.entries()) {
      for (const instance of instances) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1000);
          const res = await fetch(`${instance.url}${this.healthCheckPath}`, {
            method: "GET",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          instance.healthy = res.status === 200;
        } catch (err) {
          instance.healthy = false;
        }
      }
    }
  }

  startHealthChecks() {
    this.stopHealthChecks();
    this.timer = setInterval(() => {
      this.checkHealth().catch(() => {});
    }, this.healthCheckInterval);
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  stopHealthChecks() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export class LoadBalancer {
  constructor(registry) {
    this.registry = registry;
    this.roundRobinIndexes = new Map(); // serviceName -> index
    this.activeConnections = new Map(); // url -> count
  }

  incrementConnections(url) {
    this.activeConnections.set(url, (this.activeConnections.get(url) || 0) + 1);
  }

  decrementConnections(url) {
    const count = this.activeConnections.get(url) || 0;
    this.activeConnections.set(url, Math.max(0, count - 1));
  }

  select(serviceName, strategy = "round-robin") {
    const instances = this.registry.resolve(serviceName);
    if (!instances || instances.length === 0) {
      throw new Error(`Service "${serviceName}" has no registered healthy instances`);
    }

    if (strategy === "random") {
      const idx = Math.floor(Math.random() * instances.length);
      return instances[idx];
    }

    if (strategy === "least-connections") {
      let minUrl = instances[0];
      let minVal = this.activeConnections.get(minUrl) || 0;

      for (let i = 1; i < instances.length; i++) {
        const url = instances[i];
        const val = this.activeConnections.get(url) || 0;
        if (val < minVal) {
          minVal = val;
          minUrl = url;
        }
      }
      return minUrl;
    }

    // Default: round-robin
    let idx = this.roundRobinIndexes.get(serviceName) || 0;
    if (idx >= instances.length) {
      idx = 0;
    }
    const selected = instances[idx];
    this.roundRobinIndexes.set(serviceName, (idx + 1) % instances.length);
    return selected;
  }
}

export const globalRegistry = new ServiceRegistry();
export const globalLoadBalancer = new LoadBalancer(globalRegistry);
export function registerServiceInstance(serviceName, url) {
  globalRegistry.register(serviceName, url);
}
export function deregisterServiceInstance(serviceName, url) {
  globalRegistry.deregister(serviceName, url);
}
