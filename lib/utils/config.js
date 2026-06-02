import fs from "fs";
import path from "path";

export function loadEnvFile(filepath = ".env") {
  try {
    const resolvedPath = path.resolve(process.cwd(), filepath);
    if (!fs.existsSync(resolvedPath)) {
      return;
    }

    const content = fs.readFileSync(resolvedPath, "utf-8");
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const firstEquals = trimmed.indexOf("=");
      if (firstEquals === -1) continue;

      const key = trimmed.slice(0, firstEquals).trim();
      let val = trimmed.slice(firstEquals + 1).trim();

      // Strip optional quotes
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      // Respect pre-existing environment variables (system env overrides .env)
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn(`[Config] Failed to load env file: ${err.message}`);
  }
}

export function validateValue(key, value, rule) {
  if (value === undefined || value === null || value === "") {
    if (rule.required) {
      throw new Error(`Missing required environment variable "${key}"`);
    }
    return rule.default !== undefined ? rule.default : undefined;
  }

  if (rule.type === "number") {
    const parsed = Number(value);
    if (isNaN(parsed)) {
      throw new Error(`"${key}" must be a number (received "${value}")`);
    }
    return parsed;
  }

  if (rule.type === "boolean") {
    const lower = String(value).toLowerCase();
    if (lower === "true" || lower === "1" || value === true) {
      return true;
    }
    if (lower === "false" || lower === "0" || value === false) {
      return false;
    }
    throw new Error(`"${key}" must be a boolean (received "${value}")`);
  }

  return String(value);
}

export function validateConfig(schema, source = process.env) {
  const config = {};
  const errors = [];

  for (const [key, rule] of Object.entries(schema)) {
    try {
      const rawValue = source[key];
      config[key] = validateValue(key, rawValue, rule);
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid Configuration:\n- ${errors.join("\n- ")}`);
  }

  return config;
}

export function loadAndValidate(schema, opts = {}) {
  const envPath = opts.path || ".env";
  loadEnvFile(envPath);
  return validateConfig(schema);
}
