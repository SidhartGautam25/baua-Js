import { createServer, createPubSub, MemoryDriver, client } from "../index.js";

const app = createServer();
const pubsub = createPubSub(new MemoryDriver());

// 1. HTTP Endpoint (Publisher)
// Receives HTTP request, extracts/generates tracing headers, and publishes an event
app.post("/orders", (req, res) => {
  console.log("\n--- [Publisher HTTP API] ---");
  console.log("Correlation ID:", req.id);
  console.log("Traceparent:", req.headers.traceparent);

  const order = { id: "ord_100", amount: 250 };

  // Publish event, passing the current request as the parent context
  pubsub.publish("order.created", order, { parent: req });

  res.json({ success: true, message: "Order placed. Event published!" });
});

// 2. Async Event Subscriber
// Subscribes to the event, receives the payload and the propagated EventContext
pubsub.subscribe("order.created", async (payload, context) => {
  console.log("\n--- [Subscriber Queue Listener] ---");
  console.log("Event Received:", payload);
  console.log("Correlation ID:", context.id);
  console.log("Traceparent:", context.headers.traceparent);
  console.log("Propagating context to downstream notification service...");

  // Send a request to the notification service, forwarding the event context
  try {
    const res = await client.request(context, "http://localhost:3000/notify", {
      method: "POST",
      body: JSON.stringify({ message: `Order ${payload.id} created!` })
    });
    const data = await res.json();
    console.log("Notification Response:", data);
  } catch (err) {
    console.error("Downstream request failed:", err.message);
  }
});

// 3. Downstream HTTP Endpoint (Notification Service)
// Receives the HTTP call from the queue subscriber and verifies context preservation
app.post("/notify", (req, res) => {
  console.log("\n--- [Downstream Notification Service HTTP API] ---");
  console.log("Correlation ID:", req.id);
  console.log("Traceparent:", req.headers.traceparent);

  res.json({ success: true, received: true });
});

// Start the server on port 3000
app.runServerOn(3000, () => {
  console.log("Messaging example server running at http://localhost:3000");
  console.log("\nTo trigger the flow and test context propagation, run:");
  console.log("  curl -X POST http://localhost:3000/orders");
});
