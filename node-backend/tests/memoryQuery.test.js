const assert = require("node:assert/strict");
const test = require("node:test");
const { createMemoryQueryService } = require("../features/memory/services/memoryQuery.service");

function fixture() {
  const event = { id: "memory-1", userId: "user-1", category: "MATRIX", eventType: "MATRIX_DEPLOYED", retentionState: "ACTIVE", excludedFromAi: false, links: [{ entityType: "SYMBOL", entityId: "NVDA" }], feedback: [] };
  let capturedWhere = null;
  const db = {
    memoryEvent: {
      findMany: async ({ where }) => { capturedWhere = where; return [event]; }, count: async () => 1,
      findFirst: async ({ where }) => where.userId === event.userId && where.id === event.id ? event : null,
      update: async ({ data }) => Object.assign(event, data),
      groupBy: async () => [], aggregate: async () => ({ _avg: {}, _min: {}, _max: {} }),
    },
    memoryFeedback: { create: async ({ data }) => ({ id: "feedback-1", ...data }) },
    $transaction: async (operation) => operation(db),
  };
  return { prisma: { run: async (operation) => operation(db) }, event, get where() { return capturedWhere; } };
}

test("structured memory queries enforce user/category/date/entity filters and pagination", async () => {
  const store = fixture(); const service = createMemoryQueryService({ prisma: store.prisma });
  const result = await service.list("user-1", { category: "matrix", from: "2026-07-01", to: "2026-07-31", entityType: "SYMBOL", entityId: "NVDA", pageSize: 500 });
  assert.equal(result.pagination.pageSize, 100); assert.equal(store.where.userId, "user-1"); assert.equal(store.where.category, "MATRIX"); assert.equal(store.where.links.some.entityId, "NVDA"); assert.ok(store.where.occurredAt.gte instanceof Date);
});

test("memory feedback can exclude an owned event from future AI use", async () => {
  const store = fixture(); const service = createMemoryQueryService({ prisma: store.prisma });
  const feedback = await service.feedback("user-1", "memory-1", { feedbackType: "EXCLUDE_FROM_AI", comment: "Do not use this event." });
  assert.equal(feedback.feedbackType, "EXCLUDE_FROM_AI"); assert.equal(store.event.excludedFromAi, true); assert.equal(store.event.retentionState, "EXCLUDED");
  await assert.rejects(() => service.get("user-2", "memory-1"), /not found/i);
});

test("archive is owner-scoped and timeline requires an entity", async () => {
  const store = fixture(); const service = createMemoryQueryService({ prisma: store.prisma });
  await service.archive("user-1", "memory-1"); assert.equal(store.event.retentionState, "ARCHIVED");
  await assert.rejects(() => service.timeline("user-1", {}), /requires a linked entity/i);
});
