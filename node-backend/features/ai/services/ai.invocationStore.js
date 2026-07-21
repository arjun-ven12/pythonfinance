const defaultPrisma = require("../../../services/prisma");

function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSince(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return startOfUtcDay();
}

function createNoopAiInvocationStore() {
  const records = [];
  return {
    async create(record) {
      const stored = {
        ...record,
        createdAt: record.createdAt || new Date(),
      };
      records.push(stored);
      return stored;
    },
    async getDailyUsage(userId, since = startOfUtcDay()) {
      const rows = records.filter((record) => record.userId === userId && record.createdAt >= since);
      return {
        totalTokens: rows.reduce((sum, record) => sum + safeNumber(record.totalTokens), 0),
        estimatedCostUsd: rows.reduce((sum, record) => sum + safeNumber(record.estimatedCostUsd), 0),
      };
    },
    async getDailyFeatureUsage(userId, featureType, since = startOfUtcDay()) {
      const rows = records.filter(
        (record) =>
          record.userId === userId &&
          record.featureType === featureType &&
          record.createdAt >= since
      );
      return {
        totalTokens: rows.reduce((sum, record) => sum + safeNumber(record.totalTokens), 0),
        estimatedCostUsd: rows.reduce((sum, record) => sum + safeNumber(record.estimatedCostUsd), 0),
      };
    },
    async getPreviousInvocation(userId, featureType) {
      return [...records]
        .reverse()
        .find((record) => record.userId === userId && record.featureType === featureType) || null;
    },
    async diagnostics() {
      return {
        totals: {
          requests: records.length,
          successes: records.filter((record) => record.status === "SUCCESS").length,
          failures: records.filter((record) => record.status === "FAILED").length,
          tokenUsage: records.reduce((sum, record) => sum + safeNumber(record.totalTokens), 0),
          estimatedCostUsd: records.reduce((sum, record) => sum + safeNumber(record.estimatedCostUsd), 0),
        },
        byFeature: buildNoopSummary(records, "featureType"),
        byUser: buildNoopSummary(records, "userId"),
        rejectionReasons: buildNoopCounts(records.filter((record) => record.status !== "SUCCESS"), "errorCategory"),
        cacheByFeature: buildNoopCacheSummary(records),
      };
    },
    _records: records,
  };
}

function buildNoopSummary(records, field) {
  const summary = {};
  for (const record of records) {
    const key = record[field] || "unknown";
    summary[key] = summary[key] || {
      requests: 0,
      successes: 0,
      failures: 0,
      tokenUsage: 0,
      estimatedCostUsd: 0,
      averageLatencyMs: 0,
      latencyTotal: 0,
    };
    const entry = summary[key];
    entry.requests += 1;
    if (record.status === "SUCCESS") entry.successes += 1;
    else entry.failures += 1;
    entry.tokenUsage += safeNumber(record.totalTokens);
    entry.estimatedCostUsd += safeNumber(record.estimatedCostUsd);
    entry.latencyTotal += safeNumber(record.latencyMs);
    entry.averageLatencyMs =
      entry.requests > 0 ? Math.round(entry.latencyTotal / entry.requests) : 0;
  }
  for (const entry of Object.values(summary)) {
    delete entry.latencyTotal;
  }
  return summary;
}

