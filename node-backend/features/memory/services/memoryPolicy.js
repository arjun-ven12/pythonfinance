const crypto = require("crypto");
const { redactSensitive } = require("../../../services/redactionService");

const CATEGORIES = Object.freeze(["STRATEGY", "PORTFOLIO", "MATRIX", "RESEARCH", "TRADE", "BROKER", "APPROVAL", "SCANNER", "RISK", "AI", "SYSTEM"]);
const RETENTION_STATES = Object.freeze(["ACTIVE", "ARCHIVED", "EXCLUDED", "DELETED_PENDING"]);
const CREATED_BY_TYPES = Object.freeze(["USER", "AI", "SYSTEM", "BACKFILL"]);
const FEEDBACK_TYPES = Object.freeze(["USEFUL", "NOT_USEFUL", "INCORRECT", "CORRECTED", "CONFIRMED_BY_OUTCOME", "DISPROVED_BY_OUTCOME", "EXCLUDE_FROM_AI"]);
const RELATIONSHIP_TYPES = Object.freeze(["GENERATED_FROM", "EXECUTED_BY", "VALIDATED_BY", "CAUSED_BY", "RELATED_TO", "DEPLOYED_IN", "ROUTED_THROUGH", "APPROVED_BY", "REJECTED_BY", "RESULTED_IN", "REFLECTED_IN", "ATTRIBUTED_TO", "FILLED_BY", "OPENED_BY", "CLOSED_BY", "OBSERVED_AFTER", "REFERENCES", "SUPERSEDES"]);
const ENTITY_TYPES = Object.freeze(["STRATEGY", "STRATEGY_VERSION", "STRATEGY_RUN", "MATRIX", "MATRIX_CELL", "MATRIX_REPLAY", "PORTFOLIO", "PORTFOLIO_SNAPSHOT", "PORTFOLIO_PROPOSAL", "POSITION", "OPPORTUNITY", "RESEARCH_PROJECT", "RESEARCH_REPORT", "ORDER", "FILL", "TRADE", "APPROVAL", "SCANNER_RUN", "AI_INVOCATION", "SYMBOL", "SECTOR", "REGIME"]);
const EVENT_CATEGORIES = Object.freeze({
  STRATEGY_CREATED: "STRATEGY", STRATEGY_VERSION_CREATED: "STRATEGY", STRATEGY_EDIT_PROPOSED: "STRATEGY", STRATEGY_EDIT_APPROVED: "STRATEGY", STRATEGY_EDIT_REJECTED: "STRATEGY", STRATEGY_VALIDATION_PASSED: "STRATEGY", STRATEGY_VALIDATION_FAILED: "STRATEGY", STRATEGY_DEPLOYED: "STRATEGY", STRATEGY_DEACTIVATED: "STRATEGY", STRATEGY_ROLLED_BACK: "STRATEGY",
  BACKTEST_COMPLETED: "RESEARCH", WALK_FORWARD_COMPLETED: "RESEARCH", ROBUSTNESS_COMPLETED: "RESEARCH", MONTE_CARLO_COMPLETED: "RESEARCH", RESEARCH_PROJECT_CREATED: "RESEARCH", RESEARCH_REPORT_CREATED: "RESEARCH", THESIS_UPDATED: "RESEARCH",
  MATRIX_REPLAY_COMPLETED: "MATRIX", MATRIX_PROPOSAL_CREATED: "MATRIX", MATRIX_PROPOSAL_APPROVED: "MATRIX", MATRIX_PROPOSAL_REJECTED: "MATRIX", MATRIX_DEPLOYED: "MATRIX", MATRIX_CELL_CHANGED: "MATRIX", MATRIX_ALLOCATION_CHANGED: "MATRIX",
  PORTFOLIO_SNAPSHOT_RECORDED: "PORTFOLIO", PORTFOLIO_PROPOSAL_CREATED: "PORTFOLIO", PORTFOLIO_PROPOSAL_APPROVED: "PORTFOLIO", PORTFOLIO_PROPOSAL_REJECTED: "PORTFOLIO", PORTFOLIO_ALLOCATION_CHANGED: "PORTFOLIO", PORTFOLIO_RISK_STATE_CHANGED: "RISK", PORTFOLIO_DRAWDOWN_THRESHOLD_CROSSED: "RISK", PORTFOLIO_OUTCOME_RECORDED: "PORTFOLIO", RISK_LIMIT_TRIGGERED: "RISK",
  ORDER_CREATED: "TRADE", ORDER_ACKNOWLEDGED: "BROKER", ORDER_SUBMITTED: "BROKER", ORDER_SUBMIT_FAILED: "BROKER", ORDER_REJECTED: "BROKER", ORDER_CANCEL_REQUESTED: "BROKER", ORDER_CANCELLED: "BROKER", ORDER_EXPIRED: "BROKER", ORDER_MODIFIED: "BROKER", ORDER_FILLED: "BROKER", ORDER_PARTIALLY_FILLED: "BROKER", FILL_RECORDED: "BROKER", INTERNAL_PAPER_FILL_RECORDED: "TRADE", TRADE_OPENED: "TRADE", TRADE_PARTIALLY_CLOSED: "TRADE", TRADE_CLOSED: "TRADE", TRADE_OUTCOME_RECORDED: "TRADE", POSITION_INCREASED: "PORTFOLIO", POSITION_REDUCED: "PORTFOLIO", POSITION_CLOSED: "PORTFOLIO", MANUAL_OVERRIDE: "TRADE",
  APPROVAL_CREATED: "APPROVAL", APPROVAL_APPROVED: "APPROVAL", APPROVAL_REJECTED: "APPROVAL", APPROVAL_EXPIRED: "APPROVAL",
  AI_RECOMMENDATION_CREATED: "AI", AI_RECOMMENDATION_ACCEPTED: "AI", AI_RECOMMENDATION_REJECTED: "AI", AI_OUTPUT_CORRECTED: "AI",
  SCAN_COMPLETED: "SCANNER", OPPORTUNITY_IDENTIFIED: "SCANNER", OPPORTUNITY_REJECTED: "SCANNER", OPPORTUNITY_FILTERED: "SCANNER", SIGNAL_DOWNGRADED: "SCANNER", OPPORTUNITY_EXPIRED: "SCANNER", OPPORTUNITY_APPROVED: "SCANNER", OPPORTUNITY_ROUTED: "SCANNER", OPPORTUNITY_EXECUTED: "SCANNER",
  STRATEGY_EDIT_LOADED_TO_BUILDER: "STRATEGY", STRATEGY_COMPARISON_COMPLETED: "STRATEGY", STRATEGY_RESEARCH_REVIEW_COMPLETED: "RESEARCH", STRATEGY_DEPLOYMENT_BLOCKED: "STRATEGY", STRATEGY_VERSION_PROMOTED: "STRATEGY", STRATEGY_VERSION_SUPERSEDED: "STRATEGY",
});
const IMPORTANCE_BASE = Object.freeze({
  STRATEGY_DEPLOYED: 98, MATRIX_DEPLOYED: 98, ORDER_FILLED: 98, FILL_RECORDED: 96, INTERNAL_PAPER_FILL_RECORDED: 96, TRADE_CLOSED: 95, TRADE_OUTCOME_RECORDED: 95, PORTFOLIO_OUTCOME_RECORDED: 90, PORTFOLIO_DRAWDOWN_THRESHOLD_CROSSED: 96, MANUAL_OVERRIDE: 95, RISK_LIMIT_TRIGGERED: 95,
  STRATEGY_ROLLED_BACK: 92, STRATEGY_DEACTIVATED: 90, MATRIX_PROPOSAL_APPROVED: 88, MATRIX_PROPOSAL_REJECTED: 84, PORTFOLIO_PROPOSAL_APPROVED: 88, PORTFOLIO_PROPOSAL_REJECTED: 84, APPROVAL_APPROVED: 88, APPROVAL_REJECTED: 84, ORDER_REJECTED: 86, ORDER_CANCELLED: 82,
  MATRIX_REPLAY_COMPLETED: 78, BACKTEST_COMPLETED: 72, WALK_FORWARD_COMPLETED: 76, ROBUSTNESS_COMPLETED: 76, MONTE_CARLO_COMPLETED: 76, RESEARCH_REPORT_CREATED: 68, STRATEGY_VERSION_CREATED: 72, STRATEGY_VALIDATION_FAILED: 82, STRATEGY_VALIDATION_PASSED: 70, AI_RECOMMENDATION_ACCEPTED: 68, AI_RECOMMENDATION_REJECTED: 65,
  MATRIX_PROPOSAL_CREATED: 62, PORTFOLIO_PROPOSAL_CREATED: 62, RESEARCH_PROJECT_CREATED: 60, THESIS_UPDATED: 66, ORDER_CREATED: 72, ORDER_SUBMITTED: 82, APPROVAL_CREATED: 72, TRADE_OPENED: 82, SCAN_COMPLETED: 42, OPPORTUNITY_IDENTIFIED: 52, AI_RECOMMENDATION_CREATED: 52,
});
const SENSITIVE_KEY = /(password|passphrase|secret|api[_-]?key|authorization|cookie|csrf|session|token|private[_-]?key|encrypted|cipher|raw(provider|request|response|headers)?)/i;

