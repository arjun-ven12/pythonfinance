const { generateOptimizationRecommendations } = require("./ai.observability");

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value) {
  return value?.toISOString?.() || value || null;
}

function costUsd(row) {
  return row.observabilityCostUsd ?? row.estimatedCostUsd ?? 0;
}

function sectionTokens(row, key) {
  return number(row?.tokenBreakdown?.sections?.[key]?.tokens);
}

function userLabel(row) {
  if (row.user?.email || row.userId) return row.user?.email || row.userId;
  const userCount = Array.isArray(row.userIds) ? row.userIds.length : 0;
  return userCount ? `Shared/background (${userCount} users)` : "System/background";
}

function percentile(values, ratio) {
  const sorted = values.map(number).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function mapTimelineRow(row) {
  return {
    id: row.id,
    requestId: row.requestId,
    userId: row.userId,
    userIds: row.userIds || [],
    user: row.user || null,
    timestamp: iso(row.createdAt),
    feature: row.featureType,
    endpoint: row.endpoint,
    model: row.model,
    durationMs: row.latencyMs,
    providerLatencyMs: row.providerLatencyMs,
    inputTokens: row.inputTokens ?? row.promptTokens,
    outputTokens: row.outputTokens ?? row.completionTokens,
    cachedTokens: row.cachedTokens || 0,
    totalTokens: row.totalTokens,
    estimatedCostUsd: costUsd(row),
    estimatedCostSgd: row.estimatedCostSgd,
    status: row.status,
    retryCount: row.retryCount || 0,
    cacheStatus: row.cacheStatus,
    promptVersion: row.promptVersion,
    promptHash: row.promptHash,
    largestContributor: row.largestContributor,
    memoryContextTokens: sectionTokens(row, "memoryContext") + sectionTokens(row, "retrievedMemories"),
    strategyContextTokens: sectionTokens(row, "strategyContext"),
    warnings: row.warnings || [],
  };
}

function aggregate(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    const group = groups.get(key) || { key, requests: 0, totalTokens: 0, totalLatencyMs: 0, totalCostUsd: 0, totalCostSgd: 0, tokenValues: [], latencyValues: [], costValues: [], successes: 0, failures: 0 };
    group.requests += 1;
    group.totalTokens += number(row.totalTokens);
    group.totalLatencyMs += number(row.latencyMs);
    group.totalCostUsd += number(costUsd(row));
    group.totalCostSgd += number(row.estimatedCostSgd);
    group.tokenValues.push(number(row.totalTokens));
    group.latencyValues.push(number(row.latencyMs));
    group.costValues.push(number(costUsd(row)));
    if (row.status === "SUCCESS") group.successes += 1;
    else group.failures += 1;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    key: group.key,
    requests: group.requests,
    successes: group.successes,
    failures: group.failures,
    totalTokens: group.totalTokens,
    averageTokens: group.requests ? Math.round(group.totalTokens / group.requests) : 0,
    averageLatencyMs: group.requests ? Math.round(group.totalLatencyMs / group.requests) : 0,
    averageCostUsd: group.requests ? group.totalCostUsd / group.requests : 0,
    totalCostUsd: group.totalCostUsd,
    totalCostSgd: group.totalCostSgd,
    p95Tokens: percentile(group.tokenValues, 0.95),
    p95LatencyMs: percentile(group.latencyValues, 0.95),
    p95CostUsd: percentile(group.costValues, 0.95),
  })).sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcWeek(date = new Date()) {
  const start = startOfUtcDay(date);
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1));
  return start;
}

function startOfUtcMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function sumRows(rows) {
  return rows.reduce((result, row) => ({
    requests: result.requests + 1,
    totalTokens: result.totalTokens + number(row.totalTokens),
    totalLatencyMs: result.totalLatencyMs + number(row.latencyMs),
    totalCostUsd: result.totalCostUsd + number(costUsd(row)),
    totalCostSgd: result.totalCostSgd + number(row.estimatedCostSgd),
  }), { requests: 0, totalTokens: 0, totalLatencyMs: 0, totalCostUsd: 0, totalCostSgd: 0 });
}

