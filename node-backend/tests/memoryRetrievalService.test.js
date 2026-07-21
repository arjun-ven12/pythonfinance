const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMemoryRetrievalConfig } = require("../features/memory/config/memoryRetrieval.config");
const { createMemoryHybridRanker } = require("../features/memory/services/memoryHybridRanker");
const { createMemoryContextService } = require("../features/memory/services/memoryContext.service");
const { createMemoryRetrievalService } = require("../features/memory/services/memoryRetrieval.service");

function memory(id = "memory-1") { return { id, category: "TRADE", eventType: "TRADE_CLOSED", title: "NVDA momentum trade", summary: "NVDA momentum trade closed profitably.", structuredData: { outcome: "PROFITABLE" }, sourceType: "TRADE", sourceId: id, sourceVersion: "1", contentHash: `hash-${id}`, importance: 95, confidence: 90, occurredAt: new Date("2026-07-10"), createdByType: "SYSTEM", links: [{ entityType: "SYMBOL", entityId: "NVDA", relationshipType: "RELATED_TO" }], feedback: [] }; }

function harness({ providerFails = false, vectorFails = false } = {}) {
  const item = memory(); let revision = "1"; let keywordCalls = 0; let auditCount = 0;
  const repository = {
    exactCandidates: async (_user, request) => request.entityFilters.length ? [item] : [],
    keywordCandidates: async () => { keywordCalls += 1; return [{ memoryEventId: item.id, rank: 0.2 }]; },
    recentImportant: async () => [item],
    hydrate: async (_user, ids) => ids.includes(item.id) ? [item] : [],
    revision: async () => revision,
  };
  const vectorRepository = { searchSimilar: async ({ userId }) => { assert.equal(userId, "user-1"); if (vectorFails) throw new Error("pgvector unavailable"); return [{ memoryEventId: item.id, similarity: 0.88 }]; } };
  const embeddingProvider = { embed: async () => { if (providerFails) throw new Error("provider unavailable"); return { vectors: [[0.1, 0.2, 0.3]] }; } };
  const audits = [];
  const auditService = { record: async (_user, data) => { auditCount += 1; audits.push(data); return { id: `audit-${auditCount}` }; }, get: async () => null, diagnostics: async () => ({ total: auditCount }) };
  const config = buildMemoryRetrievalConfig({ MEMORY_RETRIEVAL_CACHE_TTL_MS: "60000" });
  const service = createMemoryRetrievalService({ repository, vectorRepository, embeddingProvider, ranker: createMemoryHybridRanker({ config, now: () => new Date("2026-07-13").getTime() }), contextService: createMemoryContextService(), auditService, config, logger: { warn() {} } });
  return { service, audits, get keywordCalls() { return keywordCalls; }, setRevision(value) { revision = value; } };
}

test("retrieval service combines semantic, exact, keyword and provenance evidence", async () => {
  const store = harness();
  const result = await store.service.retrieve("user-1", { query: "Have I traded NVDA momentum setups before?" });
  assert.equal(result.memories[0].memoryEventId, "memory-1");
  assert.equal(result.memories[0].scoreComponents.semantic, 0.88);
  assert.ok(result.memories[0].whyRetrieved.length > 0);
  assert.equal(result.diagnostics.vectorSearchUsed, true);
  assert.equal(store.audits[0].query, undefined);
  assert.equal(store.audits[0].finalMemoryIds[0], "memory-1");
});

test("query embedding and pgvector failures degrade to structured retrieval", async () => {
  for (const options of [{ providerFails: true }, { vectorFails: true }]) {
    const result = await harness(options).service.retrieve("user-1", { query: "NVDA trade history" });
    assert.equal(result.memories[0].memoryEventId, "memory-1");
    assert.equal(result.diagnostics.fallbackUsed, true);
  }
});

test("retrieval cache uses revision invalidation and does not cache across users", async () => {
  const store = harness();
  const input = { query: "NVDA trade history" };
  await store.service.retrieve("user-1", input);
  await store.service.retrieve("user-1", input);
  assert.equal(store.keywordCalls, 1);
  store.setRevision("2");
  await store.service.retrieve("user-1", input);
  assert.equal(store.keywordCalls, 2);
  await store.service.retrieve("user-2", input);
  assert.equal(store.keywordCalls, 3);
});

test("OFF mode returns no context and no vectors", async () => {
  const result = await harness().service.retrieve("user-1", { query: "", mode: "OFF" });
  assert.equal(result.retrievalStatus, "NO_RELEVANT_MEMORY");
  assert.deepEqual(result.memories, []);
});

test("EXACT_ONLY returns no context instead of weak unrelated memories", async () => {
  const result = await harness().service.retrieve("user-1", { query: "something unrelated", mode: "EXACT_ONLY" });
  assert.equal(result.retrievalStatus, "NO_RELEVANT_MEMORY");
  assert.deepEqual(result.memories, []);
});

test("identical concurrent retrievals share candidate work", async () => {
  const store = harness();
  await Promise.all([
    store.service.retrieve("user-1", { query: "NVDA trade history" }),
    store.service.retrieve("user-1", { query: "NVDA trade history" }),
  ]);
  assert.equal(store.keywordCalls, 1);
});