function memoryError(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; error.code = "MEMORY_VALIDATION_ERROR"; return error; }
function bounded(value, max, label, required = false) { const normalized = String(value || "").replace(/\s+/g, " ").trim(); if (required && !normalized) throw memoryError(`${label} is required.`); if (normalized.length > max) return normalized.slice(0, max); return normalized; }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])); return value; }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function sanitizeStructuredData(value, depth = 0) {
  if (depth > 5) return "[TRUNCATED]";
  const redacted = redactSensitive(value);
  if (redacted === null || ["string", "number", "boolean"].includes(typeof redacted)) return typeof redacted === "string" ? bounded(redacted, 1000, "Value") : redacted;
  if (Array.isArray(redacted)) return redacted.slice(0, 50).map((item) => sanitizeStructuredData(item, depth + 1));
  if (typeof redacted !== "object") return null;
  return Object.fromEntries(Object.entries(redacted).slice(0, 80).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, item]) => [bounded(key, 80, "Key"), sanitizeStructuredData(item, depth + 1)]));
}
function importanceFor(eventType, context = {}) { let score = IMPORTANCE_BASE[eventType] ?? 40; if (context.realCapitalImpact) score += 8; if (context.stateTransition) score += 5; if (context.measurableOutcome) score += 3; if (context.riskSeverity === "HIGH" || context.riskSeverity === "CRITICAL") score += 8; return Math.max(0, Math.min(100, Math.round(score))); }
function validateEvent(input = {}) {
  const eventType = bounded(input.eventType, 100, "Event type", true).toUpperCase(); const category = String(input.category || EVENT_CATEGORIES[eventType] || "").toUpperCase();
  if (!EVENT_CATEGORIES[eventType]) throw memoryError(`Unsupported memory event type: ${eventType}.`); if (!CATEGORIES.includes(category) || EVENT_CATEGORIES[eventType] !== category) throw memoryError(`Memory category does not match ${eventType}.`);
  const occurredAt = new Date(input.occurredAt || new Date()); if (Number.isNaN(occurredAt.getTime())) throw memoryError("occurredAt must be a valid date.");
  const confidence = input.confidence === undefined || input.confidence === null ? null : Number(input.confidence); if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 100)) throw memoryError("Memory confidence must be between 0 and 100.");
  const structuredData = sanitizeStructuredData(input.structuredData || {}); if (Buffer.byteLength(JSON.stringify(structuredData), "utf8") > 32_000) throw memoryError("Memory structured data exceeds 32KB.");
  const links = (input.links || []).slice(0, 30).map((link) => { const entityType = String(link.entityType || "").toUpperCase(); const relationshipType = String(link.relationshipType || "RELATED_TO").toUpperCase(); if (!ENTITY_TYPES.includes(entityType)) throw memoryError(`Unsupported memory entity type: ${entityType}.`); if (!RELATIONSHIP_TYPES.includes(relationshipType)) throw memoryError(`Unsupported memory relationship type: ${relationshipType}.`); return { entityType, entityId: bounded(link.entityId, 160, "Entity ID", true), relationshipType }; });
  const sourceType = bounded(input.sourceType, 80, "Source type", true).toUpperCase(); const sourceId = bounded(input.sourceId, 160, "Source ID", true); const sourceVersion = input.sourceVersion === undefined || input.sourceVersion === null ? null : bounded(input.sourceVersion, 80, "Source version");
  const content = { category, eventType, title: bounded(input.title, 200, "Title", true), summary: bounded(input.summary, 1200, "Summary", true), structuredData, sourceType, sourceId, sourceVersion };
  return { ...content, occurredAt, confidence, links, importance: importanceFor(eventType, input.importanceContext), contentHash: hash(content), dedupeKey: bounded(input.dedupeKey, 200, "Dedupe key") || hash({ category, eventType, sourceType, sourceId }), createdByType: CREATED_BY_TYPES.includes(String(input.createdByType || "SYSTEM").toUpperCase()) ? String(input.createdByType || "SYSTEM").toUpperCase() : "SYSTEM", createdById: input.createdById ? bounded(input.createdById, 160, "Creator ID") : null, schemaVersion: bounded(input.schemaVersion || "1", 20, "Schema version"), retentionState: RETENTION_STATES.includes(input.retentionState) ? input.retentionState : "ACTIVE", excludedFromAi: Boolean(input.excludedFromAi) };
}

module.exports = { CATEGORIES, CREATED_BY_TYPES, ENTITY_TYPES, EVENT_CATEGORIES, FEEDBACK_TYPES, RELATIONSHIP_TYPES, RETENTION_STATES, hash, importanceFor, memoryError, sanitizeStructuredData, validateEvent };
