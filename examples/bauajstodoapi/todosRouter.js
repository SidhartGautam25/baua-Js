import { Router, validateRequest, client } from "bauajs";
import { store } from "./todosStore.js";
import { pubsub, analyticsBreaker, analyticsFallback } from "./context.js";

export const todosRouter = new Router();

// Validation Schemas
const getTodosSchema = {
  query: {
    completed: { type: "boolean", required: false }
  }
};

const getTodoByIdSchema = {
  params: {
    id: { type: "number", required: true }
  }
};

const createTodoSchema = {
  body: {
    title: { type: "string", required: true },
    userId: { type: "number", required: true },
    completed: { type: "boolean", default: false }
  }
};

const updateTodoSchema = {
  params: {
    id: { type: "number", required: true }
  },
  body: {
    title: { type: "string", required: false },
    userId: { type: "number", required: false },
    completed: { type: "boolean", required: false }
  }
};

const deleteTodoSchema = {
  params: {
    id: { type: "number", required: true }
  }
};

// Helper: Verify User Existence via Load-Balanced User Service Cluster
async function verifyUser(req, res, userId) {
  try {
    // Inter-service HTTP call to validate user existence
    // 'user-service' hostname is resolved dynamically using registry & globalLoadBalancer
    const userRes = await client.request(req, `http://user-service/users/${userId}`, {
      method: "GET",
      retries: 2,
      retryDelay: 50
    });

    if (userRes.status === 404) {
      res.statusCode = 400;
      res.json({ error: "Bad Request", message: `User with ID ${userId} does not exist.` });
      return null;
    }

    if (!userRes.ok) {
      res.statusCode = 502;
      res.json({ error: "Bad Gateway", message: `User Service returned error code: ${userRes.status}` });
      return null;
    }

    const userData = await userRes.json();
    console.log(`[Todo API] User verified: ${userData.name} (${userData.email})`);
    return userData;
  } catch (err) {
    res.statusCode = 503;
    res.json({ error: "Service Unavailable", message: `Failed to communicate with User Service: ${err.message}` });
    return null;
  }
}

// Helper: Record Action in Flaky Analytics Service with Circuit Breaker Protection
async function recordAnalytics(req, action, todoId) {
  try {
    await client.request(req, "http://analytics-service/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, todoId }),
      circuitBreaker: analyticsBreaker,
      fallback: analyticsFallback,
      timeout: 1000,
      retries: 2,
      retryDelay: 50
    });
  } catch (err) {
    // Fallback takes care of logging/ignoring this error
  }
}

// Route Handlers
todosRouter.get("/", validateRequest(getTodosSchema), (req, res) => {
  const todos = store.getAll(req.query.completed);
  res.json(todos);
});

todosRouter.get("/:id", validateRequest(getTodoByIdSchema), (req, res) => {
  const todoId = req.params.id;
  const todo = store.get(todoId);
  if (!todo) {
    res.statusCode = 404;
    return res.json({ error: "Not Found", message: `Todo with ID ${todoId} not found` });
  }
  res.json(todo);
});

todosRouter.post("/", validateRequest(createTodoSchema), async (req, res) => {
  const { title, userId, completed } = req.body;

  // 1. Verify User existence (Service Discovery / Load Balancing call)
  const user = await verifyUser(req, res, userId);
  if (!user) return; // Response handled by verifyUser

  // 2. Create Todo
  const todo = store.create({ title, userId, completed });

  // 3. Publish Event (Event-Driven messaging with Tracing Propagation)
  pubsub.publish("todo.created", todo, { parent: req });

  // 4. Record Action (Resilient Client-Side Circuit Breaker call)
  await recordAnalytics(req, "create", todo.id);

  res.statusCode = 201;
  res.json(todo);
});

todosRouter.put("/:id", validateRequest(updateTodoSchema), async (req, res) => {
  const todoId = req.params.id;
  const existing = store.get(todoId);
  if (!existing) {
    res.statusCode = 404;
    return res.json({ error: "Not Found", message: `Todo with ID ${todoId} not found` });
  }

  // If userId is changing, verify the new User
  if (req.body.userId !== undefined && req.body.userId !== existing.userId) {
    const user = await verifyUser(req, res, req.body.userId);
    if (!user) return;
  }

  // Update Todo
  const wasCompleted = existing.completed;
  const updated = store.update(todoId, req.body);

  // If toggled from incomplete to complete, publish event
  if (!wasCompleted && updated.completed) {
    pubsub.publish("todo.completed", updated, { parent: req });
  }

  // Record Action
  await recordAnalytics(req, "update", todoId);

  res.json(updated);
});

todosRouter.delete("/:id", validateRequest(deleteTodoSchema), async (req, res) => {
  const todoId = req.params.id;
  const exists = store.get(todoId);
  if (!exists) {
    res.statusCode = 404;
    return res.json({ error: "Not Found", message: `Todo with ID ${todoId} not found` });
  }

  store.delete(todoId);

  // Record Action
  await recordAnalytics(req, "delete", todoId);

  res.json({ success: true, message: `Todo with ID ${todoId} deleted` });
});
