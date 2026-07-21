const FEEDBACK_VALUES = Object.freeze({
  USEFUL: 0.35,
  CONFIRMED_BY_OUTCOME: 1,
  NOT_USEFUL: -0.45,
  INCORRECT: -1,
  CORRECTED: 0.1,
  DISPROVED_BY_OUTCOME: -0.8,
  EXCLUDE_FROM_AI: -1,
});

function clamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, Number(value) || 0)); }

function classifyOutcome(memory) {
  const data = memory.structuredData || {};
  const explicit = String(data.outcome || data.proposalStatus || data.approvalStatus || "").toUpperCase();
  if (/PROFIT|POSITIVE|APPROVED|ACCEPTED|PASSED|CONFIRMED|SUCCESS/.test(explicit)) return "POSITIVE_OUTCOME";
  if (/LOSS|NEGATIVE|REJECTED|FAILED|DISPROVED|CANCELLED/.test(explicit)) return "NEGATIVE_OUTCOME";
  if (/MIXED|PARTIAL/.test(explicit)) return "MIXED_OUTCOME";
  const returnPct = Number(data.returnPct ?? data.return ?? data.pnlPct);
  if (Number.isFinite(returnPct)) return returnPct > 0 ? "POSITIVE_OUTCOME" : returnPct < 0 ? "NEGATIVE_OUTCOME" : "MIXED_OUTCOME";
  if (/REJECTED|FAILED|CANCELLED/.test(memory.eventType)) return "NEGATIVE_OUTCOME";
  if (/APPROVED|COMPLETED|DEPLOYED|FILLED|CLOSED/.test(memory.eventType)) return "POSITIVE_OUTCOME";
  return "UNKNOWN_OUTCOME";
}

function feedbackSignal(feedback = []) {
  if (feedback.some((item) => item.feedbackType === "EXCLUDE_FROM_AI")) return { score: -1, excluded: true, labels: ["excluded by user feedback"] };
  const latest = new Map();
  for (const item of feedback) if (!latest.has(item.feedbackType)) latest.set(item.feedbackType, item);
  const values = [...latest.keys()].map((type) => FEEDBACK_VALUES[type] || 0);
  const score = values.length ? clamp(values.reduce((sum, value) => sum + value, 0) / values.length, -1, 1) : 0;
  return {
    score,
    excluded: latest.has("INCORRECT") && !latest.has("CORRECTED"),
    labels: [...latest.keys()].map((type) => `feedback ${type.toLowerCase().replaceAll("_", " ")}`),
  };
}

function entityScore(memory, entityFilters = []) {
  if (!entityFilters.length) return 0;
  const links = new Set((memory.links || []).map((item) => `${item.entityType}:${String(item.entityId).toUpperCase()}`));
  const matched = entityFilters.filter((item) => links.has(`${item.entityType}:${String(item.entityId).toUpperCase()}`));
  return { score: matched.length / entityFilters.length, matched };
}
function personalizationScore(memory, signals = []) {
  if (!signals.length) return 0;
  const text = `${memory.title} ${memory.summary} ${JSON.stringify(memory.structuredData || {})}`.toLowerCase();
  return signals.filter((signal) => text.includes(String(signal).toLowerCase().replaceAll("_", " "))).length / signals.length;
}

function intentWeights(base, intent) {
  const multipliers = {
    PORTFOLIO_HISTORY: { recency: 1.8, entity: 1.2 },
    ENTITY_TIMELINE: { entity: 1.6, recency: 1.25 },
    PAST_OUTCOME: { outcome: 2.2, importance: 1.3 },
    SIMILAR_EVENT: { semantic: 1.5, outcome: 1.4 },
    USER_PREFERENCE: { feedback: 1.8, recency: 0.7 },
  }[intent] || {};
  const adjusted = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, value * (multipliers[key] || 1)]));
  const total = Object.values(adjusted).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(adjusted).map(([key, value]) => [key, value / total]));
}

