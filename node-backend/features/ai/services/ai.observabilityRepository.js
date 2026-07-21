const defaultPrisma = require("../../../services/prisma");

const SAFE_ORDER_FIELDS = new Set([
  "createdAt", "totalTokens", "observabilityCostUsd", "latencyMs", "inputTokens", "outputTokens",
]);

function normalizeDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function createAiObservabilityRepository({ prisma = defaultPrisma } = {}) {
  function buildWhere(filters = {}) {
    const where = {};
    if (filters.feature) where.featureType = filters.feature;
    if (filters.userId) where.userId = filters.userId;
    if (filters.model) where.model = filters.model;
    if (filters.status) where.status = filters.status;
    if (filters.cacheStatus) where.cacheStatus = filters.cacheStatus;
    const since = normalizeDate(filters.since);
    const until = normalizeDate(filters.until);
    if (since || until) where.createdAt = { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) };
    return where;
  }

  async function list(filters = {}) {
    const take = Math.min(500, Math.max(1, Number(filters.take || 100)));
    const skip = Math.max(0, Number(filters.skip || 0));
    const orderField = SAFE_ORDER_FIELDS.has(filters.orderBy) ? filters.orderBy : "createdAt";
    const orderDirection = String(filters.order || "desc").toLowerCase() === "asc" ? "asc" : "desc";
    const where = buildWhere(filters);
    return prisma.run(async (db) => {
      const [rows, total] = await Promise.all([
        db.aiInvocation.findMany({
          where,
          orderBy: { [orderField]: orderDirection },
          take,
          skip,
          include: { user: { select: { id: true, email: true, name: true } } },
        }),
        db.aiInvocation.count({ where }),
      ]);
      return { rows, total, take, skip };
    });
  }

  async function findById(id) {
    return prisma.run((db) => db.aiInvocation.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true } } },
    }));
  }

  async function findRange({ since, until, limit = 25_000 } = {}) {
    const where = buildWhere({ since, until });
    return prisma.run((db) => db.aiInvocation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(100_000, Math.max(1, Number(limit || 25_000))),
      include: { user: { select: { id: true, email: true, name: true } } },
    }));
  }

  async function summarize({ since, until } = {}) {
    const where = buildWhere({ since, until });
    return prisma.run(async (db) => {
      const result = await db.aiInvocation.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          totalTokens: true,
          latencyMs: true,
          observabilityCostUsd: true,
          estimatedCostSgd: true,
        },
      });
      return {
        requests: result._count._all,
        totalTokens: Number(result._sum.totalTokens || 0),
        totalLatencyMs: Number(result._sum.latencyMs || 0),
        totalCostUsd: Number(result._sum.observabilityCostUsd || 0),
        totalCostSgd: Number(result._sum.estimatedCostSgd || 0),
      };
    });
  }

  return { findById, findRange, list, summarize };
}

module.exports = { createAiObservabilityRepository };
