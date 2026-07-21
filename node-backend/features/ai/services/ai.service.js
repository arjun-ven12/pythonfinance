const crypto = require("node:crypto");
const { createOpenAIClient } = require("./ai.client");
const { createPromptRegistry } = require("./ai.prompts");
const { createContextRegistry, sanitizeAiInput } = require("./ai.context");
const { validateSchema } = require("./ai.validators");
const { createAiAuditService } = require("./ai.audit");
const { createAiMetricsService } = require("./ai.metrics");
const {
  buildAiGovernanceConfig,
  createBoundedCache,
  createConcurrencyGate,
  estimateOpenAiCostUsd,
  normalizeUsage,
  sha256,
  stableStringify,
} = require("./ai.governance");
const { createNoopAiInvocationStore } = require("./ai.invocationStore");
const {
  buildContextObservability,
  buildPricingConfig,
  buildResponseAnalysis,
  estimateDetailedCost,
} = require("./ai.observability");
const { getAiRequestContext } = require("../../../services/aiRequestContext");

const MEMORY_CONTEXT_INSTRUCTIONS = `

### Historical Memory Instructions
The input may contain a clearly separated relevantHistoricalContext section after current platform data.
- Treat memories as historical context, not current facts or proof of causation.
- Use only memories relevant to the current task and distinguish facts, historical outcomes, inference, unknowns, and limitations.
- Do not invent missing memory or claim the system remembers anything not present in that section.
- If the section says no context is available, continue from current data and disclose that limitation.
- Memory is advisory context only. Never use it to bypass validation, approval, lifecycle, deployment, portfolio, or execution controls.
- Treat USER_EXPLICIT preferences as user-stated constraints. Treat inferred preferences and observed patterns as uncertain historical evidence, and disclose contradictions.
- Current platform facts and deterministic validation always take precedence over personalization.
`;

