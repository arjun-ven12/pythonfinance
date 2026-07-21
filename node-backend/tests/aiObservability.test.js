const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildContextObservability,
  buildPricingConfig,
  buildResponseAnalysis,
  estimateDetailedCost,
  generateOptimizationRecommendations,
} = require("../features/ai/services/ai.observability");
const { createAiInvocationStore } = require("../features/ai/services/ai.invocationStore");
const { createAiObservabilityService } = require("../features/ai/services/ai.observabilityService");

test("token breakdown reconciles section estimates to provider input tokens", () => {
  const input = {
    question: "Should I increase this position?",
    strategyJson: { name: "Momentum", rules: ["RSI > 55"] },
    portfolio: { cash: 10000, positions: [{ symbol: "AMD", quantity: 10 }] },
    relevantHistoricalContext: { memories: [{ summary: "Previous AMD trade was profitable" }] },
  };
  const context = buildContextObservability({
    instructions: `Review this context:\n${JSON.stringify(input, null, 2)}`,
    input,
    schema: { type: "object", properties: { answer: { type: "string" } } },
    providerInputTokens: 1000,
    response: { answer: "Review position risk and the momentum rule." },
  });
  const sections = context.tokenBreakdown.sections;
  const total = Object.values(sections).reduce((sum, item) => sum + item.tokens, 0);
  const percentage = Object.values(sections).reduce((sum, item) => sum + item.percentage, 0);

  assert.equal(total, 1000);
  assert.ok(Math.abs(percentage - 100) < 0.2);
  assert.ok(sections.strategyContext.tokens > 0);
  assert.ok(sections.portfolioContext.tokens > 0);
  assert.ok(sections.retrievedMemories.tokens > 0);
  assert.equal(context.contextBreakdown.contextCopies, 2);
});

test("detailed cost separates uncached input, cached input, output and SGD", () => {
  const config = buildPricingConfig({
    AI_MODEL_PRICING_JSON: JSON.stringify({
      "test-model": { inputCostPer1M: 2, cachedInputCostPer1M: 0.5, outputCostPer1M: 8 },
    }),
    AI_USD_SGD_RATE: "1.35",
    AI_PRICING_VERSION: "2026-07-21",
  });
  const result = estimateDetailedCost({
    model: "test-model",
    inputTokens: 1_000_000,
    cachedTokens: 200_000,
    outputTokens: 100_000,
  }, config);

  assert.equal(result.inputTokenCostUsd, 1.6);
  assert.equal(result.cachedTokenCostUsd, 0.1);
  assert.equal(result.outputTokenCostUsd, 0.8);
  assert.equal(result.estimatedCostUsd, 2.5);
  assert.equal(result.estimatedCostSgd, 3.375);
  assert.equal(result.pricingConfigured, true);
});

test("missing model pricing is explicit instead of using a hardcoded price", () => {
  const result = estimateDetailedCost(
    { model: "unknown-model", inputTokens: 100, outputTokens: 50 },
    { models: {}, usdToSgdRate: 1.35, pricingVersion: "test" }
  );
  assert.equal(result.pricingConfigured, false);
  assert.equal(result.estimatedCostUsd, null);
  assert.equal(result.estimatedCostSgd, null);
});

test("context diff records identical sections and repeated tokens", () => {
  const args = {
    instructions: "Use the supplied context.",
    input: { strategyJson: { name: "Trend" }, portfolio: { cash: 1000 } },
    schema: { type: "object", properties: { answer: { type: "string" } } },
    providerInputTokens: 400,
    response: { answer: "Trend strategy and portfolio cash reviewed." },
  };
  const first = buildContextObservability(args);
  const second = buildContextObservability({
    ...args,
    previousInvocation: {
      id: "previous-id",
      requestId: "request-1",
      tokenBreakdown: first.tokenBreakdown,
      contextBreakdown: first.contextBreakdown,
    },
  });

  assert.equal(second.contextDiff.previousRequestId, "request-1");
  assert.ok(second.contextDiff.identicalSections.includes("strategyContext"));
  assert.ok(second.contextDiff.repeatedTokens > 0);
  assert.ok(second.contextDiff.potentialCacheSavingsTokens > 0);
});

