const DEFAULT_WEIGHTS = Object.freeze({
  semantic: 0.29,
  entity: 0.2,
  keyword: 0.12,
  importance: 0.1,
  recency: 0.08,
  feedback: 0.08,
  outcome: 0.06,
  provenance: 0.04,
  personalization: 0.03,
});

function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function integer(value, fallback, min, max) {
  return Math.round(number(value, fallback, min, max));
}

function parseWeights(value) {
  if (!value) return DEFAULT_WEIGHTS;
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error("MEMORY_RETRIEVAL_WEIGHTS_JSON must be valid JSON."); }
  const weights = Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([key, fallback]) => [
    key,
    number(parsed?.[key], fallback, 0, 1),
  ]));
  const total = Object.values(weights).reduce((sum, item) => sum + item, 0);
  if (total <= 0) throw new Error("Memory retrieval weights must contain a positive value.");
  return Object.freeze(Object.fromEntries(Object.entries(weights).map(([key, item]) => [key, item / total])));
}

function buildMemoryRetrievalConfig(env = process.env) {
  return Object.freeze({
    maxResults: integer(env.MEMORY_RETRIEVAL_MAX_RESULTS, 12, 1, 25),
    candidateLimit: integer(env.MEMORY_RETRIEVAL_CANDIDATE_LIMIT, 50, 10, 200),
    maxContextTokens: integer(env.MEMORY_RETRIEVAL_MAX_CONTEXT_TOKENS, 2500, 200, 8000),
    minSimilarity: number(env.MEMORY_RETRIEVAL_MIN_SIMILARITY, 0.3, 0, 1),
    minRelevance: number(env.MEMORY_RETRIEVAL_MIN_RELEVANCE, 0.24, 0, 1),
    recencyHalfLifeDays: number(env.MEMORY_RETRIEVAL_RECENCY_HALF_LIFE_DAYS, 90, 1, 3650),
    cacheTtlMs: integer(env.MEMORY_RETRIEVAL_CACHE_TTL_MS, 30_000, 1000, 300_000),
    cacheMaxEntries: integer(env.MEMORY_RETRIEVAL_CACHE_MAX_ENTRIES, 250, 10, 2000),
    rankingVersion: String(env.MEMORY_RETRIEVAL_RANKING_VERSION || "1").trim(),
    weights: parseWeights(env.MEMORY_RETRIEVAL_WEIGHTS_JSON),
  });
}

module.exports = { DEFAULT_WEIGHTS, buildMemoryRetrievalConfig };
