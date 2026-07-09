function createAiAuditService({
  now = () => new Date().toISOString(),
  sink = null,
  logger = null,
} = {}) {
  const entries = [];

  function sanitizeEntry(entry = {}) {
    return {
      featureType: entry.featureType || "unknown",
      userId: entry.userId || null,
      provider: entry.provider || null,
      model: entry.model || null,
      latencyMs: Number.isFinite(entry.latencyMs) ? entry.latencyMs : null,
      tokenUsage: entry.tokenUsage || null,
      success: Boolean(entry.success),
      statusCode: entry.statusCode || null,
      timestamp: entry.timestamp || now(),
      errorCode: entry.errorCode || null,
    };
  }

  function record(entry) {
    const sanitized = sanitizeEntry(entry);
    entries.push(sanitized);
    if (typeof sink === "function") {
      sink(sanitized);
    }
    if (logger && typeof logger.info === "function") {
      logger.info("ai_audit", sanitized);
    }
    return sanitized;
  }

  return {
    record,
    getEntries() {
      return entries.slice();
    },
  };
}

module.exports = {
  createAiAuditService,
};
