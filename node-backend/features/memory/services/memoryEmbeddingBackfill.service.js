const { requireUserId } = require("../../../repositories/ownership");

function parseDate(value, label) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid date.`);
  return parsed;
}

function createMemoryEmbeddingBackfillService({ prisma, embeddingService, config } = {}) {
  async function run(userId, options = {}) {
    const ownerId = requireUserId(userId);
    const limit = Math.min(1000, Math.max(1, Number(options.limit) || 250));
    const batchSize = Math.min(config.batchSize, Math.max(1, Number(options.batchSize) || config.batchSize));
    const from = parseDate(options.from, "from");
    const to = parseDate(options.to, "to");
    const where = {
      userId: ownerId,
      retentionState: "ACTIVE",
      excludedFromAi: false,
      importance: { gte: Math.max(config.minImportance, Number(options.minImportance) || 0) },
      ...(options.category ? { category: String(options.category).toUpperCase() } : {}),
      ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const events = await prisma.run((db) => db.memoryEvent.findMany({
      where,
      select: { id: true, category: true, eventType: true, importance: true, occurredAt: true },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: limit,
    }));
    if (options.dryRun === true || String(options.dryRun).toLowerCase() === "true") {
      return { dryRun: true, matched: events.length, queued: 0, events };
    }

    let queued = 0;
    let skipped = 0;
    const failures = [];
    for (let offset = 0; offset < events.length; offset += batchSize) {
      const chunk = events.slice(offset, offset + batchSize);
      for (const event of chunk) {
        try {
          const result = await embeddingService.enqueueMemory(event.id, { userId: ownerId });
          if (result.queued) queued += 1;
          else skipped += 1;
        } catch (error) {
          failures.push({ memoryEventId: event.id, category: error.code || "BACKFILL_ERROR" });
        }
      }
    }
    return { dryRun: false, matched: events.length, queued, skipped, failures };
  }

  return { run };
}

module.exports = { createMemoryEmbeddingBackfillService };