function createMemoryHybridRanker({ config, now = () => Date.now() } = {}) {
  function rank(memory, signals, request) {
    const entity = entityScore(memory, request.entityFilters);
    const feedback = feedbackSignal(memory.feedback);
    if (feedback.excluded) return null;
    const outcomeStatus = classifyOutcome(memory);
    const ageDays = Math.max(0, (now() - new Date(memory.occurredAt).getTime()) / 86_400_000);
    const components = {
      semantic: clamp(signals.semantic),
      entity: clamp(entity.score),
      keyword: clamp(signals.keyword),
      importance: clamp(memory.importance / 100),
      recency: clamp(2 ** (-ageDays / config.recencyHalfLifeDays)),
      feedback: feedback.score,
      outcome: outcomeStatus === "UNKNOWN_OUTCOME" ? 0 : 1,
      provenance: clamp(memory.confidence != null ? memory.confidence / 100 : memory.createdByType === "SYSTEM" ? 0.8 : 0.65),
      personalization: clamp(personalizationScore(memory, request.personalizationSignals)),
    };
    const weights = intentWeights(config.weights, request.intent);
    const finalScore = clamp(Object.entries(weights).reduce((sum, [key, weight]) => sum + weight * components[key], 0));
    const whyRetrieved = [];
    if (components.entity > 0) whyRetrieved.push(...entity.matched.map((item) => `exact ${item.entityType.toLowerCase()} match: ${item.entityId}`));
    if (components.semantic >= request.minimumSimilarity) whyRetrieved.push(`semantic similarity ${components.semantic.toFixed(3)}`);
    if (components.keyword > 0) whyRetrieved.push("title or summary keyword match");
    if (memory.importance >= 80) whyRetrieved.push("high-importance historical event");
    if (components.outcome > 0) whyRetrieved.push(`recorded ${outcomeStatus.toLowerCase().replaceAll("_", " ")}`);
    whyRetrieved.push(...feedback.labels);
    if (components.personalization > 0) whyRetrieved.push("matched a confirmed personalization signal");
    if (!whyRetrieved.length) whyRetrieved.push("recent relevant memory fallback");
    return { memory, components, weights, finalScore, outcomeStatus, whyRetrieved };
  }

  function deduplicate(ranked) {
    const seen = new Set();
    return ranked.filter((item) => {
      const memory = item.memory;
      const keys = [
        `content:${memory.contentHash}`,
        `source:${memory.sourceType}:${memory.sourceId}:${memory.sourceVersion || ""}`,
      ];
      if (keys.some((key) => seen.has(key))) return false;
      keys.forEach((key) => seen.add(key));
      return true;
    });
  }

  function diversify(ranked, request) {
    if (request.mode === "EXACT_ONLY" || (request.entityFilters || []).length || (request.categories || []).length === 1) return ranked;
    const quota = Math.max(2, Math.ceil(request.maximumResults / 2));
    const counts = new Map();
    const accepted = [];
    const deferred = [];
    for (const item of ranked) {
      const count = counts.get(item.memory.category) || 0;
      if (count < quota) { accepted.push(item); counts.set(item.memory.category, count + 1); } else deferred.push(item);
    }
    return [...accepted, ...deferred];
  }

  function rankAll(candidates, signalsById, request) {
    const ranked = candidates
      .map((memory) => rank(memory, signalsById.get(memory.id) || {}, request))
      .filter(Boolean)
      .filter((item) => request.mode !== "PAST_OUTCOMES" || item.outcomeStatus !== "UNKNOWN_OUTCOME")
      .filter((item) => item.finalScore >= config.minRelevance)
      .sort((a, b) => b.finalScore - a.finalScore || b.memory.importance - a.memory.importance);
    return diversify(deduplicate(ranked), request).slice(0, request.maximumResults);
  }

  return { classifyOutcome, rankAll };
}

module.exports = { FEEDBACK_VALUES, classifyOutcome, createMemoryHybridRanker, feedbackSignal, intentWeights };
