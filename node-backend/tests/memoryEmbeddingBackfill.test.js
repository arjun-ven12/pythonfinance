const assert = require("node:assert/strict");
const test = require("node:test");
const { createMemoryEmbeddingBackfillService } = require("../features/memory/services/memoryEmbeddingBackfill.service");

test("embedding backfill is user-scoped, dry-run safe, and resumable", async () => {
  const events = [
    { id: "memory-1", category: "TRADE", eventType: "TRADE_CLOSED", importance: 95, occurredAt: new Date() },
    { id: "memory-2", category: "TRADE", eventType: "ORDER_FILLED", importance: 98, occurredAt: new Date() },
  ];
  let capturedWhere;
  const prisma = { run: (operation) => operation({ memoryEvent: { findMany: async ({ where }) => { capturedWhere = where; return events; } } }) };
  const queued = [];
  const embeddingService = { enqueueMemory: async (id, options) => { queued.push({ id, options }); return { queued: true }; } };
  const service = createMemoryEmbeddingBackfillService({ prisma, embeddingService, config: { batchSize: 25, minImportance: 30 } });
  const dryRun = await service.run("user-1", { dryRun: true });
  assert.equal(dryRun.matched, 2);
  assert.equal(queued.length, 0);
  const result = await service.run("user-1", { limit: 1 });
  assert.equal(result.queued, 2);
  assert.equal(capturedWhere.userId, "user-1");
  assert.deepEqual(queued.map((item) => item.options.userId), ["user-1", "user-1"]);
});
