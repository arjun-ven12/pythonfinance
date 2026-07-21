const RESEARCH_EVIDENCE_SOURCE_TYPES = Object.freeze([
  "MARKET_DATA", "NEWS", "EARNINGS", "ECONOMIC_EVENT", "SCANNER_RESULT", "WATCHLIST",
  "PORTFOLIO_POSITION", "ACTIVE_STRATEGY", "MATRIX_ALLOCATION", "MARKET_REGIME", "RISK_METRIC",
  "STRATEGY_RUN", "BACKTEST", "MONTE_CARLO", "WALK_FORWARD", "MATRIX_REPLAY",
  "PORTFOLIO_SIMULATION", "DEPLOYMENT", "LIFECYCLE",
]);

function valueString(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function createResearchEvidenceItem(input = {}) {
  const metricValue = valueString(input.metricValue);
  if (!RESEARCH_EVIDENCE_SOURCE_TYPES.includes(input.sourceType) || !input.metricName || metricValue === null) return null;
  return {
    sourceType: input.sourceType,
    sourceId: String(input.sourceId || ""),
    sourceName: String(input.sourceName || "Quant's Trade"),
    sourceQuality: ["HIGH", "MEDIUM", "LOW"].includes(input.sourceQuality) ? input.sourceQuality : "MEDIUM",
    symbol: String(input.symbol || ""), sector: String(input.sector || ""), theme: String(input.theme || ""),
    metricName: String(input.metricName), metricValue,
    timestamp: input.timestamp ? String(input.timestamp) : "", dateRange: input.dateRange ? String(input.dateRange) : "",
    interpretation: String(input.interpretation || "Platform research evidence."),
    strength: ["HIGH", "MEDIUM", "LOW"].includes(input.strength) ? input.strength : "MEDIUM",
    relevanceScore: Math.max(0, Math.min(100, Number(input.relevanceScore) || 0)),
  };
}

function normalizeResearchEvidenceReferences(responseEvidence = [], availableEvidence = []) {
  if (!Array.isArray(responseEvidence) || !responseEvidence.length) return [];
  const catalog = new Map(availableEvidence.map((item) => [`${item.sourceType}::${item.sourceId}::${item.metricName}`, item]));
  return responseEvidence.map((item) => {
    const key = `${item?.sourceType || ""}::${item?.sourceId || ""}::${item?.metricName || ""}`;
    const match = catalog.get(key);
    if (!match || String(match.metricValue) !== String(item.metricValue)) {
      const error = new Error(`AI cited unavailable or mismatched research evidence: ${key}.`);
      error.statusCode = 502; error.code = "AI_EVIDENCE_VALIDATION_ERROR"; throw error;
    }
    return { ...match, interpretation: String(item.interpretation || match.interpretation) };
  });
}

module.exports = { RESEARCH_EVIDENCE_SOURCE_TYPES, createResearchEvidenceItem, normalizeResearchEvidenceReferences };
