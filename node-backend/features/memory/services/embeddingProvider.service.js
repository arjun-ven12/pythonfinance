const crypto = require("node:crypto");
const { redactSensitive } = require("../../../services/redactionService");
const {
  buildContextObservability,
  buildPricingConfig,
  buildResponseAnalysis,
  estimateDetailedCost,
  estimateTokens,
} = require("../../ai/services/ai.observability");
const { getAiRequestContext } = require("../../../services/aiRequestContext");

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function providerError(message, category, statusCode = 502, details = null) {
  const error = new Error(message);
  error.code = category;
  error.statusCode = statusCode;
  error.details = redactSensitive(details);
  return error;
}

function createEmbeddingProvider({
  config,
  apiKey = process.env.OPENAI_API_KEY || "",
  fetchImpl = global.fetch,
  sleepImpl = sleep,
  maxRetries = 2,
  invocationStore = null,
  pricingConfig = buildPricingConfig(),
} = {}) {
  if (!config) throw new Error("Embedding configuration is required.");
  if (typeof fetchImpl !== "function") throw new Error("Global fetch is required for embeddings.");

  const metrics = { requests: 0, inputs: 0, retries: 0, rateLimits: 0, failures: 0, latencyMs: 0, tokens: 0 };

  async function persistObservability({
    inputs,
    metadata,
    payload = null,
    startedAt,
    retryCount,
    status,
    errorCategory = null,
  }) {
    if (!invocationStore?.create) return;
    const usage = payload?.usage || {};
    const providerInputTokens = Number(usage.total_tokens || usage.prompt_tokens || 0);
    const inputTokens = providerInputTokens || inputs.reduce((sum, item) => sum + estimateTokens(item), 0);
    const cachedTokens = Number(usage?.prompt_tokens_details?.cached_tokens || usage?.input_tokens_details?.cached_tokens || 0);
    const userIds = [...new Set((metadata.userIds || [metadata.userId]).filter(Boolean).map(String))];
    const userId = metadata.userId || (userIds.length === 1 ? userIds[0] : null);
    const contextInput = metadata.section === "userPrompt"
      ? { query: inputs[0] || "" }
      : { relevantHistoricalContext: { memories: inputs } };
    const previousInvocation = invocationStore.getPreviousInvocation
      ? await invocationStore.getPreviousInvocation(userId, metadata.featureType || "memoryEmbedding")
      : null;
    const context = buildContextObservability({
      instructions: "",
      input: contextInput,
      schema: null,
      providerInputTokens: inputTokens,
      response: null,
      previousInvocation,
    });
    if (!providerInputTokens) {
      context.warnings.push("Provider token usage was unavailable; input tokens are estimated.");
    }
    const cost = estimateDetailedCost({
      model: payload?.model || config.model,
      inputTokens,
      outputTokens: 0,
      cachedTokens,
    }, pricingConfig);
    const requestContext = getAiRequestContext();
    const latencyMs = Math.max(0, Date.now() - startedAt);
    await invocationStore.create({
      requestId: metadata.requestId || requestContext.requestId || crypto.randomUUID(),
      userId,
      userIds,
      featureType: metadata.featureType || "memoryEmbedding",
      provider: "OPENAI",
      model: payload?.model || config.model,
      promptTemplateId: "openai_embedding_input",
      promptVersion: metadata.promptVersion || null,
      promptHash: crypto.createHash("sha256").update(JSON.stringify(inputs)).digest("hex"),
      inputHash: crypto.createHash("sha256").update(JSON.stringify(inputs)).digest("hex"),
      endpoint: metadata.endpoint || requestContext.endpoint || "OPENAI /v1/embeddings",
      promptTokens: inputTokens,
      completionTokens: 0,
      inputTokens,
      outputTokens: 0,
      cachedTokens,
      totalTokens: inputTokens,
      estimatedCostUsd: cost.estimatedCostUsd,
      inputTokenCostUsd: cost.inputTokenCostUsd,
      outputTokenCostUsd: cost.outputTokenCostUsd,
      cachedTokenCostUsd: cost.cachedTokenCostUsd,
      observabilityCostUsd: cost.estimatedCostUsd,
      estimatedCostSgd: cost.estimatedCostSgd,
      usdToSgdRate: cost.usdToSgdRate,
      pricingVersion: cost.pricingVersion,
      pricingConfigured: cost.pricingConfigured,
      latencyMs,
      providerLatencyMs: latencyMs,
      retryCount,
      status,
      errorCategory,
      cacheStatus: "MISS",
      tokenBreakdown: context.tokenBreakdown,
      contextBreakdown: context.contextBreakdown,
      contextDiff: context.contextDiff,
      largestContributor: context.largestContributor,
      warnings: context.warnings,
      responseAnalysis: buildResponseAnalysis({
        response: null,
        providerMetadata: {
          outputTokens: 0,
          completionDurationMs: latencyMs,
          responseStatus: status,
          finishReason: status === "SUCCESS" ? "completed" : errorCategory,
        },
      }),
    });
  }

  async function embed(documents, metadata = {}) {
    const inputs = Array.isArray(documents) ? documents : [];
    if (!inputs.length || inputs.some((item) => !String(item || "").trim())) {
      throw providerError("Embedding input must contain non-empty documents.", "VALIDATION", 400);
    }
    if (inputs.length > config.batchSize) {
      throw providerError(`Embedding batch exceeds ${config.batchSize} documents.`, "VALIDATION", 400);
    }
    if (!apiKey) throw providerError("OPENAI_API_KEY is not configured.", "CONFIGURATION", 503);

    const startedAt = Date.now();
    metrics.requests += 1;
    metrics.inputs += inputs.length;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const response = await fetchImpl(OPENAI_EMBEDDINGS_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            input: inputs,
            model: config.model,
            dimensions: config.dimensions,
            encoding_format: "float",
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const category = response.status === 429 ? "RATE_LIMIT" : "PROVIDER";
          const error = providerError(
            payload?.error?.message || "Embedding provider request failed.",
            category,
            response.status || 502,
            payload?.error
          );
          if (response.status === 429) metrics.rateLimits += 1;
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
            metrics.retries += 1;
            lastError = error;
            await sleepImpl(retryAfterMs(response.headers?.get?.("retry-after")) ?? 250 * 2 ** attempt);
            continue;
          }
          throw error;
        }

        const data = Array.isArray(payload?.data) ? [...payload.data].sort((a, b) => a.index - b.index) : [];
        if (data.length !== inputs.length) {
          throw providerError("Embedding provider returned an unexpected result count.", "MALFORMED_RESPONSE");
        }
        const vectors = data.map((item) => item?.embedding);
        if (vectors.some((vector) => !Array.isArray(vector) || vector.length !== config.dimensions || vector.some((value) => !Number.isFinite(value)))) {
          throw providerError(
            `Embedding provider dimensions do not match ${config.dimensions}.`,
            "DIMENSION_MISMATCH"
          );
        }

        metrics.tokens += Number(payload?.usage?.total_tokens || payload?.usage?.prompt_tokens || 0);
        metrics.latencyMs += Date.now() - startedAt;
        await persistObservability({
          inputs,
          metadata,
          payload,
          startedAt,
          retryCount: attempt,
          status: "SUCCESS",
        });
        return { vectors, model: payload?.model || config.model, usage: payload?.usage || null };
      } catch (error) {
        clearTimeout(timer);
        const normalized = error?.name === "AbortError"
          ? providerError(`Embedding request timed out after ${config.timeoutMs}ms.`, "TIMEOUT", 504)
          : error?.code
            ? error
            : providerError("Embedding provider network request failed.", "NETWORK", 503);
        if (attempt < maxRetries && (["TIMEOUT", "NETWORK"].includes(normalized.code) || RETRYABLE_STATUS_CODES.has(normalized.statusCode))) {
          metrics.retries += 1;
          lastError = normalized;
          await sleepImpl(250 * 2 ** attempt);
          continue;
        }
        metrics.failures += 1;
        metrics.latencyMs += Date.now() - startedAt;
        await persistObservability({
          inputs,
          metadata,
          startedAt,
          retryCount: attempt,
          status: "FAILED",
          errorCategory: normalized.code || "PROVIDER",
        });
        throw normalized;
      }
    }
    throw lastError || providerError("Embedding provider request failed.", "PROVIDER");
  }

  return {
    diagnostics() {
      return {
        provider: config.provider,
        model: config.model,
        configured: Boolean(apiKey),
        ...metrics,
        averageLatencyMs: metrics.requests ? Math.round(metrics.latencyMs / metrics.requests) : 0,
      };
    },
    embed,
    isConfigured: () => Boolean(apiKey),
  };
}

module.exports = { OPENAI_EMBEDDINGS_URL, createEmbeddingProvider, retryAfterMs };
