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
});
