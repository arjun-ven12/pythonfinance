const { requireUserId } = require("../../../repositories/ownership");

function createMemoryRetrievalAuditService({ prisma } = {}) {
  async function record(userId, data) {
    const ownerId = requireUserId(userId);
    return prisma.run((db) => db.memoryRetrievalAudit.create({
      data: {
        userId: ownerId,
        requestingFeature: data.requestingFeature,
        queryHash: data.queryHash,
        intent: data.intent,
        memoryMode: data.memoryMode,
        filters: data.filters,
        candidateCounts: data.candidateCounts,
        finalMemoryIds: data.finalMemoryIds,
        scoreRange: data.scoreRange,
        retrievalStatus: data.retrievalStatus,
        latencyMs: data.latencyMs,
        vectorSearchUsed: data.vectorSearchUsed,
        fallbackUsed: data.fallbackUsed,
        rankingVersion: data.rankingVersion,
        contextTokenEstimate: data.contextTokenEstimate,
      },
      select: { id: true, createdAt: true },
    }));
  }

  async function get(userId, id) {
    const audit = await prisma.run((db) => db.memoryRetrievalAudit.findFirst({
      where: { id: String(id), userId: requireUserId(userId) },
    }));
    if (!audit) { const error = new Error("Memory retrieval audit not found."); error.statusCode = 404; throw error; }
    return audit;
  }
  async function annotatePersonalization(userId, id, data = {}) {
    const ownerId = requireUserId(userId);
    const record = await prisma.run((db) => db.memoryRetrievalAudit.findFirst({ where: { id: String(id), userId: ownerId }, select: { id: true } }));
    if (!record) return null;
    return prisma.run((db) => db.memoryRetrievalAudit.update({ where: { id: record.id }, data: { profileVersion: data.profileVersion || null, preferenceIds: data.preferenceIds || [], patternIds: data.patternIds || [] } }));
  }

  async function diagnostics() {
    const [total, byStatus, byIntent, averages] = await prisma.run((db) => Promise.all([
      db.memoryRetrievalAudit.count(),
      db.memoryRetrievalAudit.groupBy({ by: ["retrievalStatus"], _count: true }),
      db.memoryRetrievalAudit.groupBy({ by: ["intent"], _count: true, orderBy: { _count: { intent: "desc" } }, take: 20 }),
      db.memoryRetrievalAudit.aggregate({ _avg: { latencyMs: true, contextTokenEstimate: true } }),
    ]));
    return { total, byStatus, byIntent, averages };
  }

  return { annotatePersonalization, diagnostics, get, record };
}

module.exports = { createMemoryRetrievalAuditService };
