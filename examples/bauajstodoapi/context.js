import { createPubSub, MemoryDriver, client } from "bauajs";

// 1. Event-Driven Messaging Pub/Sub
export const pubsub = createPubSub(new MemoryDriver());

// 2. Outbound Request Resiliency (Circuit Breaker for Analytics)
export const analyticsBreaker = client.createCircuitBreaker({
  failureThreshold: 3,        // trip after 3 failures
  recoveryTimeout: 2000       // wait 2 seconds before transition to half-open
});

// Fallback logic for when the Analytics Service is down or circuit is open
export const analyticsFallback = (err) => {
  console.warn(`[Todo API] 🛡 Analytics service fallback triggered: ${err.message}`);
  return {
    json: async () => ({ fallback: true, error: err.message }),
    status: 200,
    ok: true
  };
};
