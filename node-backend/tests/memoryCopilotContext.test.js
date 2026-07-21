const assert = require("node:assert/strict");
const test = require("node:test");
const { createMemoryContextService, EMPTY_NOTICE } = require("../features/memory/services/memoryContext.service");

function retrievalResult() {
  return {
    retrievalStatus: "PARTIAL_CONTEXT",
    memories: [{
      memoryEventId: "memory-1",
      title: "Momentum v8 deployed",
      summary: "Momentum v8 was deployed in Bull Low Volatility.",
      category: "STRATEGY",
      eventType: "STRATEGY_DEPLOYED",
      occurredAt: "2026-07-10T00:00:00.000Z",
      importance: 95,
      outcomeStatus: "POSITIVE_OUTCOME",
      linkedEntities: [{ entityType: "STRATEGY", entityId: "strategy-1", relationshipType: "RELATED_TO" }],
      provenance: { sourceType: "STRATEGY_VERSION", sourceId: "version-8", confidence: 88 },
      whyRetrieved: ["same strategy", "confirmed historical outcome"],
      vector: [0.1, 0.2],
      structuredData: { secret: "must-not-leak" },
    }],
    context: { tokenEstimate: 146, omittedCount: 2 },
  };
}

test("shared memory context selects strategy history and exposes only bounded safe fields", async () => {
  let call;
  const service = createMemoryContextService({ retrievalService: { retrieve: async (...args) => { call = args; return retrievalResult(); } } });
  const result = await service.enrichCopilotPayload({
    userId: "user-1",
    featureType: "answerStrategyQuestion",
    payload: { question: "Which version worked best?", strategy: { id: "strategy-1", name: "Momentum" } },
  });
  assert.equal(call[0], "user-1");
  assert.equal(call[1].mode, "PAST_OUTCOMES");
  assert.ok(call[1].categories.includes("STRATEGY"));
  assert.deepEqual(call[1].entityFilters, [{ entityType: "STRATEGY", entityId: "strategy-1" }]);
  assert.equal(call[1].tokenBudget, 1200);
  assert.equal(result.payload.relevantHistoricalContext.memories[0].title, "Momentum v8 deployed");
  assert.equal(result.payload.relevantHistoricalContext.memories[0].vector, undefined);
  assert.equal(result.payload.relevantHistoricalContext.memories[0].structuredData, undefined);
  assert.equal(result.payload.relevantHistoricalContext.memories[0].memoryEventId, undefined);
  assert.equal(result.historicalContextUsed.memories[0].summary, undefined);
});

test("research impact features use research categories instead of the named affected system", async () => {
  let request;
  const service = createMemoryContextService({ retrievalService: { retrieve: async (_userId, value) => { request = value; return retrievalResult(); } } });
  await service.enrichCopilotPayload({ userId: "user-1", featureType: "strategyImpact", payload: { question: "Which strategies benefit?" } });
  assert.ok(request.categories.includes("RESEARCH"));
  assert.ok(request.categories.includes("SCANNER"));
});

test("one shared knowledge layer profiles all four copilots", () => {
  const service = createMemoryContextService();
  assert.equal(service.profileForFeature("answerStrategyQuestion")[0], "STRATEGY");
  assert.equal(service.profileForFeature("portfolioCopilotQuestion")[0], "PORTFOLIO");
  assert.equal(service.profileForFeature("deepResearch")[0], "RESEARCH");
  assert.equal(service.profileForFeature("matrixQuestionAnswer")[0], "MATRIX");
});

test("memory retrieval failure does not block copilot payload construction", async () => {
  const service = createMemoryContextService({
    retrievalService: { retrieve: async () => { throw Object.assign(new Error("pgvector unavailable"), { code: "PGVECTOR" }); } },
    logger: { warn() {} },
  });
  const result = await service.enrichCopilotPayload({ userId: "user-1", featureType: "portfolioCopilotQuestion", payload: { question: "Why is drawdown rising?" } });
  assert.equal(result.historicalContextUsed.status, "MEMORY_UNAVAILABLE");
  assert.equal(result.historicalContextUsed.notice, EMPTY_NOTICE);
  assert.deepEqual(result.payload.relevantHistoricalContext.memories, []);
});

test("unsupported non-copilot features do not invoke memory retrieval", async () => {
  let calls = 0;
  const service = createMemoryContextService({ retrievalService: { retrieve: async () => { calls += 1; } } });
  const payload = { symbol: "NVDA" };
  const result = await service.enrichCopilotPayload({ userId: "user-1", featureType: "analyzeStock", payload });
  assert.equal(calls, 0);
  assert.equal(result.payload, payload);
  assert.equal(result.historicalContextUsed.mode, "OFF");
});
