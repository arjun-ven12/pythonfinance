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
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Global fetch is required for the OpenAI client.");
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
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(error.statusCode)) {
            lastError = error;
            await sleep(250 * 2 ** attempt);
            continue;
          }
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

        return {
          provider: "OPENAI",
          model: effectiveModel.model,
          rawId: responsePayload?.id || null,
          usage: responsePayload?.usage || null,
          output: parsed,
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
          throw timeoutError;
        }

        if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(error?.statusCode)) {
          lastError = error;
          await sleep(250 * 2 ** attempt);
          continue;
        }

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
  };
}

module.exports = {
  createOpenAIClient,
  createProviderError,
};