test("response analysis and recommendations remain reporting-only", () => {
  const response = buildResponseAnalysis({
    response: { answer: "ok" },
    providerMetadata: { outputTokens: 12, reasoningTokens: 3, finishReason: "completed", completionDurationMs: 120 },
  });
  assert.equal(response.responseTokens, 12);
  assert.equal(response.reasoningTokens, 3);
  assert.equal(response.finishReason, "completed");
  assert.ok(response.jsonSizeBytes > 0);

  const recommendations = generateOptimizationRecommendations({
    inputTokens: 100,
    tokenBreakdown: { sections: { memoryContext: { tokens: 60 }, otherContext: { tokens: 40 } } },
    contextDiff: { repeatedTokens: 20 },
    contextBreakdown: { unusedSections: ["otherContext"] },
  });
  assert.ok(recommendations.some((item) => item.code === "MEMORY_DOMINANT"));
  assert.ok(recommendations.some((item) => item.code === "REPEATED_CONTEXT"));
});

test("diagnostics persistence stores all observability fields", async () => {
  let created;
  const store = createAiInvocationStore({
    prisma: {
      run: async (callback) => callback({
        aiInvocation: {
          create: async ({ data }) => { created = data; return data; },
        },
      }),
    },
    logger: { warn() {} },
  });
  await store.create({
    requestId: "req-1",
    userId: "user-1",
    featureType: "chat",
    inputHash: "hash",
    inputTokens: 10,
    outputTokens: 5,
    cachedTokens: 2,
    inputTokenCostUsd: 0.1,
    outputTokenCostUsd: 0.2,
    cachedTokenCostUsd: 0.01,
    observabilityCostUsd: 0.31,
    estimatedCostSgd: 0.42,
    retryCount: 1,
    tokenBreakdown: { sections: {} },
    contextBreakdown: { contextEntropy: 0.5 },
    contextDiff: { repeatedTokens: 2 },
    responseAnalysis: { finishReason: "completed" },
    status: "SUCCESS",
  });
  assert.equal(created.requestId, "req-1");
  assert.equal(created.inputTokens, 10);
  assert.equal(created.cachedTokens, 2);
  assert.equal(created.observabilityCostUsd, 0.31);
  assert.equal(created.retryCount, 1);
  assert.deepEqual(created.contextDiff, { repeatedTokens: 2 });
});

test("feature and dashboard aggregations include averages and p95", async () => {
  const now = new Date("2026-07-21T12:00:00.000Z");
  const rows = [
    { id: "1", userId: "u1", user: { email: "a@example.com" }, featureType: "chat", model: "m1", totalTokens: 100, inputTokens: 80, outputTokens: 20, latencyMs: 100, observabilityCostUsd: 0.01, estimatedCostSgd: 0.0135, status: "SUCCESS", createdAt: now, tokenBreakdown: { sections: { memoryContext: { tokens: 20 } } } },
    { id: "2", userId: "u1", user: { email: "a@example.com" }, featureType: "chat", model: "m1", totalTokens: 300, inputTokens: 250, outputTokens: 50, latencyMs: 300, observabilityCostUsd: 0.03, estimatedCostSgd: 0.0405, status: "SUCCESS", createdAt: now, tokenBreakdown: { sections: { strategyContext: { tokens: 100 } } } },
  ];
  const repository = {
    async findRange() { return rows; },
    async list() { return { rows, total: rows.length, take: 100, skip: 0 }; },
    async findById(id) { return rows.find((row) => row.id === id) || null; },
  };
  const service = createAiObservabilityService({ repository, now: () => now });
  const features = await service.featureUsage({ since: new Date("2026-07-01") });
  assert.equal(features[0].requests, 2);
  assert.equal(features[0].averageTokens, 200);
  assert.equal(features[0].p95Tokens, 300);
  assert.equal(features[0].totalCostUsd, 0.04);

  const dashboard = await service.dashboard({ since: new Date("2026-07-01") });
  assert.equal(dashboard.recent.length, 2);
  assert.ok(dashboard.contextContributors.some((item) => item.section === "strategyContext"));
});