function buildNoopCounts(records, field) {
  return records.reduce((counts, record) => {
    const key = record[field] || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function buildNoopCacheSummary(records) {
  const summary = {};
  for (const record of records) {
    const featureType = record.featureType || "unknown";
    summary[featureType] = summary[featureType] || { hits: 0, misses: 0, hitRate: 0 };
    if (record.cacheStatus === "HIT") summary[featureType].hits += 1;
    if (record.cacheStatus === "MISS") summary[featureType].misses += 1;
    const stats = summary[featureType];
    stats.hitRate =
      stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0;
  }
  return summary;
}

function createAiInvocationStore({ prisma = defaultPrisma, logger = console } = {}) {
  async function create(record) {
    try {
      return await prisma.run((db) =>
        db.aiInvocation.create({
          data: {
            requestId: record.requestId || null,
            userId: record.userId || null,
            userIds: record.userIds || undefined,
            featureType: record.featureType,
            provider: record.provider || null,
            model: record.model || null,
            promptTemplateId: record.promptTemplateId || null,
            promptVersion: record.promptVersion || null,
            promptHash: record.promptHash || null,
            schemaName: record.schemaName || null,
            schemaHash: record.schemaHash || null,
            inputHash: record.inputHash,
            providerResponseId: record.providerResponseId || null,
            endpoint: record.endpoint || null,
            promptTokens: record.promptTokens ?? null,
            completionTokens: record.completionTokens ?? null,
            inputTokens: record.inputTokens ?? record.promptTokens ?? null,
            outputTokens: record.outputTokens ?? record.completionTokens ?? null,
            cachedTokens: record.cachedTokens ?? 0,
            totalTokens: record.totalTokens ?? null,
            estimatedCostUsd: record.estimatedCostUsd ?? null,
            inputTokenCostUsd: record.inputTokenCostUsd ?? null,
            outputTokenCostUsd: record.outputTokenCostUsd ?? null,
            cachedTokenCostUsd: record.cachedTokenCostUsd ?? null,
            observabilityCostUsd: record.observabilityCostUsd ?? null,
            estimatedCostSgd: record.estimatedCostSgd ?? null,
            usdToSgdRate: record.usdToSgdRate ?? null,
            pricingVersion: record.pricingVersion || null,
            pricingConfigured: Boolean(record.pricingConfigured),
            latencyMs: record.latencyMs ?? null,
            providerLatencyMs: record.providerLatencyMs ?? null,
            retryCount: record.retryCount ?? 0,
            status: record.status,
            errorCategory: record.errorCategory || null,
            cacheStatus: record.cacheStatus || null,
            tokenBreakdown: record.tokenBreakdown || undefined,
            contextBreakdown: record.contextBreakdown || undefined,
            contextDiff: record.contextDiff || undefined,
            largestContributor: record.largestContributor || null,
            warnings: record.warnings || undefined,
            responseAnalysis: record.responseAnalysis || undefined,
          },
        })
      );
    } catch (error) {
      logger.warn?.(`AI invocation persistence skipped: ${error.message}`);
      return null;
    }
  }

  async function getDailyUsage(userId, since = startOfUtcDay()) {
    try {
      const aggregate = await prisma.run((db) =>
        db.aiInvocation.aggregate({
          where: {
            userId,
            createdAt: { gte: since },
          },
          _sum: {
            totalTokens: true,
            estimatedCostUsd: true,
          },
        })
      );
      return {
        totalTokens: safeNumber(aggregate._sum.totalTokens),
        estimatedCostUsd: safeNumber(aggregate._sum.estimatedCostUsd),
      };
    } catch (error) {
      logger.warn?.(`AI usage lookup skipped: ${error.message}`);
      return { totalTokens: 0, estimatedCostUsd: 0 };
    }
  }

  async function getDailyFeatureUsage(userId, featureType, since = startOfUtcDay()) {
    try {
      const aggregate = await prisma.run((db) =>
        db.aiInvocation.aggregate({
          where: {
            userId,
            featureType,
            createdAt: { gte: since },
          },
          _sum: {
            totalTokens: true,
            estimatedCostUsd: true,
          },
        })
      );
      return {
        totalTokens: safeNumber(aggregate._sum.totalTokens),
        estimatedCostUsd: safeNumber(aggregate._sum.estimatedCostUsd),
      };
    } catch (error) {
      logger.warn?.(`AI feature usage lookup skipped: ${error.message}`);
      return { totalTokens: 0, estimatedCostUsd: 0 };
    }
  }

  async function getPreviousInvocation(userId, featureType) {
    try {
      return await prisma.run((db) =>
        db.aiInvocation.findFirst({
          where: { userId, featureType },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            requestId: true,
            tokenBreakdown: true,
            contextBreakdown: true,
            createdAt: true,
          },
        })
      );
    } catch (error) {
      logger.warn?.(`AI previous invocation lookup skipped: ${error.message}`);
      return null;
    }
  }

  async function diagnostics({ since = startOfUtcDay() } = {}) {
    const sinceDate = normalizeSince(since);
    try {
      const [featureRows, userRows, rejectionRows, cacheRows, failures, totals] = await prisma.run((db) =>
        Promise.all([
          db.aiInvocation.groupBy({
            by: ["featureType", "status"],
            where: { createdAt: { gte: sinceDate } },
            _count: { _all: true },
            _sum: { totalTokens: true, estimatedCostUsd: true, latencyMs: true },
          }),
          db.aiInvocation.groupBy({
            by: ["userId", "status"],
            where: { createdAt: { gte: sinceDate } },
            _count: { _all: true },
            _sum: { totalTokens: true, estimatedCostUsd: true, latencyMs: true },
          }),
          db.aiInvocation.groupBy({
            by: ["errorCategory"],
            where: {
              createdAt: { gte: sinceDate },
              status: { not: "SUCCESS" },
            },
            _count: { _all: true },
          }),
          db.aiInvocation.groupBy({
            by: ["featureType", "cacheStatus"],
            where: { createdAt: { gte: sinceDate } },
            _count: { _all: true },
          }),
          db.aiInvocation.findMany({
            where: {
              createdAt: { gte: sinceDate },
              status: { not: "SUCCESS" },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              featureType: true,
              provider: true,
              model: true,
              errorCategory: true,
              latencyMs: true,
              createdAt: true,
            },
          }),
          db.aiInvocation.aggregate({
            where: { createdAt: { gte: sinceDate } },
            _count: { _all: true },
            _sum: { totalTokens: true, estimatedCostUsd: true, latencyMs: true },
          }),
        ])
      );

      const summarizeRows = (rows, keyField) => {
        const summary = {};
        for (const row of rows) {
          const key = row[keyField] || "unknown";
          summary[key] = summary[key] || {
            requests: 0,
            successes: 0,
            failures: 0,
            tokenUsage: 0,
            estimatedCostUsd: 0,
            averageLatencyMs: 0,
            latencyTotal: 0,
          };
          const entry = summary[key];
          const count = row._count._all || 0;
          entry.requests += count;
          if (row.status === "SUCCESS") entry.successes += count;
          if (row.status !== "SUCCESS") entry.failures += count;
          entry.tokenUsage += safeNumber(row._sum.totalTokens);
          entry.estimatedCostUsd += safeNumber(row._sum.estimatedCostUsd);
          entry.latencyTotal += safeNumber(row._sum.latencyMs);
          entry.averageLatencyMs =
            entry.requests > 0 ? Math.round(entry.latencyTotal / entry.requests) : 0;
        }
        for (const entry of Object.values(summary)) {
          delete entry.latencyTotal;
        }
        return summary;
      };

      const cacheByFeature = {};
      for (const row of cacheRows) {
        const key = row.featureType || "unknown";
        cacheByFeature[key] = cacheByFeature[key] || {
          hits: 0,
          misses: 0,
          hitRate: 0,
        };
        if (row.cacheStatus === "HIT") cacheByFeature[key].hits += row._count._all || 0;
        if (row.cacheStatus === "MISS") cacheByFeature[key].misses += row._count._all || 0;
        const stats = cacheByFeature[key];
        stats.hitRate =
          stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0;
      }

      const rejectionReasons = {};
      for (const row of rejectionRows) {
        rejectionReasons[row.errorCategory || "unknown"] = row._count._all || 0;
      }

      const byFeature = summarizeRows(featureRows, "featureType");
      const byUser = summarizeRows(userRows, "userId");

      return {
        totals: {
          requests: totals._count._all || 0,
          tokenUsage: safeNumber(totals._sum.totalTokens),
          estimatedCostUsd: safeNumber(totals._sum.estimatedCostUsd),
          averageLatencyMs:
            totals._count._all > 0
              ? Math.round(safeNumber(totals._sum.latencyMs) / totals._count._all)
              : 0,
        },
        byFeature,
        byUser,
        rejectionReasons,
        cacheByFeature,
        recentFailures: failures.map((failure) => ({
          ...failure,
          createdAt: failure.createdAt?.toISOString?.() || failure.createdAt,
        })),
      };
    } catch (error) {
      logger.warn?.(`AI diagnostics lookup skipped: ${error.message}`);
      return { totals: {}, byFeature: {}, byUser: {}, rejectionReasons: {}, cacheByFeature: {}, recentFailures: [] };
    }
  }

  return {
    create,
    getDailyUsage,
    getDailyFeatureUsage,
    getPreviousInvocation,
    diagnostics,
  };
}

module.exports = {
  createAiInvocationStore,
  createNoopAiInvocationStore,
  startOfUtcDay,
};
