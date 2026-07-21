const crypto = require("node:crypto");
const { redactSensitive } = require("../../../services/redactionService");

const SAFE_DATA_FIELDS = Object.freeze([
  "actionType", "allocationPct", "approvalStatus", "confidence", "drawdown",
  "holdingPeriod", "market", "marketRegime", "outcome", "proposalStatus",
  "regime", "returnPct", "sector", "sharpe", "side", "strategyName",
  "strategyVersion", "symbol", "symbols", "timeframe", "validationStatus",
]);
const SENSITIVE_CONTENT = /(?:api[_-]?key|authorization|bearer\s+[a-z0-9._-]+|password|private[_-]?key|session[_-]?id|csrf|cookie|\[REDACTED\])/i;
const MAX_DOCUMENT_LENGTH = 6000;

function scalar(value) {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, 300);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}

function safeData(structuredData = {}) {
  const entries = [];
  for (const key of SAFE_DATA_FIELDS) {
    const value = structuredData?.[key];
    if (Array.isArray(value)) {
      const items = value.map(scalar).filter((item) => item !== null).slice(0, 12);
      if (items.length) entries.push([key, items.join(", ")]);
      continue;
    }
    const normalized = scalar(value);
    if (normalized !== null && normalized !== "") entries.push([key, normalized]);
  }
  return entries;
}

function linkValues(links = [], entityType) {
  return [...new Set(
    links
      .filter((link) => link?.entityType === entityType)
      .map((link) => scalar(link.entityId))
      .filter(Boolean)
  )].sort().slice(0, 12);
}

function hashDocument(document, metadata) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ document, ...metadata }))
    .digest("hex");
}

function buildMemoryDocument(memory, { builderVersion = "1" } = {}) {
  if (!memory?.id) throw new Error("A memory event is required to build an embedding document.");

  const redacted = redactSensitive({
    title: memory.title,
    summary: memory.summary,
    structuredData: memory.structuredData || {},
  });
  const lines = [
    `Category: ${memory.category}`,
    `Event: ${memory.eventType}`,
    `Title: ${scalar(redacted.title) || "Untitled memory"}`,
    `Summary: ${scalar(redacted.summary) || "No summary available"}`,
  ];

  const labels = { SYMBOL: "Symbols", SECTOR: "Sectors", REGIME: "Regimes" };
  for (const [entityType, label] of Object.entries(labels)) {
    const values = linkValues(memory.links, entityType);
    if (values.length) lines.push(`${label}: ${values.join(", ")}`);
  }
  for (const [key, value] of safeData(redacted.structuredData)) {
    lines.push(`${key}: ${value}`);
  }
  const occurredAt = new Date(memory.occurredAt);
  if (!Number.isNaN(occurredAt.getTime())) {
    lines.push(`Occurred At: ${occurredAt.toISOString().slice(0, 10)}`);
  }

  const document = lines.join("\n").slice(0, MAX_DOCUMENT_LENGTH);
  if (SENSITIVE_CONTENT.test(document)) {
    const error = new Error("Embedding document contains blocked sensitive content.");
    error.code = "SENSITIVE_CONTENT";
    throw error;
  }

  return {
    document,
    preview: document.slice(0, 240),
    sourceContentHash: hashDocument(document, {
      builderVersion,
      memoryContentHash: memory.contentHash,
      schemaVersion: memory.schemaVersion,
    }),
    builderVersion,
  };
}

module.exports = {
  MAX_DOCUMENT_LENGTH,
  SAFE_DATA_FIELDS,
  buildMemoryDocument,
};
