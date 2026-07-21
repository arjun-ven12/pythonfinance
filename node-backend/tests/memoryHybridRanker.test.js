const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMemoryRetrievalConfig } = require("../features/memory/config/memoryRetrieval.config");
const { createMemoryHybridRanker } = require("../features/memory/services/memoryHybridRanker");
const { createMemoryContextService } = require("../features/memory/services/memoryContext.service");

function memory(id, overrides = {}) {
  return { id, category: "TRADE", eventType: "TRADE_CLOSED", title: `Memory ${id}`, summary: "NVDA momentum trade outcome.", structuredData: { outcome: "PROFITABLE" }, sourceType: "TRADE", sourceId: id, sourceVersion: "1", contentHash: `hash-${id}`, importance: 80, confidence: 80, occurredAt: new Date("2026-07-01"), createdByType: "SYSTEM", links: [{ entityType: "SYMBOL", entityId: "NVDA", relationshipType: "RELATED_TO" }], feedback: [], ...overrides };
}
function request(overrides = {}) { return { intent: "PAST_OUTCOME", mode: "RELEVANT_HISTORY", entityFilters: [{ entityType: "SYMBOL", entityId: "NVDA" }], minimumSimilarity: 0.3, maximumResults: 12, ...overrides }; }

test("hybrid ranker exposes configurable score components and retrieval reasons", () => {
  const config = buildMemoryRetrievalConfig({ MEMORY_RETRIEVAL_WEIGHTS_JSON: JSON.stringify({ semantic: 1, entity: 0, keyword: 0, importance: 0, recency: 0, feedback: 0, outcome: 0, provenance: 0 }) });
  const ranker = createMemoryHybridRanker({ config, now: () => new Date("2026-07-13").getTime() });
  const [ranked] = ranker.rankAll([memory("1")], new Map([["1", { semantic: 0.9 }]]), request());
  assert.equal(ranked.components.semantic, 0.9);
  assert.ok(ranked.finalScore > 0.8);
  assert.ok(ranked.whyRetrieved.some((reason) => reason.includes("exact symbol")));
});

test("feedback and outcomes affect ranking and incorrect memories are excluded", () => {
  const config = buildMemoryRetrievalConfig({});
  const ranker = createMemoryHybridRanker({ config, now: () => new Date("2026-07-13").getTime() });
  const useful = memory("useful", { feedback: [{ feedbackType: "CONFIRMED_BY_OUTCOME" }] });
  const neutral = memory("neutral");
  const incorrect = memory("incorrect", { feedback: [{ feedbackType: "INCORRECT" }] });
  const ranked = ranker.rankAll([neutral, useful, incorrect], new Map(), request());
  assert.equal(ranked[0].memory.id, "useful");
  assert.equal(ranked.some((item) => item.memory.id === "incorrect"), false);
  assert.equal(ranked[0].outcomeStatus, "POSITIVE_OUTCOME");
});

test("ranker deduplicates source/content and preserves category diversity", () => {
  const config = buildMemoryRetrievalConfig({});
  const ranker = createMemoryHybridRanker({ config, now: () => new Date("2026-07-13").getTime() });
  const values = [memory("1"), memory("2", { sourceId: "1", contentHash: "hash-2" }), memory("3", { category: "RESEARCH" }), memory("4", { category: "MATRIX" })];
  const ranked = ranker.rankAll(values, new Map(), request({ entityFilters: [], intent: "GENERAL_MEMORY_SEARCH", maximumResults: 4 }));
  assert.equal(ranked.some((item) => item.memory.id === "2"), false);
  assert.ok(new Set(ranked.map((item) => item.memory.category)).size >= 2);
});

test("context assembly keeps whole records within token budget", () => {
  const service = createMemoryContextService();
  const ranked = ["1", "2", "3"].map((id, index) => ({ memory: memory(id, { summary: "x".repeat(500) }), finalScore: 0.9 - index * 0.1, outcomeStatus: "POSITIVE_OUTCOME", whyRetrieved: ["test"], components: {} }));
  const context = service.assemble(ranked, 400);
  assert.ok(context.tokenEstimate <= 400);
  assert.ok(context.omittedCount > 0);
  assert.ok(context.items.every((item) => item.summary.length === 500));
});
