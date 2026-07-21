const assert = require("node:assert/strict");
const test = require("node:test");
const { createMemoryBackfillService } = require("../features/memory/services/memoryBackfill.service");

test("bounded memory backfill is user-scoped, resumable, and idempotent", async () => {
  const createdAt = new Date("2026-07-12T00:00:00Z"); const seen = new Set(); const whereUsers = [];
  const empty = async ({ where }) => { whereUsers.push(where.userId); return []; };
  const db = {
    strategyVersion: { findMany: async ({ where }) => { whereUsers.push(where.userId); return [{ id: "v1", userId: where.userId, experimentId: "s1", version: 1, deploymentStatus: "DRAFT", createdAt, experiment: { name: "Momentum" } }]; } },
    strategyRun: { findMany: empty }, matrixReplaySnapshot: { findMany: empty }, matrixProposal: { findMany: empty }, portfolioProposal: { findMany: empty }, researchProject: { findMany: empty }, researchReport: { findMany: empty }, approvalRequest: { findMany: empty }, brokerFill: { findMany: empty },
  };
  const ingestionService = { recordEvents: async (events) => events.map((event) => { const key = `${event.eventType}:${event.sourceId}:${event.sourceVersion}`; const duplicate = seen.has(key); seen.add(key); return { event: { id: key }, duplicate }; }) };
  const service = createMemoryBackfillService({ prisma: { run: async (operation) => operation(db) }, ingestionService, logger: { info() {} } });
  const first = await service.run("user-1", { limit: 10 }); const retry = await service.run("user-1", { limit: 10 });
  assert.equal(first.ingested, 1); assert.equal(retry.duplicates, 1); assert.ok(whereUsers.every((userId) => userId === "user-1")); assert.equal(first.nextCursor, createdAt.toISOString());
});

test("memory backfill dry run reports planned events without writing", async () => {
  const createdAt = new Date("2026-07-12T00:00:00Z");
  let writes = 0;
  const db = {
    strategyVersion: { findMany: async ({ where }) => [{ id: "v1", userId: where.userId, experimentId: "s1", version: 1, deploymentStatus: "ACTIVE", createdAt, experiment: { name: "Momentum" } }] },
  };
  const service = createMemoryBackfillService({
    prisma: { run: async (operation) => operation(db) },
    ingestionService: { recordEvents: async () => { writes += 1; return []; } },
    logger: { info() {} },
  });
  const result = await service.run("user-1", { dryRun: true, limit: 10 });
  assert.equal(result.dryRun, true);
  assert.equal(result.planned, 1);
  assert.equal(result.plannedByType.STRATEGY_DEPLOYED, 1);
  assert.equal(writes, 0);
});
