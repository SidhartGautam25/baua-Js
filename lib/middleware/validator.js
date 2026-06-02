function validateField(location, key, value, rule, errors) {
  // If the value is undefined, null or empty string
  if (value === undefined || value === null || value === "") {
    if (rule.required) {
      errors.push({ location, field: key, issue: "Missing required field" });
      return;
    }
    return rule.default !== undefined ? rule.default : undefined;
  }

  let coerced = value;

  if (rule.type === "number") {
    coerced = Number(value);
    if (isNaN(coerced)) {
      errors.push({ location, field: key, issue: "Must be a number" });
      return;
    }
    if (rule.min !== undefined && coerced < rule.min) {
      errors.push({ location, field: key, issue: `Must be at least ${rule.min}` });
      return;
    }
    if (rule.max !== undefined && coerced > rule.max) {
      errors.push({ location, field: key, issue: `Must be at most ${rule.max}` });
      return;
    }
  } else if (rule.type === "boolean") {
    const lower = String(value).toLowerCase();
    if (lower === "true" || lower === "1" || value === true) {
      coerced = true;
    } else if (lower === "false" || lower === "0" || value === false) {
      coerced = false;
    } else {
      errors.push({ location, field: key, issue: "Must be a boolean" });
      return;
    }
  } else if (rule.type === "array") {
    if (!Array.isArray(value)) {
      errors.push({ location, field: key, issue: "Must be an array" });
      return;
    }
  } else if (rule.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push({ location, field: key, issue: "Must be an object" });
      return;
    }
  } else if (rule.type === "string") {
    coerced = String(value);
    if (rule.pattern instanceof RegExp) {
      if (!rule.pattern.test(coerced)) {
        errors.push({ location, field: key, issue: "Must match pattern" });
        return;
      }
    }
  }

  if (typeof rule.validate === "function") {
    try {
      const customRes = rule.validate(coerced);
      if (customRes === false) {
        errors.push({ location, field: key, issue: "Custom validation failed" });
        return;
      } else if (typeof customRes === "string") {
        errors.push({ location, field: key, issue: customRes });
        return;
      }
    } catch (err) {
      errors.push({ location, field: key, issue: err.message });
      return;
    }
  }

  return coerced;
}

export function validateRequest(schema = {}) {
  return function validationMiddleware(req, res, next) {
    const errors = [];
    const targets = ["body", "query", "params"];

    for (const target of targets) {
      const targetSchema = schema[target];
      if (!targetSchema) continue;

      const input = req[target] || {};
      const validatedTarget = {};

      for (const [key, rule] of Object.entries(targetSchema)) {
        const value = input[key];
        const validatedValue = validateField(target, key, value, rule, errors);
        if (validatedValue !== undefined) {
          validatedTarget[key] = validatedValue;
        }
      }

      if (errors.length === 0) {
        req[target] = validatedTarget;
      }
    }

    if (errors.length > 0) {
      res.statusCode = 400;
      return res.json({
        error: "Bad Request",
        message: "Validation Failed",
        details: errors,
      });
    }

    next();
  };
}
