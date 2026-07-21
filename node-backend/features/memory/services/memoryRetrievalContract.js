const { redactSensitive } = require("../../../services/redactionService");
const { CATEGORIES, ENTITY_TYPES } = require("./memoryPolicy");

const RETRIEVAL_INTENTS = Object.freeze([
  "STRATEGY_HISTORY", "TRADE_HISTORY", "PORTFOLIO_HISTORY", "MATRIX_HISTORY",
  "RESEARCH_HISTORY", "AI_RECOMMENDATION_HISTORY", "USER_PREFERENCE",
  "PAST_OUTCOME", "SIMILAR_EVENT", "ENTITY_TIMELINE", "GENERAL_MEMORY_SEARCH",
]);
const RETRIEVAL_MODES = Object.freeze([
  "OFF", "EXACT_ONLY", "RELEVANT_HISTORY", "PAST_OUTCOMES", "USER_PREFERENCES",
  "ENTITY_TIMELINE", "FULL_ALLOWED_CONTEXT",
]);
const REGIMES = Object.freeze([
  "BULL_LOW_VOLATILITY", "BULL_HIGH_VOLATILITY", "BEAR_LOW_VOLATILITY",
  "BEAR_HIGH_VOLATILITY", "SIDEWAYS_LOW_VOLATILITY", "SIDEWAYS_HIGH_VOLATILITY",
]);
const SECTORS = Object.freeze([
  "TECHNOLOGY", "HEALTHCARE", "FINANCIALS", "ENERGY", "COMMUNICATION SERVICES",
  "CONSUMER DISCRETIONARY", "CONSUMER STAPLES", "INDUSTRIALS", "MATERIALS",
  "REAL ESTATE", "UTILITIES",
]);
const SYMBOL_STOP_WORDS = new Set(["AI", "API", "ETF", "US", "THE", "WHY", "HOW", "PAST", "BEAR", "BULL", "HIGH", "LOW", "HV", "LV", "HAVE", "TRADE"]);

function error(message) { const value = new Error(message); value.statusCode = 400; value.code = "MEMORY_RETRIEVAL_VALIDATION"; return value; }
function strings(value, maxItems = 20, maxLength = 160) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw error("Retrieval filters must be arrays.");
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean).map((item) => item.slice(0, maxLength)))].slice(0, maxItems);
}
function date(value, label) { if (!value) return null; const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) throw error(`${label} must be a valid date.`); return parsed; }

function classifyIntent(query) {
  const value = query.toLowerCase();
  if (/timeline|chronolog|\bhistory\b/.test(value)) return "ENTITY_TIMELINE";
  if (/preference|prefer|usually choose/.test(value)) return "USER_PREFERENCE";
  if (/recommendation|ai suggested|copilot/.test(value)) return "AI_RECOMMENDATION_HISTORY";
  if (/outcome|profit|loss|won|lost|performed|before|previously/.test(value)) return "PAST_OUTCOME";
  if (/similar|setup|pattern/.test(value)) return "SIMILAR_EVENT";
  if (/matrix|cell|deployment/.test(value)) return "MATRIX_HISTORY";
  if (/portfolio|allocation|exposure|holding/.test(value)) return "PORTFOLIO_HISTORY";
  if (/backtest|research|thesis|report|walk.forward|monte carlo/.test(value)) return "RESEARCH_HISTORY";
  if (/strategy|version|signal|rule/.test(value)) return "STRATEGY_HISTORY";
  if (/trade|fill|order|position/.test(value)) return "TRADE_HISTORY";
  return "GENERAL_MEMORY_SEARCH";
}

function intentCategories(intent) {
  return {
    STRATEGY_HISTORY: ["STRATEGY", "RESEARCH", "TRADE", "AI"],
    TRADE_HISTORY: ["TRADE", "BROKER", "APPROVAL", "STRATEGY"],
    PORTFOLIO_HISTORY: ["PORTFOLIO", "RISK", "TRADE", "AI"],
    MATRIX_HISTORY: ["MATRIX", "STRATEGY", "RESEARCH", "PORTFOLIO"],
    RESEARCH_HISTORY: ["RESEARCH", "STRATEGY", "MATRIX", "AI"],
    AI_RECOMMENDATION_HISTORY: ["AI", "STRATEGY", "PORTFOLIO", "MATRIX"],
    USER_PREFERENCE: ["AI", "STRATEGY", "PORTFOLIO", "RESEARCH"],
    PAST_OUTCOME: ["TRADE", "BROKER", "RESEARCH", "MATRIX", "STRATEGY"],
  }[intent] || [];
}

function extractEntities(query) {
  const upper = query.toUpperCase();
  const symbols = [...new Set((upper.match(/\b[A-Z]{1,5}\b/g) || []).filter((item) => !SYMBOL_STOP_WORDS.has(item)))].slice(0, 10);
  const sectors = SECTORS.filter((sector) => upper.includes(sector)).slice(0, 10);
  const regimes = [];
  const regimePatterns = [
    [/\bBULL\s*(?:LOW|LV)\b/, "BULL_LOW_VOLATILITY"], [/\bBULL\s*(?:HIGH|HV)\b/, "BULL_HIGH_VOLATILITY"],
    [/\bBEAR\s*(?:LOW|LV)\b/, "BEAR_LOW_VOLATILITY"], [/\bBEAR\s*(?:HIGH|HV)\b/, "BEAR_HIGH_VOLATILITY"],
    [/\bSIDEWAYS\s*(?:LOW|LV)\b/, "SIDEWAYS_LOW_VOLATILITY"], [/\bSIDEWAYS\s*(?:HIGH|HV)\b/, "SIDEWAYS_HIGH_VOLATILITY"],
  ];
  for (const [pattern, regime] of regimePatterns) if (pattern.test(upper)) regimes.push(regime);
  return { symbols, sectors, regimes };
}

