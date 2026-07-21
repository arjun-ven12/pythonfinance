function integer(value, fallback, min, max) { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function buildMemoryPersonalizationConfig(env = process.env) {
  return Object.freeze({
    minimumPreferenceEvidence: integer(env.MEMORY_PERSONALIZATION_MIN_PREFERENCE_EVIDENCE, 3, 2, 20),
    minimumPatternEvidence: integer(env.MEMORY_PERSONALIZATION_MIN_PATTERN_EVIDENCE, 5, 3, 50),
    minimumActiveConfidence: integer(env.MEMORY_PERSONALIZATION_MIN_ACTIVE_CONFIDENCE, 70, 50, 95),
    staleAfterDays: integer(env.MEMORY_PERSONALIZATION_STALE_AFTER_DAYS, 180, 30, 1095),
    maxContextTokens: integer(env.MEMORY_PERSONALIZATION_MAX_CONTEXT_TOKENS, 600, 100, 1500),
    extractionVersion: String(env.MEMORY_PERSONALIZATION_EXTRACTION_VERSION || "1"),
  });
}
module.exports = { buildMemoryPersonalizationConfig };
