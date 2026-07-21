const { randomUUID } = require("node:crypto");
const { Prisma } = require("@prisma/client");
const { requireUserId } = require("../../../repositories/ownership");

const METADATA_SELECT = Object.freeze({
  id: true,
  userId: true,
  memoryEventId: true,
  embeddingProvider: true,
  embeddingModel: true,
  embeddingVersion: true,
  documentBuilderVersion: true,
  dimensions: true,
  sourceContentHash: true,
  documentPreview: true,
  status: true,
  attemptCount: true,
  lastErrorCategory: true,
  lastAttemptAt: true,
  nextAttemptAt: true,
  claimedAt: true,
  claimToken: true,
  embeddedAt: true,
  createdAt: true,
  updatedAt: true,
});

function validateVector(vector, dimensions) {
  if (!Array.isArray(vector) || vector.length !== dimensions) {
    throw new Error(`Vector must contain exactly ${dimensions} dimensions.`);
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Vector values must be finite numbers.");
  }
  return `[${vector.join(",")}]`;
}

function createMemoryVectorRepository({ prisma, dimensions = 1536 } = {}) {
  if (!prisma?.run) throw new Error("Prisma is required for the memory vector repository.");
  const searchLatencyMs = [];
  function percentile(values, pct) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * pct))];
  }

  async function getByMemory(userId, memoryEventId) {
    const ownerId = requireUserId(userId);
    return prisma.run((db) => db.memoryEmbedding.findFirst({
      where: { userId: ownerId, memoryEventId: String(memoryEventId) },
      select: METADATA_SELECT,
    }));
  }

  async function clearVector(userId, memoryEventId, status = "EXCLUDED") {
    const ownerId = requireUserId(userId);
    return prisma.run((db) => db.$executeRaw`
      UPDATE "MemoryEmbedding"
      SET "embedding" = NULL,
          "status" = ${status}::"MemoryEmbeddingStatus",
          "claimToken" = NULL,
          "claimedAt" = NULL,
          "updatedAt" = NOW()
      WHERE "userId" = ${ownerId}
        AND "memoryEventId" = ${String(memoryEventId)}
    `);
  }

  async function storeVector({ userId, memoryEventId, claimToken, vector, sourceContentHash }) {
    const ownerId = requireUserId(userId);
    const literal = validateVector(vector, dimensions);
    return prisma.run((db) => db.$executeRaw`
      UPDATE "MemoryEmbedding"
      SET "embedding" = ${literal}::vector,
          "sourceContentHash" = ${sourceContentHash},
          "status" = 'COMPLETED'::"MemoryEmbeddingStatus",
          "embeddedAt" = NOW(),
          "lastErrorCategory" = NULL,
          "nextAttemptAt" = NULL,
          "claimToken" = NULL,
          "claimedAt" = NULL,
          "updatedAt" = NOW()
      WHERE "userId" = ${ownerId}
        AND "memoryEventId" = ${String(memoryEventId)}
        AND "claimToken" = ${String(claimToken)}
    `);
  }

  async function claimBatch({ limit, maxAttempts, leaseMs }) {
    const claimToken = randomUUID();
    const leaseCutoff = new Date(Date.now() - leaseMs);
    const rows = await prisma.run((db) => db.$queryRaw`
      WITH candidates AS (
        SELECT "id"
        FROM "MemoryEmbedding"
        WHERE "attemptCount" < ${maxAttempts}
          AND (
            ("status" IN ('PENDING', 'STALE', 'FAILED') AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW()))
            OR ("status" = 'PROCESSING' AND "claimedAt" < ${leaseCutoff})
          )
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE "MemoryEmbedding" AS embedding
      SET "status" = 'PROCESSING',
          "claimToken" = ${claimToken},
          "claimedAt" = NOW(),
          "lastAttemptAt" = NOW(),
          "attemptCount" = embedding."attemptCount" + 1,
          "updatedAt" = NOW()
      FROM candidates
      WHERE embedding."id" = candidates."id"
      RETURNING embedding."id", embedding."userId", embedding."memoryEventId",
        embedding."embeddingProvider", embedding."embeddingModel",
        embedding."embeddingVersion", embedding."documentBuilderVersion",
        embedding."dimensions", embedding."sourceContentHash",
        embedding."attemptCount", embedding."claimToken", embedding."createdAt"
    `);
    return rows;
  }

  async function diagnostics(userId = null) {
    const ownerId = userId ? requireUserId(userId) : null;
    const where = ownerId ? { userId: ownerId } : {};
    const [total, byStatus, vectorRows, extensionRows, indexRows] = await prisma.run((db) => Promise.all([
      db.memoryEmbedding.count({ where }),
      db.memoryEmbedding.groupBy({ by: ["status"], where, _count: true }),
      db.$queryRaw`
        SELECT COUNT(*)::integer AS count
        FROM "MemoryEmbedding"
        WHERE "embedding" IS NOT NULL
          AND (${ownerId}::text IS NULL OR "userId" = ${ownerId})
      `,
      db.$queryRaw`SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
      db.$queryRaw`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'MemoryEmbedding'
          AND indexdef ILIKE '%USING hnsw%'
      `,
    ]));
    return {
      total,
      indexed: Number(vectorRows[0]?.count || 0),
      missing: Math.max(0, total - Number(vectorRows[0]?.count || 0)),
      byStatus,
      extension: { available: extensionRows.length > 0, version: extensionRows[0]?.extversion || null },
      approximateIndex: { available: indexRows.length > 0, names: indexRows.map((row) => row.indexname) },
      searchMode: "EXACT_COSINE",
      queryLatencyMs: { samples: searchLatencyMs.length, p50: percentile(searchLatencyMs, 0.5), p95: percentile(searchLatencyMs, 0.95), p99: percentile(searchLatencyMs, 0.99) },
      hnswGuidance: {
        memoryCountThreshold: Number(process.env.MEMORY_HNSW_MIN_EMBEDDINGS) || 10000,
        p95LatencyThresholdMs: Number(process.env.MEMORY_HNSW_P95_THRESHOLD_MS) || 150,
        recommended: total >= (Number(process.env.MEMORY_HNSW_MIN_EMBEDDINGS) || 10000) && (percentile(searchLatencyMs, 0.95) || 0) >= (Number(process.env.MEMORY_HNSW_P95_THRESHOLD_MS) || 150),
      },
    };
  }

  async function exactSelfSimilarity(userId, memoryEventId) {
    const ownerId = requireUserId(userId);
    const rows = await prisma.run((db) => db.$queryRaw`
      SELECT 1 - ("embedding" <=> "embedding") AS similarity
      FROM "MemoryEmbedding"
      WHERE "userId" = ${ownerId}
        AND "memoryEventId" = ${String(memoryEventId)}
        AND "embedding" IS NOT NULL
      LIMIT 1
    `);
    return rows[0] ? Number(rows[0].similarity) : null;
  }

  async function searchSimilar({ userId, vector, filters = {}, limit = 50, minimumSimilarity = 0 }) {
    const startedAt = Date.now();
    const ownerId = requireUserId(userId);
    const literal = validateVector(vector, dimensions);
    const where = [
      Prisma.sql`event."userId" = ${ownerId}`,
      Prisma.sql`event."retentionState" = 'ACTIVE'::"MemoryRetentionState"`,
      Prisma.sql`event."excludedFromAi" = false`,
      Prisma.sql`embedding."status" = 'COMPLETED'::"MemoryEmbeddingStatus"`,
      Prisma.sql`embedding."embedding" IS NOT NULL`,
      Prisma.sql`1 - (embedding."embedding" <=> ${literal}::vector) >= ${minimumSimilarity}`,
    ];
    if (filters.categories?.length) {
      where.push(Prisma.sql`event."category"::text IN (${Prisma.join(filters.categories)})`);
    }
    if (filters.eventTypes?.length) {
      where.push(Prisma.sql`event."eventType" IN (${Prisma.join(filters.eventTypes)})`);
    }
    if (filters.minimumImportance > 0) {
      where.push(Prisma.sql`event."importance" >= ${filters.minimumImportance}`);
    }
    if (filters.dateRange?.from) where.push(Prisma.sql`event."occurredAt" >= ${filters.dateRange.from}`);
    if (filters.dateRange?.to) where.push(Prisma.sql`event."occurredAt" <= ${filters.dateRange.to}`);
    if (filters.entityFilters?.length) {
      const links = filters.entityFilters.map((item) => Prisma.sql`(link."entityType" = ${item.entityType} AND link."entityId" = ${item.entityId})`);
      where.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "MemoryLink" AS link
        WHERE link."memoryEventId" = event."id"
          AND link."userId" = ${ownerId}
          AND (${Prisma.join(links, " OR ")})
      )`);
    }
    try {
      return await prisma.run((db) => db.$queryRaw(Prisma.sql`
      SELECT event."id" AS "memoryEventId",
        1 - (embedding."embedding" <=> ${literal}::vector) AS similarity
      FROM "MemoryEmbedding" AS embedding
      INNER JOIN "MemoryEvent" AS event ON event."id" = embedding."memoryEventId"
      WHERE ${Prisma.join(where, " AND ")}
      ORDER BY similarity DESC, event."importance" DESC, event."occurredAt" DESC
      LIMIT ${Math.min(200, Math.max(1, Number(limit) || 50))}
      `));
    } finally {
      searchLatencyMs.push(Date.now() - startedAt);
      if (searchLatencyMs.length > 500) searchLatencyMs.shift();
    }
  }

  return { claimBatch, clearVector, diagnostics, exactSelfSimilarity, getByMemory, searchSimilar, storeVector };
}

module.exports = { METADATA_SELECT, createMemoryVectorRepository, validateVector };
