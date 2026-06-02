import { config } from "../index.js";

// 1. Define schema
const schema = {
  PORT: { type: "number", default: 3000, required: true },
  DB_URL: { type: "string", required: true },
  ENABLE_LOGGING: { type: "boolean", default: false },
  OPTIONAL_API_KEY: { type: "string", default: "default-key" },
};

console.log("--- Loading and Validating Valid Config ---");
try {
  // Load and validate from `.env.test` file
  const parsedConfig = config(schema, { path: "examples/.env.test" });
  console.log("Configuration Loaded Successfully:", parsedConfig);
  console.log(`Port Type: ${typeof parsedConfig.PORT}`);
  console.log(`Logging Type: ${typeof parsedConfig.ENABLE_LOGGING}`);
} catch (err) {
  console.error("Failed to load config:", err.message);
}

console.log("\n--- Simulating Invalid Config (Fail-Fast) ---");
const invalidSchema = {
  ...schema,
  MISSING_SECRET: { type: "string", required: true },
  PORT: { type: "number", required: true }, // should be invalid if we inject a malformed number
};

try {
  // We'll override the source to simulate invalid environment values directly
  process.env.PORT = "not-a-number";
  config(invalidSchema, { path: "examples/.env.test" });
} catch (err) {
  console.log("Expected validation error occurred successfully:\n", err.message);
}
