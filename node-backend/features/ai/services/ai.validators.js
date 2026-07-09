function createAiValidationError(message, details = null) {
  const error = new Error(message);
  error.statusCode = 502;
  error.code = "AI_VALIDATION_ERROR";
  error.details = details;
  return error;
}

function formatPath(path, key) {
  return path === "$" ? `$.${key}` : `${path}.${key}`;
}

function validateSchema(schema, value, path = "$") {
  if (!schema || typeof schema !== "object") {
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    throw createAiValidationError(`AI response at ${path} must match an allowed enum value.`, {
      path,
      expected: schema.enum,
      actual: value,
    });
  }

  switch (schema.type) {
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw createAiValidationError(`AI response at ${path} must be an object.`, {
          path,
          expected: "object",
          actual: typeof value,
        });
      }

      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const key of required) {
        if (!(key in value)) {
          throw createAiValidationError(`AI response is missing required field ${formatPath(path, key)}.`, {
            path: formatPath(path, key),
          });
        }
      }

      const properties = schema.properties || {};
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in properties)) {
            throw createAiValidationError(`AI response contains unexpected field ${formatPath(path, key)}.`, {
              path: formatPath(path, key),
            });
          }
        }
      }

      for (const [key, childSchema] of Object.entries(properties)) {
        if (key in value) {
          validateSchema(childSchema, value[key], formatPath(path, key));
        }
      }
      return;
    }

    case "array": {
      if (!Array.isArray(value)) {
        throw createAiValidationError(`AI response at ${path} must be an array.`, {
          path,
          expected: "array",
          actual: typeof value,
        });
      }
      const itemSchema = schema.items || null;
      value.forEach((entry, index) => {
        validateSchema(itemSchema, entry, `${path}[${index}]`);
      });
      return;
    }

    case "string":
      if (typeof value !== "string") {
        throw createAiValidationError(`AI response at ${path} must be a string.`, {
          path,
          expected: "string",
          actual: typeof value,
        });
      }
      return;

    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw createAiValidationError(`AI response at ${path} must be a number.`, {
          path,
          expected: "number",
          actual: typeof value,
        });
      }
      return;

    case "boolean":
      if (typeof value !== "boolean") {
        throw createAiValidationError(`AI response at ${path} must be a boolean.`, {
          path,
          expected: "boolean",
          actual: typeof value,
        });
      }
      return;

    default:
      return;
  }
}

module.exports = {
  createAiValidationError,
  validateSchema,
};