function extractDateRange(query) {
  const between = query.match(/\bbetween\s+(\d{4}-\d{2}-\d{2})\s+(?:and|to)\s+(\d{4}-\d{2}-\d{2})\b/i);
  if (between) return { from: date(between[1], "query date"), to: date(between[2], "query date") };
  const since = query.match(/\b(?:since|after|from)\s+(\d{4}-\d{2}-\d{2})\b/i);
  const before = query.match(/\b(?:before|until|through)\s+(\d{4}-\d{2}-\d{2})\b/i);
  return {
    from: since ? date(since[1], "query date") : null,
    to: before ? date(before[1], "query date") : null,
  };
}

function normalizeRetrievalRequest(input = {}, config) {
  const rawQuery = String(input.query || "").replace(/\s+/g, " ").trim();
  const mode = String(input.mode || input.memoryMode || "RELEVANT_HISTORY").toUpperCase();
  if (!RETRIEVAL_MODES.includes(mode)) throw error("Unsupported memory retrieval mode.");
  if (mode !== "OFF" && !rawQuery) throw error("Memory retrieval query is required.");
  if (rawQuery.length > 1200) throw error("Memory retrieval query exceeds 1200 characters.");
  const query = String(redactSensitive(rawQuery));
  const modeIntent = { PAST_OUTCOMES: "PAST_OUTCOME", USER_PREFERENCES: "USER_PREFERENCE", ENTITY_TIMELINE: "ENTITY_TIMELINE" }[mode];
  const inferredIntent = modeIntent || classifyIntent(query);
  const intent = String(input.intent || inferredIntent).toUpperCase();
  if (!RETRIEVAL_INTENTS.includes(intent)) throw error("Unsupported memory retrieval intent.");
  const extracted = extractEntities(query);
  const categories = strings(input.categories, 11, 30).map((item) => item.toUpperCase());
  if (categories.some((item) => !CATEGORIES.includes(item))) throw error("Unsupported memory category filter.");
  const entityFilters = (Array.isArray(input.entityFilters) ? input.entityFilters : []).slice(0, 20).map((item) => {
    const entityType = String(item?.entityType || "").toUpperCase();
    if (!ENTITY_TYPES.includes(entityType)) throw error("Unsupported memory entity filter.");
    const entityId = String(item?.entityId || "").trim().slice(0, 160);
    if (!entityId) throw error("Memory entity filters require entityId.");
    return { entityType, entityId };
  });
  const addLinks = (entityType, values) => values.forEach((entityId) => entityFilters.push({ entityType, entityId }));
  const symbols = strings(input.symbols).map((item) => item.toUpperCase());
  const sectors = strings(input.sectors).map((item) => item.toUpperCase());
  const regimes = strings(input.regimes).map((item) => item.toUpperCase());
  addLinks("SYMBOL", symbols.length ? symbols : extracted.symbols);
  addLinks("SECTOR", sectors.length ? sectors : extracted.sectors);
  addLinks("REGIME", regimes.length ? regimes : extracted.regimes);
  [["STRATEGY", input.strategyIds], ["STRATEGY_VERSION", input.strategyVersionIds], ["MATRIX", input.matrixIds], ["PORTFOLIO", input.portfolioIds], ["RESEARCH_PROJECT", input.researchProjectIds]].forEach(([type, values]) => addLinks(type, strings(values)));
  const minimumImportance = Number(input.minimumImportance ?? 0);
  const minimumSimilarity = Number(input.minimumSimilarity ?? config.minSimilarity);
  if (!Number.isFinite(minimumImportance) || minimumImportance < 0 || minimumImportance > 100) throw error("minimumImportance must be between 0 and 100.");
  if (!Number.isFinite(minimumSimilarity) || minimumSimilarity < 0 || minimumSimilarity > 1) throw error("minimumSimilarity must be between 0 and 1.");
  const inferredDateRange = extractDateRange(query);
  const explicitDateRange = {
    from: date(input.dateRange?.from, "dateRange.from"),
    to: date(input.dateRange?.to, "dateRange.to"),
  };
  const dateRange = {
    from: explicitDateRange.from || inferredDateRange.from,
    to: explicitDateRange.to || inferredDateRange.to,
  };
  if (dateRange.from && dateRange.to && dateRange.from > dateRange.to) throw error("dateRange.from must be before dateRange.to.");
  return {
    query, intent, mode,
    categories: categories.length ? categories : intentCategories(intent),
    eventTypes: strings(input.eventTypes, 30, 100).map((item) => item.toUpperCase()),
    entityFilters: [...new Map(entityFilters.map((item) => [`${item.entityType}:${item.entityId}`, item])).values()].slice(0, 20),
    dateRange,
    minimumImportance,
    minimumSimilarity,
    maximumResults: Math.round(Math.min(config.maxResults, Math.max(1, Number(input.maximumResults || input.maxResults) || config.maxResults))),
    tokenBudget: Math.round(Math.min(config.maxContextTokens, Math.max(200, Number(input.tokenBudget) || config.maxContextTokens))),
    requestingFeature: String(input.requestingFeature || "MEMORY_INTERNAL_API").slice(0, 80),
    personalizationSignals: strings(input.personalizationSignals, 20, 120),
    includeExcluded: false,
  };
}

module.exports = { RETRIEVAL_INTENTS, RETRIEVAL_MODES, classifyIntent, extractDateRange, extractEntities, normalizeRetrievalRequest };
