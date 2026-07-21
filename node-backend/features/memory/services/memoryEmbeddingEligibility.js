const { EVENT_CATEGORIES } = require("./memoryPolicy");

const APPROVED_EVENT_TYPES = Object.freeze(new Set(Object.keys(EVENT_CATEGORIES)));

function evaluateEmbeddingEligibility(memory, config) {
  if (!config.enabled) return { eligible: false, reason: "EMBEDDING_DISABLED" };
  if (!memory) return { eligible: false, reason: "MEMORY_NOT_FOUND" };
  if (memory.retentionState !== "ACTIVE") return { eligible: false, reason: "RETENTION_NOT_ACTIVE" };
  if (memory.excludedFromAi) return { eligible: false, reason: "EXCLUDED_FROM_AI" };
  if (Number(memory.importance) < config.minImportance) return { eligible: false, reason: "LOW_IMPORTANCE" };
  if (!String(memory.summary || "").trim()) return { eligible: false, reason: "EMPTY_SUMMARY" };
  if (!APPROVED_EVENT_TYPES.has(memory.eventType)) return { eligible: false, reason: "UNAPPROVED_EVENT_TYPE" };
  return { eligible: true, reason: null };
}

module.exports = { APPROVED_EVENT_TYPES, evaluateEmbeddingEligibility };