function createAiObservabilityService({ repository, now = () => new Date() }) {
  if (!repository) throw new Error("AI observability repository is required.");

  async function listRequests(query = {}) {
    const contextSorts = new Set(["memoryContext", "strategyContext"]);
    if (!contextSorts.has(query.sort)) {
      const orderMap = { tokens: "totalTokens", cost: "observabilityCostUsd", latency: "latencyMs", input: "inputTokens", output: "outputTokens" };
      const result = await repository.list({ ...query, orderBy: orderMap[query.sort] || "createdAt", order: query.order || "desc" });
      return { ...result, requests: result.rows.map(mapTimelineRow), rows: undefined };
    }
    const result = await repository.list({ ...query, take: Math.min(500, Number(query.take || 100)), orderBy: "createdAt" });
    const key = query.sort === "memoryContext" ? "memoryContextTokens" : "strategyContextTokens";
    const requests = result.rows.map(mapTimelineRow).sort((a, b) => b[key] - a[key]);
    return { total: result.total, take: result.take, skip: result.skip, requests };
  }

  async function requestDetail(id) {
    const row = await repository.findById(id);
    if (!row) return null;
    return {
      ...mapTimelineRow(row),
      provider: row.provider,
      providerResponseId: row.providerResponseId,
      promptTemplateId: row.promptTemplateId,
      schemaName: row.schemaName,
      schemaHash: row.schemaHash,
      inputHash: row.inputHash,
      inputTokenCostUsd: row.inputTokenCostUsd,
      outputTokenCostUsd: row.outputTokenCostUsd,
      cachedTokenCostUsd: row.cachedTokenCostUsd,
      usdToSgdRate: row.usdToSgdRate,
      pricingVersion: row.pricingVersion,
      pricingConfigured: row.pricingConfigured,
      tokenBreakdown: row.tokenBreakdown,
      contextBreakdown: row.contextBreakdown,
      contextDiff: row.contextDiff,
      responseAnalysis: row.responseAnalysis,
      recommendations: generateOptimizationRecommendations(row),
    };
  }

  async function rowsForWindow(since, until = null) {
    return repository.findRange({ since, until, limit: 50_000 });
  }

  async function usageByPeriod({ since, period = "day" }) {
    const rows = await rowsForWindow(since);
    const keyFn = period === "month"
      ? (row) => String(iso(row.createdAt)).slice(0, 7)
      : (row) => String(iso(row.createdAt)).slice(0, 10);
    return aggregate(rows, keyFn).map((entry) => ({ period: entry.key, ...entry, key: undefined })).sort((a, b) => a.period.localeCompare(b.period));
  }

  async function featureUsage({ since }) {
    return aggregate(await rowsForWindow(since), (row) => row.featureType).map((entry) => ({ feature: entry.key, ...entry, key: undefined }));
  }

  async function userUsage({ since }) {
    return aggregate(await rowsForWindow(since), userLabel).map((entry) => ({ user: entry.key, ...entry, key: undefined }));
  }

  async function costSummary() {
    const current = now();
    const monthStart = startOfUtcMonth(current);
    const [monthRows, allTime] = await Promise.all([
      rowsForWindow(monthStart),
      repository.summarize ? repository.summarize() : rowsForWindow(new Date(0)).then(sumRows),
    ]);
    const todayStart = startOfUtcDay(current);
    const weekStart = startOfUtcWeek(current);
    const today = sumRows(monthRows.filter((row) => new Date(row.createdAt) >= todayStart));
    const week = sumRows(monthRows.filter((row) => new Date(row.createdAt) >= weekStart));
    const month = sumRows(monthRows);
    const features = aggregate(monthRows, (row) => row.featureType);
    const users = aggregate(monthRows, userLabel);
    const largestContext = [...monthRows].sort((a, b) => number(b.inputTokens) - number(a.inputTokens))[0] || null;
    const largestMemory = [...monthRows].sort((a, b) => (sectionTokens(b, "memoryContext") + sectionTokens(b, "retrievedMemories")) - (sectionTokens(a, "memoryContext") + sectionTokens(a, "retrievedMemories")))[0] || null;
    return {
      allTime,
      today,
      week,
      month,
      averageCostPerRequestUsd: allTime.requests ? allTime.totalCostUsd / allTime.requests : 0,
      averageTokensPerRequest: allTime.requests ? Math.round(allTime.totalTokens / allTime.requests) : 0,
      averageLatencyMs: allTime.requests ? Math.round(allTime.totalLatencyMs / allTime.requests) : 0,
      mostExpensiveFeature: features[0] || null,
      mostExpensiveUser: users[0] || null,
      largestContext: largestContext ? mapTimelineRow(largestContext) : null,
      largestPrompt: largestContext ? mapTimelineRow(largestContext) : null,
      largestMemoryRetrieval: largestMemory ? mapTimelineRow(largestMemory) : null,
      pricingCoveragePct: monthRows.length ? Number(((monthRows.filter((row) => row.pricingConfigured).length / monthRows.length) * 100).toFixed(2)) : 0,
    };
  }

  async function largestRequests({ since, limit = 20 }) {
    const rows = await rowsForWindow(since);
    const by = (selector) => [...rows].sort((a, b) => selector(b) - selector(a)).slice(0, limit).map(mapTimelineRow);
    return {
      tokens: by((row) => number(row.totalTokens)),
      cost: by((row) => number(costUsd(row))),
      latency: by((row) => number(row.latencyMs)),
      memory: by((row) => sectionTokens(row, "memoryContext") + sectionTokens(row, "retrievedMemories")),
      strategy: by((row) => sectionTokens(row, "strategyContext")),
    };
  }

  async function optimizationReport({ since }) {
    const rows = await rowsForWindow(since);
    const items = [];
    let tokenSavings = 0;
    let costSavingsUsd = 0;
    let costSavingsSgd = 0;
    let latencySavingsMs = 0;
    for (const row of rows) {
      const recommendations = generateOptimizationRecommendations(row);
      if (!recommendations.length) continue;
      const requestSavings = recommendations.reduce((sum, item) => sum + number(item.estimatedTokenReduction), 0);
      const cappedSavings = Math.min(number(row.inputTokens), requestSavings);
      const inputUnitCost = number(row.inputTokenCostUsd) / Math.max(1, number(row.inputTokens) - number(row.cachedTokens));
      const usd = cappedSavings * inputUnitCost;
      const sgd = row.usdToSgdRate ? usd * number(row.usdToSgdRate) : 0;
      const latency = number(row.providerLatencyMs) * (cappedSavings / Math.max(1, number(row.inputTokens))) * 0.35;
      tokenSavings += cappedSavings;
      costSavingsUsd += usd;
      costSavingsSgd += sgd;
      latencySavingsMs += latency;
      items.push({ request: mapTimelineRow(row), recommendations, estimatedTokenReduction: cappedSavings, estimatedCostReductionUsd: usd, estimatedCostReductionSgd: sgd, estimatedLatencyReductionMs: Math.round(latency) });
    }
    return {
      generatedAt: iso(now()),
      windowStart: iso(since),
      requestsAnalyzed: rows.length,
      estimatedTokenReduction: Math.round(tokenSavings),
      estimatedCostReductionUsd: Number(costSavingsUsd.toFixed(6)),
      estimatedCostReductionSgd: Number(costSavingsSgd.toFixed(6)),
      estimatedLatencyReductionMs: Math.round(latencySavingsMs),
      estimationNotice: "Recommendations are observability estimates only; no prompt or context changes are applied.",
      items: items.sort((a, b) => b.estimatedTokenReduction - a.estimatedTokenReduction).slice(0, 100),
    };
  }

  async function dashboard({ since }) {
    const effectiveSince = since || new Date(now().getTime() - 30 * 24 * 60 * 60 * 1000);
    const windowRowsPromise = rowsForWindow(effectiveSince);
    const [summary, daily, features, users, largest, optimization, recent, windowRows] = await Promise.all([
      costSummary(),
      usageByPeriod({ since: effectiveSince, period: "day" }),
      featureUsage({ since: effectiveSince }),
      userUsage({ since: effectiveSince }),
      largestRequests({ since: effectiveSince, limit: 10 }),
      optimizationReport({ since: effectiveSince }),
      listRequests({ since: effectiveSince, take: 100 }),
      windowRowsPromise,
    ]);
    const contextTotals = {};
    for (const row of windowRows) {
      for (const [key, value] of Object.entries(row?.tokenBreakdown?.sections || {})) contextTotals[key] = number(contextTotals[key]) + number(value?.tokens);
    }
    const models = aggregate(windowRows, (row) => row.model).map((entry) => ({ model: entry.key, ...entry, key: undefined }));
    return { summary, daily, features, users, models, contextContributors: Object.entries(contextTotals).map(([section, tokens]) => ({ section, tokens })).sort((a, b) => b.tokens - a.tokens), largest, optimization, recent: recent.requests };
  }

  return { costSummary, dashboard, featureUsage, largestRequests, listRequests, optimizationReport, requestDetail, usageByPeriod, userUsage };
}

module.exports = { createAiObservabilityService, mapTimelineRow, percentile };