function createAiError(message, statusCode = 500, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function createAiService({
  client = createOpenAIClient(),
  promptRegistry = createPromptRegistry(),
  contextRegistry = createContextRegistry(),
  auditService = createAiAuditService(),
  metricsService = createAiMetricsService(),
  invocationStore = createNoopAiInvocationStore(),
  governanceConfig = buildAiGovernanceConfig(),
  observabilityPricingConfig = buildPricingConfig(),
  featureRegistry = {},
  now = () => Date.now(),
} = {}) {
  const cache = createBoundedCache({ maxEntries: governanceConfig.cacheMaxEntries, now });
  const inFlight = new Map();
  const features = new Map(Object.entries(featureRegistry));
  const concurrencyGate = createConcurrencyGate({
    maxGlobal: governanceConfig.maxConcurrentRequestsGlobal,
    maxPerUser: governanceConfig.maxConcurrentRequestsPerUser,
  });

  function registerFeature(featureType, definition) {
    features.set(featureType, definition);
  }

  function resolveFeature(featureType) {
    if (!featureType) {
      throw createAiError("featureType is required for AI execution.", 400);
    }
    return features.get(featureType) || null;
  }

  function buildCacheKey(featureType, userId, payload, metadata = {}) {
    return crypto
      .createHash("sha256")
      .update(`${featureType}:${userId}:${stableStringify(payload)}:${stableStringify(metadata)}`)
      .digest("hex");
  }

  function buildSchemaHash(schema) {
    return sha256(stableStringify(schema || {}));
  }

  function getErrorCategory(error) {
    if (error?.code) return error.code;
    if (error?.details?.reason) return error.details.reason;
    if (error?.statusCode === 429 || error?.status === 429) return "RATE_LIMIT";
    if (error?.statusCode === 504 || error?.status === 504) return "TIMEOUT";
    if (error?.statusCode >= 500 || error?.status >= 500) return "PROVIDER";
    return "VALIDATION";
  }

  async function assertBudgetAvailable(userId, featureType) {
    const usage = await invocationStore.getDailyUsage(userId);
    if (usage.totalTokens >= governanceConfig.dailyTokenLimitPerUser) {
      throw createAiError("AI daily token budget exceeded.", 429, {
        reason: "user_token_budget_exceeded",
        limit: governanceConfig.dailyTokenLimitPerUser,
      });
    }
    if (usage.estimatedCostUsd >= governanceConfig.dailyCostLimitPerUser) {
      throw createAiError("AI daily cost budget exceeded.", 429, {
        reason: "user_cost_budget_exceeded",
        limit: governanceConfig.dailyCostLimitPerUser,
      });
    }

    const featureBudget = governanceConfig.featureDailyBudgets?.[featureType];
    if (!featureBudget) return;

    const featureUsage =
      typeof invocationStore.getDailyFeatureUsage === "function"
        ? await invocationStore.getDailyFeatureUsage(userId, featureType)
        : { totalTokens: 0, estimatedCostUsd: 0 };

    if (featureUsage.totalTokens >= featureBudget.tokenLimit) {
      throw createAiError(`AI daily token budget exceeded for ${featureType}.`, 429, {
        reason: "feature_token_budget_exceeded",
        featureType,
        limit: featureBudget.tokenLimit,
      });
    }
    if (featureUsage.estimatedCostUsd >= featureBudget.costLimit) {
      throw createAiError(`AI daily cost budget exceeded for ${featureType}.`, 429, {
        reason: "feature_cost_budget_exceeded",
        featureType,
        limit: featureBudget.costLimit,
      });
    }
  }

  async function recordInvocation(record) {
    await invocationStore.create(record).catch(() => null);
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
    const effectivePromptVersion = featureDefinition.promptVersion || "v1";

    if (!effectivePromptTemplate) {
      throw createAiError(`No prompt template configured for AI feature ${featureType}.`, 500);
    }

    if (!effectiveSchema) {
      throw createAiError(`No output schema configured for AI feature ${featureType}.`, 500);
    }

    let plaintextContext = null;
    let releaseConcurrency = null;
    let invocationBase = null;
    let observabilityInput = null;
    try {
      plaintextContext = await contextRegistry.build(effectiveContextBuilder, payload || {});
      const sanitizedContext = sanitizeAiInput(plaintextContext || {});
      if (typeof featureDefinition.validateInput === "function") {
        featureDefinition.validateInput(sanitizedContext);
      }

      const promptVariablesForTemplate = {
        contextJson: JSON.stringify(sanitizedContext, null, 2),
        payloadJson: JSON.stringify(sanitizedContext, null, 2),
        ...promptVariables,
      };
      const promptDescription =
        typeof promptRegistry.describePrompt === "function"
          ? promptRegistry.describePrompt({
              template: effectivePromptTemplate,
              variables: promptVariablesForTemplate,
            })
          : {
              content: promptRegistry.buildPrompt({
                template: effectivePromptTemplate,
                variables: promptVariablesForTemplate,
              }),
              templateId: typeof effectivePromptTemplate === "string" ? effectivePromptTemplate : "unknown",
              hash: null,
            };
      if (sanitizedContext?.relevantHistoricalContext) {
        promptDescription.content = `${promptDescription.content}${MEMORY_CONTEXT_INSTRUCTIONS}`;
        promptDescription.hash = sha256(promptDescription.content);
        promptDescription.version = `${promptDescription.version || effectivePromptVersion}+memory-v1`;
      }
      const effectiveSchemaHash = buildSchemaHash(effectiveSchema);
      const inputHash = sha256(stableStringify(sanitizedContext));
      const effectiveModelConfigForKey = { ...(featureDefinition.modelConfig || {}), ...(modelConfig || {}) };
      const cacheKey = buildCacheKey(featureType, userId, sanitizedContext, {
        modelConfig: effectiveModelConfigForKey,
        promptHash: promptDescription.hash,
        schemaHash: effectiveSchemaHash,
      });
      invocationBase = {
        ...getAiRequestContext(),
        userId,
        featureType,
        promptTemplateId: promptDescription.templateId,
        promptVersion: promptDescription.version || effectivePromptVersion,
        promptHash: promptDescription.hash,
        schemaName: effectiveSchemaName,
        schemaHash: effectiveSchemaHash,
        inputHash,
      };
      observabilityInput = {
        instructions: promptDescription.content,
        input: sanitizedContext,
        schema: effectiveSchema,
      };

      const cached = cache.get(cacheKey, featureType);
      if (cached) {
        const previousInvocation = typeof invocationStore.getPreviousInvocation === "function"
          ? await invocationStore.getPreviousInvocation(userId, featureType)
          : null;
        const contextObservability = buildContextObservability({
          ...observabilityInput,
          providerInputTokens: null,
          response: cached.data,
          previousInvocation,
        });
        await recordInvocation({
          ...invocationBase,
          provider: cached.meta.provider,
          model: cached.meta.model,
          status: "SUCCESS",
          cacheStatus: "HIT",
          latencyMs: now() - start,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          retryCount: 0,
          observabilityCostUsd: 0,
          estimatedCostSgd: 0,
          tokenBreakdown: contextObservability.tokenBreakdown,
          contextBreakdown: contextObservability.contextBreakdown,
          contextDiff: contextObservability.contextDiff,
          warnings: contextObservability.warnings,
          largestContributor: contextObservability.contextBreakdown.largestContributor?.key || null,
          responseAnalysis: buildResponseAnalysis({ response: cached.data }),
        });
        return {
          ...cached,
          meta: {
            ...cached.meta,
            cached: true,
          },
        };
      }

      if (inFlight.has(cacheKey)) {
        return inFlight.get(cacheKey);
      }

      const run = (async () => {
        await assertBudgetAvailable(userId, featureType);
        releaseConcurrency = concurrencyGate.acquire(userId);
        const response = await client.requestStructuredOutput({
          operation: featureType,
          instructions: promptDescription.content,
          input: sanitizedContext,
          schemaName: effectiveSchemaName,
          schema: effectiveSchema,
          modelConfig: effectiveModelConfig,
        });

        validateSchema(effectiveSchema, response.output);

        const latencyMs = now() - start;
        const usage = normalizeUsage(response.usage || {});
        const estimatedCostUsd = estimateOpenAiCostUsd(
          response.model,
          response.usage || {},
          governanceConfig
        );
        const detailedCost = estimateDetailedCost({
          model: response.model,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          cachedTokens: usage.cachedTokens,
        }, observabilityPricingConfig);
        const previousInvocation = typeof invocationStore.getPreviousInvocation === "function"
          ? await invocationStore.getPreviousInvocation(userId, featureType)
          : null;
        const contextObservability = buildContextObservability({
          ...observabilityInput,
          providerInputTokens: usage.promptTokens,
          response: response.output,
          previousInvocation,
        });
        const responseAnalysis = buildResponseAnalysis({
          response: response.output,
          providerMetadata: {
            ...(response.observability || {}),
            outputTokens: usage.completionTokens,
            reasoningTokens: usage.reasoningTokens,
          },
          completionDurationMs: response.observability?.completionDurationMs || null,
        });
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

        cache.set(cacheKey, result, effectiveCacheTtlMs, featureType);
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
        await recordInvocation({
          ...invocationBase,
          provider: response.provider,
          model: response.model,
          providerResponseId: response.rawId || null,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          estimatedCostUsd,
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
          cachedTokens: usage.cachedTokens,
          inputTokenCostUsd: detailedCost.inputTokenCostUsd,
          outputTokenCostUsd: detailedCost.outputTokenCostUsd,
          cachedTokenCostUsd: detailedCost.cachedTokenCostUsd,
          observabilityCostUsd: detailedCost.estimatedCostUsd,
          estimatedCostSgd: detailedCost.estimatedCostSgd,
          usdToSgdRate: detailedCost.usdToSgdRate,
          pricingVersion: detailedCost.pricingVersion,
          pricingConfigured: detailedCost.pricingConfigured,
          latencyMs,
          providerLatencyMs: response.observability?.providerLatencyMs || null,
          retryCount: response.observability?.retryCount || 0,
          status: "SUCCESS",
          cacheStatus: "MISS",
          tokenBreakdown: contextObservability.tokenBreakdown,
          contextBreakdown: contextObservability.contextBreakdown,
          contextDiff: contextObservability.contextDiff,
          warnings: contextObservability.warnings,
          largestContributor: contextObservability.contextBreakdown.largestContributor?.key || null,
          responseAnalysis,
        });

        return result;
      })();

      const sharedRun = run.finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, sharedRun);
      return await sharedRun;
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
      if (invocationBase) {
        const contextObservability = observabilityInput
          ? buildContextObservability({ ...observabilityInput, providerInputTokens: null, response: null })
          : null;
        await recordInvocation({
          ...invocationBase,
          latencyMs,
          providerLatencyMs: error.providerLatencyMs || null,
          retryCount: error.retryCount || 0,
          status: "FAILED",
          errorCategory: getErrorCategory(error),
          cacheStatus: "MISS",
          tokenBreakdown: contextObservability?.tokenBreakdown || null,
          contextBreakdown: contextObservability?.contextBreakdown || null,
          contextDiff: contextObservability?.contextDiff || null,
          warnings: contextObservability?.warnings || null,
          largestContributor: contextObservability?.contextBreakdown?.largestContributor?.key || null,
        });
      }
      throw error;
    } finally {
      if (typeof releaseConcurrency === "function") {
        releaseConcurrency();
      }
      plaintextContext = null;
      observabilityInput = null;
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
    getGovernanceSnapshot() {
      return {
        cache: cache.snapshot(),
        concurrency: concurrencyGate.snapshot(),
        budgets: {
          dailyTokenLimitPerUser: governanceConfig.dailyTokenLimitPerUser,
          dailyCostLimitPerUser: governanceConfig.dailyCostLimitPerUser,
          featureDailyBudgets: governanceConfig.featureDailyBudgets || {},
        },
        pricing: {
          inputCostPer1M: governanceConfig.inputCostPer1M,
          outputCostPer1M: governanceConfig.outputCostPer1M,
          modelPricing: governanceConfig.modelPricing || {},
        },
        provider: typeof client.getHealth === "function" ? client.getHealth() : null,
      };
    },
    getDiagnostics(args) {
      return invocationStore.diagnostics(args);
    },
    registerFeature,
  };
}

module.exports = {
  createAiError,
  createAiService,
  sanitizeAiInput,
};
