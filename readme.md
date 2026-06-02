# BauaJS (formerly basic-tiny-server)

BauaJS is a zero-dependency, ultra-lightweight, and production-grade microservices framework for Node.js. It delivers an Express-like developer experience while embedding native architectural patterns critical to distributed systems—including input validation, observability, resilience policies, distributed tracing, client-side load balancing, and messaging.

---

## Key Features

*   🚀 **High-Performance Routing**: Full support for parameters, wildcard matching, `next('route')` skip logic, and modular nested sub-routers.
*   🛡️ **Resilience Middleware**: Native request rate limiting, payload body parser limits, customizable request timeouts, and client-side HTTP request retries with exponential backoff.
*   🔌 **Circuit Breaker**: Client-side circuit breaker state machine (`CLOSED`, `OPEN`, `HALF-OPEN`) with configurable thresholds and fallback support.
*   🔍 **Observability & Distributed Tracing**: Automatic request Correlation ID tracking and W3C `traceparent` propagation across both HTTP and asynchronous boundaries.
*   📊 **Prometheus Metrics**: Dependency-free HTTP metrics collector (active connections, total request counts, latency histograms) exposing metrics at `/metrics`.
*   📬 **Event-Driven Messaging**: Pluggable Pub/Sub wrapper propagating tracing context across async message queues.
*   ⚖️ **Client-Side Load Balancing & Service Discovery**: Service registry with background health-check pinging (`/healthz`) and load-balancing strategies (`round-robin`, `random`, `least-connections`).
*   🔒 **Helmet Security Headers**: Zero-dependency security headers middleware protecting against common web exploits.

---

## Installation

```bash
npm install bauajs
```

---

## Quick Start

Create a secured, monitored HTTP server in a single file:

```javascript
import { createServer, json, helmet, logger } from "bauajs";

const app = createServer();

// Mount core security, parsing, and logging middlewares
app.use(helmet());
app.use(json({ limit: 100 * 1024 })); // 100KB limit
app.use(logger);

// Standard GET route
app.get("/api/hello", (req, res) => {
  res.json({ message: "Welcome to BauaJS!" });
});

// Start the server
app.runServerOn(3000, () => {
  console.log("BauaJS server running on http://localhost:3000");
});
```

---

## Detailed Features & API Reference

### 1. Request Input Validation

Secure endpoints by validating incoming fields. Invalid requests return a structured `400 Bad Request` payload:

```javascript
import { validateRequest } from "bauajs";

const userSchema = {
  params: {
    userId: { type: "number", required: true }
  },
  body: {
    username: { type: "string", required: true, pattern: /^[a-zA-Z0-9]+$/ },
    email: { type: "string", required: true },
    age: { type: "number", min: 18, max: 120 }
  }
};

app.post("/users/:userId", json(), validateRequest(userSchema), (req, res) => {
  // Fields are validated and type-coerced (e.g. req.params.userId is a Number)
  res.json({ status: "created", user: req.body });
});
```

### 2. Prometheus Metrics

Collect HTTP metrics without external dependencies like `prom-client`:

```javascript
import { metrics } from "bauajs";

// Mount metrics middleware
app.use(metrics());

// Exposes standardized prometheus metrics at: http://localhost:3000/metrics
```

### 3. Event-Driven Messaging (Pub/Sub) with Context Propagation

Forward requests to worker processes while keeping the distributed trace intact:

```javascript
import { createPubSub, MemoryDriver } from "bauajs";

const pubsub = createPubSub(new MemoryDriver());

// 1. Publisher (e.g., inside an HTTP route)
app.post("/orders", (req, res) => {
  const order = { id: "ord_1" };
  // Pass req as the parent context to propagate trace headers
  pubsub.publish("order.created", order, { parent: req });
  res.sendStatus(201);
});

// 2. Subscriber
pubsub.subscribe("order.created", async (payload, context) => {
  console.log("Correlation ID preserved:", context.id);
  console.log("Traceparent preserved:", context.headers.traceparent);
  
  // Forward context to downstream APIs using the client
  await client.request(context, "http://inventory-service/reserve");
});
```

### 4. Service Discovery & Client-Side Load Balancing

Register service instances dynamically and route HTTP client requests using smart strategies:

```javascript
import { registerServiceInstance, client } from "bauajs";

// Register healthy target instances of 'user-service'
registerServiceInstance("user-service", "http://localhost:3001");
registerServiceInstance("user-service", "http://localhost:3002");

app.get("/users", async (req, res) => {
  // Hostname 'user-service' is intercepted and load-balanced
  const response = await client.request(req, "http://user-service/api/users", {
    lbStrategy: "least-connections" // options: 'round-robin', 'random', 'least-connections'
  });
  const data = await response.json();
  res.json(data);
});
```

### 5. Client-Side Resiliency (Circuit Breaker & Retries)

Ensure service durability using circuit breakers and retries on outbound requests:

```javascript
import { client, createCircuitBreaker } from "bauajs";

const breaker = createCircuitBreaker({
  failureThreshold: 3,
  recoveryTimeout: 5000
});

const fallback = (err) => {
  return new Response(JSON.stringify({ fallback: true }), { status: 200 });
};

app.get("/data", async (req, res) => {
  const response = await client.request(req, "http://flaky-service/api", {
    circuitBreaker: breaker,
    fallback: fallback,
    retries: 3,
    retryDelay: 100 // exponential backoff
  });
  res.json(await response.json());
});
```

### 6. Security Headers (Helmet)

Apply Helmet-like secure response headers instantly:

```javascript
import { helmet } from "bauajs";

// Mount with custom configuration overrides
app.use(
  helmet({
    "X-Frame-Options": "DENY", // Custom override
    "X-DNS-Prefetch-Control": false // Disable a header
  })
);
```

---

## Run Tests

BauaJS comes with a comprehensive integration and unit test suite verifying all framework capabilities:

```bash
npm test
```

---

## Contributing

We welcome pull requests. For major architectural modifications, please open an issue first to discuss your proposed updates.

---

## License

[MIT](LICENSE)
