const { sha256, stableStringify } = require("../../ai/services/ai.governance");
const { requireUserId } = require("../../../repositories/ownership");
const { normalizeRetrievalRequest } = require("./memoryRetrievalContract");

function createTimedCache({ ttlMs, maxEntries, now }) {
  const values = new Map();
  function get(key) {
    const entry = values.get(key);
    if (!entry || entry.expiresAt <= now()) { values.delete(key); return null; }
    values.delete(key); values.set(key, entry); return entry.value;
  }
  function set(key, value) {
    values.set(key, { value, expiresAt: now() + ttlMs });
    while (values.size > maxEntries) values.delete(values.keys().next().value);
  }
  return { get, set, size: () => values.size };
}

function retrievalStatus(items) {
  if (!items.length) return "NO_RELEVANT_MEMORY";
  const best = items[0].relevanceScore;
  if (best >= 0.7 && items.length >= 3) return "STRONG_CONTEXT";
  if (best >= 0.45) return "PARTIAL_CONTEXT";
  return "WEAK_CONTEXT";
}

function createMemoryRetrievalService({
  repository,
  vectorRepository,
  embeddingProvider,
  ranker,
  contextService,
  auditService,
  config,
  embeddingIdentity = {},
  now = () => Date.now(),
  logger = console,
} = {}) {
  const resultCache = createTimedCache({ ttlMs: config.cacheTtlMs, maxEntries: config.cacheMaxEntries, now });
  const queryEmbeddingCache = createTimedCache({ ttlMs: config.cacheTtlMs, maxEntries: config.cacheMaxEntries, now });
  const inFlight = new Map();
  const metrics = { requests: 0, cacheHits: 0, cacheMisses: 0, vectorSearches: 0, vectorFailures: 0, queryEmbeddingFailures: 0, fallbacks: 0, noResults: 0, weakContexts: 0, latencyMs: 0, semanticCandidates: 0, structuredCandidates: 0, keywordCandidates: 0, excludedMemorySkips: 0 };

  async function queryVector(userId, request) {
    if (["OFF", "EXACT_ONLY", "ENTITY_TIMELINE"].includes(request.mode)) return { rows: [], used: false, failed: false };
    const cacheKey = sha256(stableStringify({
      userId,
      queryHash: sha256(request.query),
      embeddingIdentity,
      rankingVersion: config.rankingVersion,
    }));
    let vector = queryEmbeddingCache.get(cacheKey);
    if (!vector) {
      try {
        const response = await embeddingProvider.embed([request.query], {
          userId,
          userIds: [userId],
          featureType: "memoryRetrievalEmbedding",
          section: "userPrompt",
          promptVersion: embeddingIdentity.version || null,
        });
        vector = response.vectors[0];
        queryEmbeddingCache.set(cacheKey, vector);
      } catch (error) {
        metrics.queryEmbeddingFailures += 1;
        logger.warn?.("memory_query_embedding_failed", { category: error.code || "PROVIDER" });
        return { rows: [], used: false, failed: true };
      }
    }
    try {
      const rows = await vectorRepository.searchSimilar({
        userId,
        vector,
        filters: request,
        limit: config.candidateLimit,
        minimumSimilarity: request.minimumSimilarity,
      });
      metrics.vectorSearches += 1;
      return { rows, used: true, failed: false };
    } catch (error) {
      metrics.vectorFailures += 1;
      logger.warn?.("memory_vector_search_failed", { category: error.code || "PGVECTOR" });
      return { rows: [], used: false, failed: true };
    }
  }

  async function execute(userId, request) {
    const startedAt = now();
    if (request.mode === "OFF") {
      return { retrievalStatus: "NO_RELEVANT_MEMORY", memories: [], context: { items: [], tokenEstimate: 0, omittedCount: 0, tokenBudget: request.tokenBudget }, diagnostics: { mode: "OFF", candidateCounts: { semantic: 0, exact: 0, keyword: 0, recent: 0 }, vectorSearchUsed: false, fallbackUsed: false } };
    }
    const [exact, keyword, recent, semantic] = await Promise.all([
      repository.exactCandidates(userId, request, config.candidateLimit),
      request.mode === "EXACT_ONLY" ? [] : repository.keywordCandidates(userId, request, config.candidateLimit).catch(() => []),
      ["EXACT_ONLY", "ENTITY_TIMELINE"].includes(request.mode) ? [] : repository.recentImportant(userId, request, config.candidateLimit),
      queryVector(userId, request),
    ]);
    const ids = [...new Set([...semantic.rows.map((row) => row.memoryEventId), ...keyword.map((row) => row.memoryEventId)])];
    const hydrated = await repository.hydrate(userId, ids);
    const memories = new Map([...exact, ...recent, ...hydrated].map((memory) => [memory.id, memory]));
    const signals = new Map([...memories.keys()].map((id) => [id, { semantic: 0, keyword: 0 }]));
    for (const row of semantic.rows) signals.set(row.memoryEventId, { ...(signals.get(row.memoryEventId) || {}), semantic: Number(row.similarity) });
    for (const row of keyword) signals.set(row.memoryEventId, { ...(signals.get(row.memoryEventId) || {}), keyword: Math.min(1, Number(row.rank || 0) * 5) });
    const ranked = ranker.rankAll([...memories.values()], signals, request);
    const context = contextService.assemble(ranked, request.tokenBudget);
    const memoriesOutput = ranked.filter((item) => context.items.some((contextItem) => contextItem.memoryEventId === item.memory.id)).map((item) => ({
      ...context.items.find((contextItem) => contextItem.memoryEventId === item.memory.id),
      scoreComponents: Object.fromEntries(Object.entries(item.components).map(([key, value]) => [key, Number(value.toFixed(4))])),
    }));
    context.items = memoriesOutput;
    const status = retrievalStatus(memoriesOutput);
    const fallbackUsed = semantic.failed || !semantic.used || semantic.rows.length === 0;
    const candidateCounts = { semantic: semantic.rows.length, exact: exact.length, keyword: keyword.length, recent: recent.length, unique: memories.size };
    metrics.semanticCandidates += semantic.rows.length;
    metrics.structuredCandidates += exact.length + recent.length;
    metrics.keywordCandidates += keyword.length;
    if (fallbackUsed) metrics.fallbacks += 1;
    if (status === "NO_RELEVANT_MEMORY") metrics.noResults += 1;
    if (status === "WEAK_CONTEXT") metrics.weakContexts += 1;
    return {
      retrievalStatus: status,
      memories: memoriesOutput,
      context,
      diagnostics: {
        intent: request.intent,
        mode: request.mode,
        candidateCounts,
        vectorSearchUsed: semantic.used,
        fallbackUsed,
        rankingVersion: config.rankingVersion,
        latencyMs: now() - startedAt,
      },
    };
  }

  async function recordAudit(userId, request, result, queryHash, latencyMs) {
    const scores = result.memories.map((item) => item.relevanceScore);
    return auditService.record(userId, {
      requestingFeature: request.requestingFeature,
      queryHash,
      intent: request.intent,
      memoryMode: request.mode,
      filters: { categories: request.categories, eventTypes: request.eventTypes, entityFilters: request.entityFilters, dateRange: { from: request.dateRange.from?.toISOString() || null, to: request.dateRange.to?.toISOString() || null }, minimumImportance: request.minimumImportance, minimumSimilarity: request.minimumSimilarity },
      candidateCounts: result.diagnostics.candidateCounts || {},
      finalMemoryIds: result.memories.map((item) => item.memoryEventId),
      scoreRange: { minimum: scores.length ? Math.min(...scores) : null, maximum: scores.length ? Math.max(...scores) : null },
      retrievalStatus: result.retrievalStatus,
      latencyMs,
      vectorSearchUsed: Boolean(result.diagnostics.vectorSearchUsed),
      fallbackUsed: Boolean(result.diagnostics.fallbackUsed),
      rankingVersion: config.rankingVersion,
      contextTokenEstimate: result.context.tokenEstimate,
    }).catch(() => null);
  }

  async function retrieve(userId, input = {}) {
    const ownerId = requireUserId(userId);
    const request = normalizeRetrievalRequest(input, config);
    const startedAt = now();
    metrics.requests += 1;
    const revision = await repository.revision(ownerId);
    const queryHash = sha256(request.query);
    const cacheRequest = { ...request, dateRange: { from: request.dateRange.from?.toISOString() || null, to: request.dateRange.to?.toISOString() || null } };
    const cacheKey = sha256(stableStringify({
      ownerId,
      queryHash,
      request: cacheRequest,
      revision,
      rankingVersion: config.rankingVersion,
      embeddingIdentity,
    }));
    let result = resultCache.get(cacheKey);
    if (result) {
      metrics.cacheHits += 1;
      result = { ...result, diagnostics: { ...result.diagnostics, cacheHit: true } };
    } else {
      metrics.cacheMisses += 1;
      let promise = inFlight.get(cacheKey);
      if (!promise) {
        promise = execute(ownerId, request).finally(() => inFlight.delete(cacheKey));
        inFlight.set(cacheKey, promise);
      }
      result = await promise;
      resultCache.set(cacheKey, result);
      result = { ...result, diagnostics: { ...result.diagnostics, cacheHit: false } };
    }
    const latencyMs = now() - startedAt;
    metrics.latencyMs += latencyMs;
    const audit = await recordAudit(ownerId, request, result, queryHash, latencyMs);
    return { ...result, auditId: audit?.id || null };
  }

  async function diagnostics() {
    return {
      runtime: { ...metrics, averageLatencyMs: metrics.requests ? Math.round(metrics.latencyMs / metrics.requests) : 0, cacheHitRate: metrics.requests ? metrics.cacheHits / metrics.requests : 0, resultCacheEntries: resultCache.size(), queryEmbeddingCacheEntries: queryEmbeddingCache.size(), inFlight: inFlight.size },
      durable: await auditService.diagnostics(),
      configuration: { ...config, weights: config.weights, embeddingIdentity },
    };
  }

  return { annotatePersonalization: auditService.annotatePersonalization, diagnostics, getAudit: auditService.get, normalizeRequest: (input) => normalizeRetrievalRequest(input, config), retrieve };
}

module.exports = { createMemoryRetrievalService, createTimedCache, retrievalStatus };
