const assert = require("node:assert/strict");
const test = require("node:test");
const { createMemoryEmbeddingService } = require("../features/memory/services/memoryEmbedding.service");

function memory(overrides = {}) {
  return {
    id: "memory-1", userId: "user-1", category: "TRADE", eventType: "TRADE_CLOSED",
    title: "Trade closed", summary: "NVDA trade closed profitably.", structuredData: { symbol: "NVDA", outcome: "PROFITABLE" },
    importance: 95, occurredAt: new Date("2026-07-10T00:00:00Z"), retentionState: "ACTIVE",
    excludedFromAi: false, contentHash: "memory-hash", schemaVersion: "1",
    links: [{ entityType: "SYMBOL", entityId: "NVDA", relationshipType: "RELATED_TO" }],
    ...overrides,
  };
}

function harness({ providerFailure = null, memoryRecord = memory() } = {}) {
  const embeddings = new Map();
  const db = {
    memoryEvent: { findFirst: async ({ where }) => where.id === memoryRecord.id && (!where.userId || where.userId === memoryRecord.userId) ? memoryRecord : null },
    memoryEmbedding: {
      create: async ({ data }) => { const value = { id: "embedding-1", attemptCount: 0, createdAt: new Date(), ...data }; embeddings.set(data.memoryEventId, value); return value; },
      upsert: async ({ where, create, update }) => { const current = embeddings.get(where.memoryEventId); const value = current ? { ...current, ...Object.fromEntries(Object.entries(update).filter(([, item]) => item !== undefined)) } : { id: "embedding-1", attemptCount: 0, createdAt: new Date(), ...create }; embeddings.set(where.memoryEventId, value); return value; },
      update: async ({ where, data }) => { const current = embeddings.get(where.memoryEventId); const value = { ...current, ...data }; embeddings.set(where.memoryEventId, value); return value; },
      updateMany: async ({ where, data }) => { const current = embeddings.get(memoryRecord.id); if (!current || (where.claimToken && current.claimToken !== where.claimToken)) return { count: 0 }; embeddings.set(memoryRecord.id, { ...current, ...data }); return { count: 1 }; },
    },
  };
  const prisma = { run: (operation) => operation(db) };
  const vectorRepository = {
    getByMemory: async (_userId, id) => embeddings.get(id) || null,
    clearVector: async (_userId, id, status) => { const current = embeddings.get(id); if (current) embeddings.set(id, { ...current, status, vector: null, claimToken: null }); return current ? 1 : 0; },
    claimBatch: async () => {
      const current = embeddings.get(memoryRecord.id);
      if (!current || !["PENDING", "STALE", "FAILED"].includes(current.status)) return [];
      const claimed = { ...current, status: "PROCESSING", attemptCount: current.attemptCount + 1, claimToken: "claim-1" };
      embeddings.set(memoryRecord.id, claimed);
      return [claimed];
    },
    storeVector: async ({ memoryEventId, vector, sourceContentHash }) => { const current = embeddings.get(memoryEventId); embeddings.set(memoryEventId, { ...current, vector, sourceContentHash, status: "COMPLETED", claimToken: null }); return 1; },
    diagnostics: async () => ({ extension: { available: true }, total: embeddings.size }),
  };
  const provider = {
    isConfigured: () => true,
    diagnostics: () => ({ configured: true }),
    embed: async (documents) => { if (typeof providerFailure === "function") await providerFailure(); else if (providerFailure) throw providerFailure; return { vectors: documents.map(() => [0.1, 0.2, 0.3]) }; },
  };
  const config = { enabled: true, provider: "OPENAI", model: "test", dimensions: 3, embeddingVersion: "1", documentBuilderVersion: "1", minImportance: 30, maxAttempts: 2, retryBaseMs: 10, batchSize: 25, maxConcurrency: 1, leaseMs: 1000, pollIntervalMs: 1000 };
  const service = createMemoryEmbeddingService({ prisma, config, provider, vectorRepository, logger: { warn() {} } });
  return { service, embeddings };
}

test("embedding jobs are idempotent and unchanged completed content is skipped", async () => {
  const { service, embeddings } = harness();
  assert.equal((await service.enqueueMemory("memory-1", { userId: "user-1" })).queued, true);
  assert.deepEqual(await service.processBatch(), { claimed: 1, completed: 1 });
  assert.equal(embeddings.get("memory-1").status, "COMPLETED");
  const retry = await service.enqueueMemory("memory-1", { userId: "user-1" });
  assert.equal(retry.reason, "UNCHANGED");
});

test("embedding provider failures are retained for bounded retry", async () => {
  const error = new Error("provider unavailable"); error.code = "PROVIDER";
  const { service, embeddings } = harness({ providerFailure: error });
  await service.enqueueMemory("memory-1", { userId: "user-1" });
  const result = await service.processBatch();
  assert.deepEqual(result, { claimed: 1, completed: 0 });
  assert.equal(embeddings.get("memory-1").status, "FAILED");
  assert.equal(embeddings.get("memory-1").lastErrorCategory, "PROVIDER");
  assert.ok(embeddings.get("memory-1").nextAttemptAt instanceof Date);
});

test("excluded memories clear derived vectors without changing the memory event", async () => {
  const record = memory({ excludedFromAi: true });
  const { service, embeddings } = harness({ memoryRecord: record });
  const result = await service.enqueueMemory("memory-1", { userId: "user-1" });
  assert.equal(result.reason, "EXCLUDED_FROM_AI");
  assert.equal(embeddings.get("memory-1").status, "EXCLUDED");
  assert.equal(record.excludedFromAi, true);
});

test("source changes mark completed embeddings stale and rebuild them", async () => {
  const record = memory(); const { service, embeddings } = harness({ memoryRecord: record });
  await service.enqueueMemory(record.id, { userId: record.userId }); await service.processBatch();
  record.summary = "NVDA trade outcome was corrected."; record.contentHash = "corrected-hash";
  const queued = await service.enqueueMemory(record.id, { userId: record.userId });
  assert.equal(queued.queued, true); assert.equal(embeddings.get(record.id).status, "STALE");
  assert.deepEqual(await service.processBatch(), { claimed: 1, completed: 1 });
  assert.equal(embeddings.get(record.id).status, "COMPLETED");
});

test("failed jobs recover on a later successful attempt", async () => {
  let calls = 0; const transient = async () => { calls += 1; if (calls === 1) { const error = new Error("temporary outage"); error.code = "PROVIDER"; throw error; } };
  const { service, embeddings } = harness({ providerFailure: transient });
  await service.enqueueMemory("memory-1", { userId: "user-1" });
  assert.deepEqual(await service.processBatch(), { claimed: 1, completed: 0 });
  assert.equal(embeddings.get("memory-1").status, "FAILED");
  assert.deepEqual(await service.processBatch(), { claimed: 1, completed: 1 });
  assert.equal(embeddings.get("memory-1").status, "COMPLETED");
});
