import { createServer, json, validateRequest } from "../index.js";

const app = createServer();

// Add request body parser
app.use(json());

// Define validation schema
const createUserSchema = {
  // 1. Validate route path parameters
  params: {
    tenantId: { type: "number", required: true }
  },
  // 2. Validate query parameters
  query: {
    notify: { type: "boolean", default: true },
    role: { type: "string", default: "user" }
  },
  // 3. Validate body parameters
  body: {
    username: { type: "string", required: true, pattern: /^[a-z0-9_]{3,16}$/ },
    email: { type: "string", required: true, pattern: /^\S+@\S+\.\S+$/ },
    age: { type: "number", required: true, min: 18, max: 100 },
    tags: { type: "array" }
  }
};

// Route using the validation middleware
app.post("/tenants/:tenantId/users", validateRequest(createUserSchema), (req, res) => {
  console.log("\n[Server] Request received and passed validation!");
  console.log("tenantId (Type):", req.params.tenantId, `(${typeof req.params.tenantId})`);
  console.log("notify (Type):", req.query.notify, `(${typeof req.query.notify})`);
  console.log("role:", req.query.role);
  console.log("body:", req.body);

  res.json({
    success: true,
    message: "User created successfully!",
    data: {
      tenantId: req.params.tenantId,
      notify: req.query.notify,
      role: req.query.role,
      user: req.body
    }
  });
});

app.runServerOn(3000, () => {
  console.log("Validation example server running at http://localhost:3000");
  console.log("\nTo test a SUCCESSFUL request:");
  console.log(`curl -X POST "http://localhost:3000/tenants/10/users?notify=false" \\
  -H "Content-Type: application/json" \\
  -d '{"username":"john_doe","email":"john@example.com","age":28,"tags":["dev","backend"]}'`);

  console.log("\nTo test a FAILED request:");
  console.log(`curl -X POST "http://localhost:3000/tenants/abc/users" \\
  -H "Content-Type: application/json" \\
  -d '{"username":"JOHN","email":"invalid-email","age":17}'`);
});
