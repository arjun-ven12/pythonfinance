const crypto = require("node:crypto");
const { createOpenAIClient } = require("./ai.client");
const { createPromptRegistry } = require("./ai.prompts");
const { createContextRegistry, sanitizeAiInput } = require("./ai.context");
const { validateSchema } = require("./ai.validators");
const { createAiAuditService } = require("./ai.audit");
const { createAiMetricsService } = require("./ai.metrics");

function createAiError(message, statusCode = 500, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function createAiService({
  client = createOpenAIClient(),
  promptRegistry = createPromptRegistry(),
  contextRegistry = createContextRegistry(),
  auditService = createAiAuditService(),
  metricsService = createAiMetricsService(),
  featureRegistry = {},
  now = () => Date.now(),
} = {}) {
  const cache = new Map();
  const features = new Map(Object.entries(featureRegistry));

  function registerFeature(featureType, definition) {
    features.set(featureType, definition);
  }

  function resolveFeature(featureType) {
    if (!featureType) {
      throw createAiError("featureType is required for AI execution.", 400);
    }
    return features.get(featureType) || null;
  }

  function buildCacheKey(featureType, userId, payload) {
    return crypto
      .createHash("sha256")
      .update(`${featureType}:${userId}:${stableStringify(payload)}`)
      .digest("hex");
  }

  function getCached(featureType, userId, payload, ttlMs) {
    if (!ttlMs) {
      return null;
    }

    const key = buildCacheKey(featureType, userId, payload);
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  function setCached(featureType, userId, payload, ttlMs, value) {
    if (!ttlMs) {
      return;
    }

    const key = buildCacheKey(featureType, userId, payload);
    cache.set(key, {
      expiresAt: now() + ttlMs,
      value,
    });
  }

  async function execute({
    featureType,
    userId,
    payload = {},
    promptTemplate,
    promptVariables = {},
    contextBuilder = null,
    modelConfig = {},
    outputSchema,
    schemaName,
    cacheTtlMs = 0,
  }) {
    const start = now();
    const featureDefinition = resolveFeature(featureType) || {};
    const effectivePromptTemplate = promptTemplate || featureDefinition.promptTemplate;
    const effectiveContextBuilder = contextBuilder ?? featureDefinition.contextBuilder ?? null;
    const effectiveModelConfig = { ...(featureDefinition.modelConfig || {}), ...(modelConfig || {}) };
    const effectiveSchema = outputSchema || featureDefinition.outputSchema;
    const effectiveSchemaName = schemaName || featureDefinition.schemaName || featureType;
    const effectiveCacheTtlMs = cacheTtlMs || featureDefinition.cacheTtlMs || 0;

    if (!effectivePromptTemplate) {
      throw createAiError(`No prompt template configured for AI feature ${featureType}.`, 500);
    }

    if (!effectiveSchema) {
      throw createAiError(`No output schema configured for AI feature ${featureType}.`, 500);
    }

    let plaintextContext = null;
    try {
      plaintextContext = await contextRegistry.build(effectiveContextBuilder, payload || {});
      const sanitizedContext = sanitizeAiInput(plaintextContext || {});
      const cached = getCached(featureType, userId, sanitizedContext, effectiveCacheTtlMs);
      if (cached) {
        return {
          ...cached,
          meta: {
            ...cached.meta,
            cached: true,
          },
        };
      }

      const instructions = promptRegistry.buildPrompt({
        template: effectivePromptTemplate,
        variables: {
          contextJson: JSON.stringify(sanitizedContext, null, 2),
          payloadJson: JSON.stringify(sanitizedContext, null, 2),
          ...promptVariables,
        },
      });

      const response = await client.requestStructuredOutput({
        operation: featureType,
        instructions,
        input: sanitizedContext,
        schemaName: effectiveSchemaName,
        schema: effectiveSchema,
        modelConfig: effectiveModelConfig,
      });

      validateSchema(effectiveSchema, response.output);

      const latencyMs = now() - start;
      const result = {
        data: response.output,
        meta: {
          featureType,
          cached: false,
          provider: response.provider,
          model: response.model,
          latencyMs,
          usage: response.usage || null,
        },
      };

      setCached(featureType, userId, sanitizedContext, effectiveCacheTtlMs, result);
      metricsService.recordSuccess(featureType, latencyMs);
      auditService.record({
        featureType,
        userId,
        provider: response.provider,
        model: response.model,
        latencyMs,
        tokenUsage: response.usage || null,
        success: true,
      });

      return result;
    } catch (error) {
      const latencyMs = now() - start;
      metricsService.recordFailure(featureType, latencyMs);
      auditService.record({
        featureType,
        userId,
        provider: null,
        model: null,
        latencyMs,
        tokenUsage: null,
        success: false,
        statusCode: error.statusCode || error.status || 500,
        errorCode: error.code || null,
      });
      throw error;
    } finally {
      plaintextContext = null;
    }
  }

  function createFeatureRunner(featureType, definition = null) {
    if (definition) {
      registerFeature(featureType, definition);
    }

    return async (userId, payload = {}) => {
      const result = await execute({ featureType, userId, payload });
      return {
        ...result.data,
        meta: result.meta,
      };
    };
  }

  return {
    isConfigured() {
      return client.isConfigured();
    },
    createFeatureRunner,
    execute,
    getAuditEntries() {
      return auditService.getEntries ? auditService.getEntries() : [];
    },
    getMetricsSnapshot() {
      return metricsService.snapshot ? metricsService.snapshot() : {};
    },
    registerFeature,
  };
}

module.exports = {
  createAiError,
  createAiService,
  sanitizeAiInput,
};
