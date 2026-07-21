const { redactSensitive } = require("../../../services/redactionService");
const { buildModelConfig } = require("./ai.models");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

function createProviderError(message, statusCode = 502, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number.parseFloat(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateValue = Date.parse(value);
  if (Number.isFinite(dateValue)) {
    return Math.max(0, dateValue - Date.now());
  }
  return null;
}

function buildInputPayload(input) {
  if (typeof input === "string") {
    return input;
  }

  return JSON.stringify(input, null, 2);
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const contentParts = output.flatMap((item) =>
    Array.isArray(item?.content) ? item.content : []
  );

  const textValue = contentParts
    .map((item) => item?.text || item?.output_text || "")
    .find((value) => typeof value === "string" && value.trim());

  return textValue || "";
}

function extractFinishReason(payload) {
  if (payload?.incomplete_details?.reason) return payload.incomplete_details.reason;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output.find((item) => item?.finish_reason)?.finish_reason || payload?.status || null;
}

function extractUsageMetadata(usage = {}) {
  return {
    cachedTokens:
      Number(usage?.input_tokens_details?.cached_tokens ?? usage?.prompt_tokens_details?.cached_tokens) || 0,
    reasoningTokens:
      Number(usage?.output_tokens_details?.reasoning_tokens ?? usage?.completion_tokens_details?.reasoning_tokens) || 0,
  };
}

function normalizeOpenAiError(payload, fallbackStatus) {
  const status = payload?.error?.code === "rate_limit_exceeded" ? 429 : fallbackStatus;
  return createProviderError(
    payload?.error?.message || "OpenAI request failed.",
    status,
    redactSensitive(payload?.error || payload || null)
  );
}

function createOpenAIClient({
  apiKey = process.env.OPENAI_API_KEY || "",
  fetchImpl = global.fetch,
  maxRetries = 2,
  now = () => Date.now(),
  circuitFailureThreshold = 5,
  circuitCooldownMs = 60_000,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is required for the OpenAI client.");
  }

  const circuit = {
    state: "CLOSED",
    failureCount: 0,
    openedAt: null,
    lastFailure: null,
  };

  function recordSuccess() {
    circuit.state = "CLOSED";
    circuit.failureCount = 0;
    circuit.openedAt = null;
    circuit.lastFailure = null;
  }

  function recordFailure(error) {
    circuit.failureCount += 1;
    circuit.lastFailure = {
      statusCode: error?.statusCode || null,
      message: error?.message || "Unknown provider failure",
      at: new Date(now()).toISOString(),
    };
    if (circuit.failureCount >= circuitFailureThreshold) {
      circuit.state = "OPEN";
      circuit.openedAt = now();
    }
  }

  function assertCircuitAllowsRequest() {
    if (circuit.state !== "OPEN") return;
    if (now() - circuit.openedAt >= circuitCooldownMs) {
      circuit.state = "HALF_OPEN";
      return;
    }
    throw createProviderError("OpenAI provider circuit is open.", 503, {
      circuitState: circuit.state,
      lastFailure: circuit.lastFailure,
    });
  }

  async function requestStructuredOutput({
    operation,
    instructions,
    input,
    schemaName,
    schema,
    modelConfig = {},
  }) {
    if (!apiKey) {
      throw createProviderError("OPENAI_API_KEY is not configured.", 503);
    }

    assertCircuitAllowsRequest();

    const effectiveModel = buildModelConfig(modelConfig);

    const payload = {
      model: effectiveModel.model,
      instructions,
      input: buildInputPayload(input),
      store: false,
      temperature: effectiveModel.temperature,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    };

    if (Number.isInteger(effectiveModel.maxOutputTokens) && effectiveModel.maxOutputTokens > 0) {
      payload.max_output_tokens = effectiveModel.maxOutputTokens;
    }

    let lastError = null;
    const requestStartedAt = now();

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const abortController = new AbortController();
      const timeoutHandle = setTimeout(
        () => abortController.abort(),
        effectiveModel.timeoutMs
      );

      try {
        const response = await fetchImpl(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        });

        clearTimeout(timeoutHandle);
        const responsePayload = await response.json().catch(() => null);

        if (!response.ok) {
          const error = normalizeOpenAiError(responsePayload, response.status || 502);
          const retryAfterMs = parseRetryAfter(response.headers?.get?.("retry-after"));
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(error.statusCode)) {
            lastError = error;
            await sleep(retryAfterMs ?? 250 * 2 ** attempt);
            continue;
          }
          recordFailure(error);
          throw error;
        }

        const outputText = extractOutputText(responsePayload);
        if (!outputText) {
          throw createProviderError(
            `OpenAI returned no structured output for ${operation}.`,
            502
          );
        }

        let parsed;
        try {
          parsed = JSON.parse(outputText);
        } catch (error) {
          throw createProviderError(`OpenAI returned invalid JSON for ${operation}.`, 502, {
            parseError: error.message,
          });
        }

        recordSuccess();
        const usageMetadata = extractUsageMetadata(responsePayload?.usage || {});
        const finishReason = extractFinishReason(responsePayload);
        return {
          provider: "OPENAI",
          model: effectiveModel.model,
          rawId: responsePayload?.id || null,
          usage: responsePayload?.usage || null,
          output: parsed,
          observability: {
            retryCount: attempt,
            providerLatencyMs: Math.max(0, now() - requestStartedAt),
            completionDurationMs: Math.max(0, now() - requestStartedAt),
            streamDurationMs: null,
            reasoningDurationMs: null,
            responseStatus: responsePayload?.status || null,
            finishReason,
            responseTruncated:
              responsePayload?.status === "incomplete" ||
              ["max_output_tokens", "length"].includes(String(finishReason || "").toLowerCase()),
            outputJsonBytes: Buffer.byteLength(outputText, "utf8"),
            ...usageMetadata,
          },
        };
      } catch (error) {
        clearTimeout(timeoutHandle);

        if (error?.name === "AbortError") {
          const timeoutError = createProviderError(
            `OpenAI request timed out after ${effectiveModel.timeoutMs}ms.`,
            504
          );
          if (attempt < maxRetries) {
            lastError = timeoutError;
            await sleep(250 * 2 ** attempt);
            continue;
          }
          timeoutError.retryCount = attempt;
          timeoutError.providerLatencyMs = Math.max(0, now() - requestStartedAt);
          recordFailure(timeoutError);
          throw timeoutError;
        }

        if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(error?.statusCode)) {
          lastError = error;
          await sleep(250 * 2 ** attempt);
          continue;
        }

        error.retryCount = attempt;
        error.providerLatencyMs = Math.max(0, now() - requestStartedAt);
        recordFailure(error);
        throw error;
      }
    }

    throw lastError || createProviderError("OpenAI request failed.", 502);
  }

  return {
    isConfigured() {
      return Boolean(apiKey);
    },

    async requestStructuredOutput(args) {
      return requestStructuredOutput(args);
    },

    getHealth() {
      return {
        provider: "OPENAI",
        configured: Boolean(apiKey),
        circuitState: circuit.state,
        failureCount: circuit.failureCount,
        openedAt: circuit.openedAt ? new Date(circuit.openedAt).toISOString() : null,
        lastFailure: circuit.lastFailure,
      };
    },
  };
}

module.exports = {
  createOpenAIClient,
  createProviderError,
};
