const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { createAIService } = require("../services/ai/AIService");

test("AI service caches stock analysis responses per user and payload", async () => {
  let callCount = 0;
  const captured = [];
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput(args) {
        callCount += 1;
        captured.push(args);
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            rating: 84,
            confidence: 91,
            trend: "Bullish",
            summary: "Momentum remains constructive.",
            strengths: ["Relative strength"],
            risks: ["Event risk"],
            recommendation: "Watch for confirmation.",
          },
        };
      },
    },
  });

  const payload = {
    symbol: "AMD",
    brokerAccountId: "ACC-12345",
  };

  const first = await aiService.analyzeStock("user-1", payload);
  const second = await aiService.analyzeStock("user-1", payload);

  assert.equal(callCount, 1);
  assert.equal(first.meta.cached, false);
  assert.equal(second.meta.cached, true);
  assert.equal(captured[0].input.brokerAccountId, "[REDACTED]");
  assert.match(captured[0].instructions, /\[REDACTED\]/);
});

test("AI service does not cache chat responses", async () => {
  let callCount = 0;
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        callCount += 1;
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            answer: "Here is the answer.",
            confidence: 76,
            bullets: ["One", "Two"],
            followUps: ["Next question"],
          },
        };
      },
    },
  });

  await aiService.chat("user-1", { messages: [{ role: "user", content: "Hi" }] });
  await aiService.chat("user-1", { messages: [{ role: "user", content: "Hi" }] });

  assert.equal(callCount, 2);
});
