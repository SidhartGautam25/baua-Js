export function startNotificationWorker(pubsub) {
  console.log("[Notification Worker] Background event consumer active.");

  pubsub.subscribe("todo.created", (payload, context) => {
    console.log(`\n--- [Notification Worker] ✉ Async Event Received: "todo.created" ---`);
    console.log(`Payload:`, payload);
    console.log(`Correlation ID (Propagated):`, context.id);
    console.log(`Traceparent (Propagated):`, context.headers.traceparent);
    console.log(`-----------------------------------------------------------\n`);
  });

  pubsub.subscribe("todo.completed", (payload, context) => {
    console.log(`\n--- [Notification Worker] ✉ Async Event Received: "todo.completed" ---`);
    console.log(`Payload:`, payload);
    console.log(`Correlation ID (Propagated):`, context.id);
    console.log(`Traceparent (Propagated):`, context.headers.traceparent);
    console.log(`-------------------------------------------------------------\n`);
  });
}
