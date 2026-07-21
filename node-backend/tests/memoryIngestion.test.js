const assert = require("node:assert/strict");
const test = require("node:test");
const { createMemoryIngestionService } = require("../features/memory/services/memoryIngestion.service");

function fakePrisma() {
  const events = new Map(); let creates = 0;
  const db = {
    strategyRun: { findFirst: async ({ where }) => where.userId === "user-1" && where.id === "run-1" ? { id: "run-1" } : null },
    memoryEvent: {
      findUnique: async ({ where }) => events.get(`${where.userId_dedupeKey.userId}:${where.userId_dedupeKey.dedupeKey}`) || null,
      create: async ({ data }) => { creates += 1; const record = { id: `memory-${creates}`, ...data, links: data.links.create.map((item, index) => ({ id: `link-${index}`, ...item })) }; events.set(`${data.userId}:${data.dedupeKey}`, record); return record; },
    },
    $transaction: async (operation) => operation(db),
  };
  return { prisma: { run: async (operation) => operation(db) }, events, get creates() { return creates; } };
}
function input(userId = "user-1") { return { userId, eventType: "BACKTEST_COMPLETED", title: "Backtest completed", summary: "Momentum backtest completed.", sourceType: "STRATEGY_RUN", sourceId: "run-1", structuredData: { sharpe: 1.1 }, links: [{ entityType: "STRATEGY_RUN", entityId: "run-1", relationshipType: "VALIDATED_BY" }] }; }

test("memory ingestion creates an event and links transactionally and dedupes retries", async () => {
  const store = fakePrisma(); const service = createMemoryIngestionService({ prisma: store.prisma, logger: { info() {}, warn() {} } });
  const first = await service.recordEvent(input(), { critical: true }); const retry = await service.recordEvent(input(), { critical: true });
  assert.equal(first.duplicate, false); assert.equal(first.event.links.length, 1); assert.equal(retry.duplicate, true); assert.equal(store.creates, 1); assert.equal(service.diagnostics().duplicatesSkipped, 1);
});

test("memory source ownership isolation rejects another user's source", async () => {
  const store = fakePrisma(); const service = createMemoryIngestionService({ prisma: store.prisma, logger: { info() {}, warn() {} } });
  await assert.rejects(() => service.recordEvent(input("user-2"), { critical: true }), /not found for this user/i);
  assert.equal(store.creates, 0);
});

test("non-critical memory failures do not break business flows", async () => {
  const service = createMemoryIngestionService({ prisma: { run: async () => { throw new Error("memory unavailable"); } }, logger: { info() {}, warn() {} } });
  const result = await service.recordEvent(input());
  assert.equal(result.event, null); assert.match(result.error, /memory unavailable/);
});
