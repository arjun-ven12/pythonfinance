const assert = require("node:assert/strict");
const test = require("node:test");

const { createOpenAIProvider } = require("../services/ai/OpenAIProvider");

test("OpenAI provider parses structured output from responses API", async () => {
  const provider = createOpenAIProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        id: "resp_123",
        status: "completed",
        usage: {
          input_tokens: 20,
          output_tokens: 8,
          input_tokens_details: { cached_tokens: 5 },
          output_tokens_details: { reasoning_tokens: 2 },
        },
        output_text: JSON.stringify({
          answer: "Structured response",
          confidence: 88,
          bullets: ["A"],
          followUps: ["B"],
        }),
      }),
    }),
  });

  const result = await provider.requestStructuredOutput({
    operation: "chat",
    instructions: "Return JSON",
    input: { message: "hello" },
    schemaName: "chat_response",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: { type: "string" },
        confidence: { type: "number" },
        bullets: { type: "array", items: { type: "string" } },
        followUps: { type: "array", items: { type: "string" } },
      },
      required: ["answer", "confidence", "bullets", "followUps"],
    },
  });

  assert.equal(result.provider, "OPENAI");
  assert.equal(result.rawId, "resp_123");
  assert.equal(result.output.answer, "Structured response");
  assert.equal(result.observability.cachedTokens, 5);
  assert.equal(result.observability.reasoningTokens, 2);
  assert.equal(result.observability.finishReason, "completed");
  assert.equal(result.observability.responseTruncated, false);
});

test("OpenAI provider retries retryable failures", async () => {
  let callCount = 0;
  const provider = createOpenAIProvider({
    apiKey: "test-key",
    fetchImpl: async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            error: {
              message: "Rate limited",
              code: "rate_limit_exceeded",
            },
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            answer: "Recovered",
            confidence: 70,
            bullets: [],
            followUps: [],
          }),
        }),
      };
    },
  });

  const result = await provider.requestStructuredOutput({
    operation: "chat",
    instructions: "Return JSON",
    input: { message: "hello" },
    schemaName: "chat_response",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: { type: "string" },
        confidence: { type: "number" },
        bullets: { type: "array", items: { type: "string" } },
        followUps: { type: "array", items: { type: "string" } },
      },
      required: ["answer", "confidence", "bullets", "followUps"],
    },
  });

  assert.equal(callCount, 2);
  assert.equal(result.output.answer, "Recovered");
  assert.equal(result.observability.retryCount, 1);
});

test("OpenAI provider honors Retry-After before retrying", async () => {
  let callCount = 0;
  const start = Date.now();
  const provider = createOpenAIProvider({
    apiKey: "test-key",
    maxRetries: 1,
    fetchImpl: async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: {
            get: (name) => (name.toLowerCase() === "retry-after" ? "0.02" : null),
          },
          json: async () => ({ error: { message: "Rate limited" } }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            answer: "Recovered",
            confidence: 70,
            bullets: [],
            followUps: [],
          }),
        }),
      };
    },
  });

  await provider.requestStructuredOutput({
    operation: "chat",
    instructions: "Return JSON",
    input: { message: "hello" },
    schemaName: "chat_response",
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        confidence: { type: "number" },
        bullets: { type: "array" },
        followUps: { type: "array" },
      },
      required: ["answer", "confidence", "bullets", "followUps"],
    },
  });

  assert.equal(callCount, 2);
  assert.ok(Date.now() - start >= 15);
});

test("OpenAI provider opens circuit after repeated provider failures", async () => {
  const provider = createOpenAIProvider({
    apiKey: "test-key",
    maxRetries: 0,
    circuitFailureThreshold: 1,
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Provider down" } }),
    }),
  });

  const args = {
    operation: "chat",
    instructions: "Return JSON",
    input: { message: "hello" },
    schemaName: "chat_response",
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
      },
    },
  };

  await assert.rejects(() => provider.requestStructuredOutput(args), /Provider down/);
  await assert.rejects(() => provider.requestStructuredOutput(args), /circuit is open/);
  assert.equal(provider.getHealth().circuitState, "OPEN");
});
