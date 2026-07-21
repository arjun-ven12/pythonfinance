const { Prisma } = require("@prisma/client");
const { requireUserId } = require("../../../repositories/ownership");

const EVENT_INCLUDE = Object.freeze({
  links: { select: { entityType: true, entityId: true, relationshipType: true } },
  feedback: { select: { feedbackType: true, createdAt: true }, orderBy: { createdAt: "desc" } },
});

function prismaWhere(userId, request, { requireEntity = false } = {}) {
  const ownerId = requireUserId(userId);
  const where = {
    userId: ownerId,
    retentionState: "ACTIVE",
    excludedFromAi: false,
    importance: { gte: request.minimumImportance || 0 },
  };
  if (request.categories?.length) where.category = { in: request.categories };
  if (request.eventTypes?.length) where.eventType = { in: request.eventTypes };
  if (request.dateRange?.from || request.dateRange?.to) {
    where.occurredAt = {
      ...(request.dateRange.from ? { gte: request.dateRange.from } : {}),
      ...(request.dateRange.to ? { lte: request.dateRange.to } : {}),
    };
  }
  if (requireEntity && request.entityFilters?.length) {
    where.OR = request.entityFilters.map((item) => ({
      links: { some: { userId: ownerId, entityType: item.entityType, entityId: item.entityId } },
    }));
  }
  return where;
}

function createMemoryRetrievalRepository({ prisma } = {}) {
  async function exactCandidates(userId, request, limit) {
    if (!request.entityFilters?.length) return [];
    return prisma.run((db) => db.memoryEvent.findMany({
      where: prismaWhere(userId, request, { requireEntity: true }),
      include: EVENT_INCLUDE,
      orderBy: [{ importance: "desc" }, { occurredAt: "desc" }],
      take: limit,
    }));
  }

  async function keywordCandidates(userId, request, limit) {
    const ownerId = requireUserId(userId);
    const query = request.query.trim();
    if (!query) return [];
    const where = [
      Prisma.sql`event."userId" = ${ownerId}`,
      Prisma.sql`event."retentionState" = 'ACTIVE'::"MemoryRetentionState"`,
      Prisma.sql`event."excludedFromAi" = false`,
      Prisma.sql`event."importance" >= ${request.minimumImportance || 0}`,
      Prisma.sql`to_tsvector('english', coalesce(event."title", '') || ' ' || coalesce(event."summary", '')) @@ websearch_to_tsquery('english', ${query})`,
    ];
    if (request.categories?.length) where.push(Prisma.sql`event."category"::text IN (${Prisma.join(request.categories)})`);
    if (request.eventTypes?.length) where.push(Prisma.sql`event."eventType" IN (${Prisma.join(request.eventTypes)})`);
    if (request.dateRange?.from) where.push(Prisma.sql`event."occurredAt" >= ${request.dateRange.from}`);
    if (request.dateRange?.to) where.push(Prisma.sql`event."occurredAt" <= ${request.dateRange.to}`);
    return prisma.run((db) => db.$queryRaw(Prisma.sql`
      SELECT event."id" AS "memoryEventId",
        ts_rank_cd(
          to_tsvector('english', coalesce(event."title", '') || ' ' || coalesce(event."summary", '')),
          websearch_to_tsquery('english', ${query})
        ) AS rank
      FROM "MemoryEvent" AS event
      WHERE ${Prisma.join(where, " AND ")}
      ORDER BY rank DESC, event."importance" DESC, event."occurredAt" DESC
      LIMIT ${limit}
    `));
  }

  async function recentImportant(userId, request, limit) {
    return prisma.run((db) => db.memoryEvent.findMany({
      where: prismaWhere(userId, request),
      include: EVENT_INCLUDE,
      orderBy: [{ importance: "desc" }, { occurredAt: "desc" }],
      take: limit,
    }));
  }

  async function hydrate(userId, ids) {
    const ownerId = requireUserId(userId);
    if (!ids.length) return [];
    return prisma.run((db) => db.memoryEvent.findMany({
      where: { id: { in: ids }, userId: ownerId, retentionState: "ACTIVE", excludedFromAi: false },
      include: EVENT_INCLUDE,
    }));
  }

  async function revision(userId) {
    const ownerId = requireUserId(userId);
    const [events, embeddings, feedback] = await prisma.run((db) => Promise.all([
      db.memoryEvent.aggregate({ where: { userId: ownerId }, _max: { updatedAt: true }, _count: true }),
      db.memoryEmbedding.aggregate({ where: { userId: ownerId }, _max: { updatedAt: true }, _count: true }),
      db.memoryFeedback.aggregate({ where: { userId: ownerId }, _max: { createdAt: true }, _count: true }),
    ]));
    return [events._count, events._max.updatedAt?.toISOString(), embeddings._count, embeddings._max.updatedAt?.toISOString(), feedback._count, feedback._max.createdAt?.toISOString()].join(":");
  }

  return { exactCandidates, hydrate, keywordCandidates, recentImportant, revision };
}

module.exports = { EVENT_INCLUDE, createMemoryRetrievalRepository, prismaWhere };
