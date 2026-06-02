import EventEmitter from "events";
import crypto from "crypto";

function extractContext(parent) {
  if (!parent) return null;

  let correlationId = null;
  let traceparent = null;

  if (typeof parent === "object") {
    correlationId = parent.id || parent.correlationId || (parent.headers && (parent.headers["x-correlation-id"] || parent.headers["x-request-id"] || parent.headers["X-Correlation-ID"]));
    traceparent = parent.traceparent || (parent.headers && (parent.headers["traceparent"] || parent.headers["Traceparent"]));
  }

  return { correlationId, traceparent };
}

function generateContext() {
  const correlationId = crypto.randomUUID();
  const cleanId = correlationId.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
  const spanId = crypto.randomBytes
    ? crypto.randomBytes(8).toString("hex")
    : Math.random().toString(16).substring(2, 10).padEnd(16, "0");
  const traceparent = `00-${cleanId}-${spanId}-01`;
  return { correlationId, traceparent };
}

export class MemoryDriver {
  constructor() {
    this.emitter = new EventEmitter();
  }

  async publish(topic, envelope) {
    // Simulate asynchronous broker boundary
    setImmediate(() => {
      this.emitter.emit(topic, envelope);
    });
  }

  async subscribe(topic, handler) {
    this.emitter.on(topic, handler);
  }
}

export class PubSub {
  constructor(driver = new MemoryDriver(), opts = {}) {
    this.driver = driver;
  }

  async publish(topic, payload, opts = {}) {
    const parent = opts.parent;
    let context = extractContext(parent);
    
    if (!context || !context.correlationId) {
      context = generateContext();
    }

    const envelope = {
      payload,
      metadata: {
        correlationId: context.correlationId,
        traceparent: context.traceparent,
        timestamp: Date.now()
      }
    };

    await this.driver.publish(topic, envelope);
    return envelope;
  }

  async subscribe(topic, handler) {
    await this.driver.subscribe(topic, (envelope) => {
      const metadata = envelope.metadata || {};
      
      const context = {
        id: metadata.correlationId || crypto.randomUUID(),
        headers: {
          "x-correlation-id": metadata.correlationId,
          "traceparent": metadata.traceparent
        },
        timestamp: metadata.timestamp,
        topic
      };

      try {
        handler(envelope.payload, context);
      } catch (err) {
        console.error(`[PubSub] Error in subscriber for topic "${topic}":`, err);
      }
    });
  }
}

export function createPubSub(driver, opts) {
  return new PubSub(driver, opts);
}
