const { sha256, stableStringify } = require("./ai.governance");

const TOKEN_SECTIONS = Object.freeze([
  ["systemPrompt", "System Prompt"],
  ["developerPrompt", "Developer Prompt"],
  ["userPrompt", "User Prompt"],
  ["conversationHistory", "Conversation History"],
  ["memoryContext", "Memory Context"],
  ["retrievedMemories", "Retrieved Memories"],
  ["portfolioContext", "Portfolio Context"],
  ["strategyContext", "Strategy Context"],
  ["matrixContext", "Matrix Context"],
  ["researchContext", "Research Context"],
  ["scannerContext", "Scanner Context"],
  ["marketData", "Market Data"],
  ["brokerContext", "Broker Context"],
  ["playbookContext", "Playbook Context"],
  ["validationContext", "Validation Context"],
  ["jsonSchemas", "JSON Schemas"],
  ["structuredOutputSchema", "Structured Output Schema"],
  ["otherContext", "Other Context"],
]);

const SECTION_LABELS = Object.freeze(Object.fromEntries(TOKEN_SECTIONS));
const CONTEXT_SECTION_KEYS = new Set(TOKEN_SECTIONS.slice(2, -1).map(([key]) => key));
const WORD_PATTERN = /[a-zA-Z][a-zA-Z0-9_-]{3,}/g;
const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "before", "being", "between",
  "could", "from", "have", "into", "more", "other", "should", "than", "that",
  "their", "there", "these", "they", "this", "through", "under", "using", "value",
  "values", "where", "which", "with", "without", "would", "your",
]);

function toText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return stableStringify(value);
}

function estimateTokens(value) {
  const text = toText(value);
  if (!text) return 0;
  const bytes = Buffer.byteLength(text, "utf8");
  const words = (text.match(/\S+/g) || []).length;
  return Math.max(1, Math.ceil(Math.max(bytes / 4, words * 1.12)));
}

function classifyPath(pathParts) {
  const path = pathParts.join(".").toLowerCase();
  const last = String(pathParts.at(-1) || "").toLowerCase();

  if (/relevanthistoricalcontext.*memories|retrievedmemor|memoryresults|memoryitems/.test(path)) return "retrievedMemories";
  if (/relevanthistoricalcontext|memorycontext|historicalcontext|personalization|memoryprofile/.test(path)) return "memoryContext";
  if (/conversation|messages|chathistory|conversationhistory|previousmessages/.test(path)) return "conversationHistory";
  if (/userprompt|userquestion|question$|query$|message$|instruction$/.test(path)) return "userPrompt";
  if (/matrix|routingcell|regimecell/.test(path)) return "matrixContext";
  if (/strategy|experiment|backtest|deployment|allocation/.test(path)) return "strategyContext";
  if (/portfolio|position|holding|exposure|riskdashboard/.test(path)) return "portfolioContext";
  if (/research|thesis|report|evidence|source/.test(path)) return "researchContext";
  if (/scanner|scanresult|opportunit|signal/.test(path)) return "scannerContext";
  if (/marketdata|quote|pricehistory|price_history|ohlc|candles|marketregime/.test(path)) return "marketData";
  if (/broker|order|fill|execution|accountsummary/.test(path)) return "brokerContext";
  if (/playbook|recommendationhistory/.test(path)) return "playbookContext";
  if (/validation|calibration|evaluation/.test(path)) return "validationContext";
  if (/schema|contract/.test(path) || last.endsWith("jsonschema")) return "jsonSchemas";
  return "otherContext";
}

function collectContextSections(value, pathParts = [], result = null) {
  const sections = result || Object.fromEntries(TOKEN_SECTIONS.map(([key]) => [key, []]));
  if (value == null) return sections;

  if (Array.isArray(value)) {
    if (value.length === 0) return sections;
    value.forEach((entry, index) => collectContextSections(entry, [...pathParts, String(index)], sections));
    return sections;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return sections;
    entries.forEach(([key, entry]) => collectContextSections(entry, [...pathParts, key], sections));
    return sections;
  }

  const section = classifyPath(pathParts);
  sections[section].push(`${pathParts.join(".")}: ${String(value)}`);
  return sections;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (offset < haystack.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

function removeSerializedContext(instructions, input) {
  let base = String(instructions || "");
  const pretty = JSON.stringify(input || {}, null, 2);
  const compact = JSON.stringify(input || {});
  const prettyCopies = countOccurrences(base, pretty);
  base = pretty ? base.split(pretty).join("") : base;
  const compactCopies = compact === pretty ? 0 : countOccurrences(base, compact);
  base = compact && compact !== pretty ? base.split(compact).join("") : base;
  return {
    base,
    embeddedContextCopies: prettyCopies + compactCopies,
  };
}

function reconcileTokenCounts(rawCounts, providerInputTokens) {
  const keys = TOKEN_SECTIONS.map(([key]) => key);
  const rawTotal = keys.reduce((sum, key) => sum + Number(rawCounts[key] || 0), 0);
  const exactTotal = Number(providerInputTokens);
  if (!Number.isFinite(exactTotal) || exactTotal < 0 || rawTotal === 0) {
    return Object.fromEntries(keys.map((key) => [key, Math.max(0, Math.round(rawCounts[key] || 0))]));
  }

  const scaled = keys.map((key) => {
    const precise = (Number(rawCounts[key] || 0) / rawTotal) * exactTotal;
    return { key, precise, tokens: Math.floor(precise) };
  });
  let remaining = exactTotal - scaled.reduce((sum, item) => sum + item.tokens, 0);
  scaled.sort((a, b) => (b.precise - b.tokens) - (a.precise - a.tokens));
  for (let index = 0; index < scaled.length && remaining > 0; index += 1, remaining -= 1) {
    scaled[index].tokens += 1;
  }
  return Object.fromEntries(scaled.map(({ key, tokens }) => [key, tokens]));
}

function normalizedEntropy(counts) {
  const values = Object.values(counts).filter((value) => value > 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (values.length <= 1 || total <= 0) return 0;
  const entropy = -values.reduce((sum, value) => {
    const probability = value / total;
    return sum + probability * Math.log2(probability);
  }, 0);
  return Number((entropy / Math.log2(values.length)).toFixed(4));
}

function sectionTerms(text) {
  const matches = String(text || "").toLowerCase().match(WORD_PATTERN) || [];
  return new Set(matches.filter((word) => !STOP_WORDS.has(word)).slice(0, 500));
}

function calculateReferenceCoverage(sectionTexts, sectionTokens, response) {
  const responseTerms = sectionTerms(toText(response));
  const referenced = [];
  const unused = [];
  let referencedTokens = 0;
  let eligibleTokens = 0;
  const bySection = {};

  for (const [key] of TOKEN_SECTIONS) {
    if (!CONTEXT_SECTION_KEYS.has(key)) continue;
    const tokens = Number(sectionTokens[key] || 0);
    if (tokens <= 0) continue;
    eligibleTokens += tokens;
    const terms = sectionTerms(sectionTexts[key]);
    const matched = [...terms].filter((term) => responseTerms.has(term)).length;
    const overlapPct = terms.size > 0 ? (matched / terms.size) * 100 : 0;
    const isReferenced = matched >= Math.min(2, Math.max(1, Math.ceil(terms.size * 0.04)));
    bySection[key] = { matchedTerms: matched, candidateTerms: terms.size, overlapPct: Number(overlapPct.toFixed(2)), referenced: isReferenced };
    if (isReferenced) {
      referenced.push(key);
      referencedTokens += tokens;
    } else if (tokens >= 8) {
      unused.push(key);
    }
  }

  return {
    referencedSections: referenced,
    unusedSections: unused,
    contextReferencePct: eligibleTokens > 0 ? Number(((referencedTokens / eligibleTokens) * 100).toFixed(2)) : 0,
    retrievedMemoryReferencePct: bySection.retrievedMemories?.overlapPct || 0,
    bySection,
  };
}

function compareWithPrevious(currentHashes, currentTokens, previous) {
  const previousHashes = previous?.contextBreakdown?.sectionHashes || previous?.sectionHashes || {};
  const previousTokens = previous?.tokenBreakdown?.sections || previous?.sections || {};
  const identicalSections = [];
  const changedSections = [];
  let repeatedTokens = 0;
  let comparableTokens = 0;

  for (const [key] of TOKEN_SECTIONS) {
    if (![...CONTEXT_SECTION_KEYS, "systemPrompt", "structuredOutputSchema"].includes(key)) continue;
    const tokens = Number(currentTokens[key] || 0);
    comparableTokens += tokens;
    if (tokens > 0 && currentHashes[key] && currentHashes[key] === previousHashes[key]) {
      identicalSections.push(key);
      repeatedTokens += Math.min(tokens, Number(previousTokens[key]?.tokens ?? previousTokens[key] ?? tokens));
    } else if (tokens > 0) {
      changedSections.push(key);
    }
  }

  return {
    previousRequestId: previous?.requestId || previous?.id || null,
    identicalSections,
    changedSections,
    repeatedTokens,
    identicalContextPct: comparableTokens > 0 ? Number(((repeatedTokens / comparableTokens) * 100).toFixed(2)) : 0,
    changedContextPct: comparableTokens > 0 ? Number((100 - (repeatedTokens / comparableTokens) * 100).toFixed(2)) : 0,
    potentialCacheSavingsTokens: repeatedTokens,
  };
}

function buildWarnings({ sections, contextCopies, duplicateSections, referenceCoverage }) {
  const inputTotal = Object.values(sections).reduce((sum, item) => sum + item.tokens, 0);
  const pct = (key) => inputTotal > 0 ? (sections[key].tokens / inputTotal) * 100 : 0;
  const warnings = [];
  if (pct("memoryContext") + pct("retrievedMemories") > 50) warnings.push("Memory exceeds 50% of context");
  if (pct("strategyContext") > 20) warnings.push("Strategy JSON exceeds 20% of context");
  if (pct("structuredOutputSchema") + pct("jsonSchemas") > 20) warnings.push("Schema unusually large");
  if (pct("conversationHistory") > 25) warnings.push("Conversation history growing excessively");
  if (contextCopies > 1) warnings.push("Prompt repeated identical context");
  if (duplicateSections.length > 0) warnings.push("Repeated prompt sections detected");
  if (referenceCoverage.contextReferencePct < 20 && inputTotal > 100) warnings.push("Low context reference coverage");
  return warnings;
}

function buildContextObservability({ instructions, input, schema, providerInputTokens, response, previousInvocation = null }) {
  const collected = collectContextSections(input || {});
  const sectionTexts = Object.fromEntries(TOKEN_SECTIONS.map(([key]) => [key, (collected[key] || []).join("\n")]));
  const stripped = removeSerializedContext(instructions, input);
  sectionTexts.systemPrompt = stripped.base;
  sectionTexts.structuredOutputSchema = schema == null ? "" : stableStringify(schema);
  const contextCopies = 1 + stripped.embeddedContextCopies;

  const rawCounts = Object.fromEntries(TOKEN_SECTIONS.map(([key]) => [key, estimateTokens(sectionTexts[key])]));
  for (const key of CONTEXT_SECTION_KEYS) rawCounts[key] *= contextCopies;
  const reconciled = reconcileTokenCounts(rawCounts, providerInputTokens);
  const total = Object.values(reconciled).reduce((sum, value) => sum + value, 0);
  const sections = Object.fromEntries(TOKEN_SECTIONS.map(([key, label]) => [key, {
    label,
    tokens: reconciled[key] || 0,
    percentage: total > 0 ? Number((((reconciled[key] || 0) / total) * 100).toFixed(2)) : 0,
  }]));
  const contributors = Object.entries(sections)
    .filter(([, item]) => item.tokens > 0)
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .map(([key, item]) => ({ key, ...item }));
  const sectionHashes = Object.fromEntries(TOKEN_SECTIONS.map(([key]) => [key, sectionTexts[key] ? sha256(sectionTexts[key]) : null]));
  const hashesToSections = new Map();
  for (const [key, hash] of Object.entries(sectionHashes)) {
    if (!hash || !sections[key]?.tokens) continue;
    const group = hashesToSections.get(hash) || [];
    group.push(key);
    hashesToSections.set(hash, group);
  }
  const duplicateSections = [...hashesToSections.values()].filter((group) => group.length > 1);
  const emptySections = TOKEN_SECTIONS.filter(([key]) => !sections[key].tokens).map(([key]) => key);
  const referenceCoverage = calculateReferenceCoverage(sectionTexts, reconciled, response);
  const contextDiff = compareWithPrevious(sectionHashes, reconciled, previousInvocation);
  const warnings = buildWarnings({ sections, contextCopies, duplicateSections, referenceCoverage });

  return {
    tokenBreakdown: {
      method: "weighted-character-estimate-reconciled-to-provider-input-v1",
      providerInputTokens: Number(providerInputTokens) || total,
      estimatedBeforeReconciliation: Object.values(rawCounts).reduce((sum, value) => sum + value, 0),
      sections,
    },
    contextBreakdown: {
      contextCopies,
      sectionHashes,
      largestContributor: contributors[0] || null,
      topContributors: contributors.slice(0, 3),
      contextEntropy: normalizedEntropy(reconciled),
      duplicateSections,
      emptySections,
      unusedSections: referenceCoverage.unusedSections,
      contextReferencePct: referenceCoverage.contextReferencePct,
      retrievedMemoryReferencePct: referenceCoverage.retrievedMemoryReferencePct,
      referenceBySection: referenceCoverage.bySection,
    },
    contextDiff,
    warnings,
  };
}

function parsePricingTable(env = process.env) {
  if (!env.AI_MODEL_PRICING_JSON) return {};
  try {
    const parsed = JSON.parse(env.AI_MODEL_PRICING_JSON);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildPricingConfig(env = process.env) {
  const exchangeRate = Number(env.AI_USD_SGD_RATE);
  return {
    models: parsePricingTable(env),
    usdToSgdRate: Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : null,
    pricingVersion: String(env.AI_PRICING_VERSION || "unversioned"),
  };
}

function estimateDetailedCost({ model, inputTokens = 0, outputTokens = 0, cachedTokens = 0 }, config = buildPricingConfig()) {
  const rates = config.models?.[model] || config.models?.[String(model || "").toLowerCase()] || null;
  if (!rates) {
    return {
      pricingConfigured: false,
      pricingVersion: config.pricingVersion,
      inputTokenCostUsd: null,
      outputTokenCostUsd: null,
      cachedTokenCostUsd: null,
      estimatedCostUsd: null,
      estimatedCostSgd: null,
      usdToSgdRate: config.usdToSgdRate,
    };
  }
  const inputRate = Number(rates.inputCostPer1M);
  const outputRate = Number(rates.outputCostPer1M);
  const cachedRate = Number(rates.cachedInputCostPer1M);
  if (![inputRate, outputRate, cachedRate].every((value) => Number.isFinite(value) && value >= 0)) {
    return { pricingConfigured: false, pricingVersion: config.pricingVersion, estimatedCostUsd: null, estimatedCostSgd: null, usdToSgdRate: config.usdToSgdRate };
  }
  const cached = Math.max(0, Math.min(Number(inputTokens) || 0, Number(cachedTokens) || 0));
  const uncached = Math.max(0, (Number(inputTokens) || 0) - cached);
  const inputTokenCostUsd = (uncached / 1_000_000) * inputRate;
  const outputTokenCostUsd = ((Number(outputTokens) || 0) / 1_000_000) * outputRate;
  const cachedTokenCostUsd = (cached / 1_000_000) * cachedRate;
  const estimatedCostUsd = inputTokenCostUsd + outputTokenCostUsd + cachedTokenCostUsd;
  return {
    pricingConfigured: true,
    pricingVersion: config.pricingVersion,
    inputTokenCostUsd: Number(inputTokenCostUsd.toFixed(8)),
    outputTokenCostUsd: Number(outputTokenCostUsd.toFixed(8)),
    cachedTokenCostUsd: Number(cachedTokenCostUsd.toFixed(8)),
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(8)),
    estimatedCostSgd: config.usdToSgdRate ? Number((estimatedCostUsd * config.usdToSgdRate).toFixed(8)) : null,
    usdToSgdRate: config.usdToSgdRate,
  };
}

function buildResponseAnalysis({ response, providerMetadata = {}, completionDurationMs = null }) {
  const serialized = stableStringify(response || {});
  return {
    responseTokens: Number(providerMetadata.outputTokens) || null,
    jsonSizeBytes: Buffer.byteLength(serialized, "utf8"),
    reasoningTokens: Number(providerMetadata.reasoningTokens) || null,
    reasoningDurationMs: providerMetadata.reasoningDurationMs ?? null,
    streamDurationMs: providerMetadata.streamDurationMs ?? null,
    completionDurationMs: providerMetadata.completionDurationMs ?? completionDurationMs,
    responseTruncated: Boolean(providerMetadata.responseTruncated),
    finishReason: providerMetadata.finishReason || null,
    responseStatus: providerMetadata.responseStatus || null,
  };
}

function generateOptimizationRecommendations(record) {
  const sections = record?.tokenBreakdown?.sections || {};
  const recommendations = [];
  const add = (code, message, tokens) => recommendations.push({ code, message, estimatedTokenReduction: Math.max(0, Math.round(tokens || 0)) });
  const total = Object.values(sections).reduce((sum, item) => sum + Number(item?.tokens || 0), 0);
  const pct = (key) => total > 0 ? (Number(sections[key]?.tokens || 0) / total) * 100 : 0;
  if (pct("memoryContext") + pct("retrievedMemories") > 40) add("MEMORY_DOMINANT", `Memory retrieval contributes ${Math.round(pct("memoryContext") + pct("retrievedMemories"))}% of input.`, Number(sections.retrievedMemories?.tokens || 0) * 0.25);
  if (pct("strategyContext") > 20) add("STRATEGY_DOMINANT", `Strategy context contributes ${Math.round(pct("strategyContext"))}% of input.`, Number(sections.strategyContext?.tokens || 0) * 0.2);
  if (pct("conversationHistory") > 20) add("CONVERSATION_GROWTH", "Conversation history is a major input contributor.", Number(sections.conversationHistory?.tokens || 0) * 0.3);
  if (pct("structuredOutputSchema") + pct("jsonSchemas") > 15) add("SCHEMA_DOMINANT", "Structured schemas are a major input contributor.", Number(sections.structuredOutputSchema?.tokens || 0) * 0.2);
  if (record?.contextDiff?.repeatedTokens > 0) add("REPEATED_CONTEXT", `${record.contextDiff.repeatedTokens} estimated tokens were identical to the previous request.`, record.contextDiff.repeatedTokens);
  for (const key of record?.contextBreakdown?.unusedSections || []) add("UNUSED_CONTEXT", `${SECTION_LABELS[key] || key} was not detectably referenced by the response.`, Number(sections[key]?.tokens || 0) * 0.5);
  return recommendations;
}

module.exports = {
  TOKEN_SECTIONS,
  buildContextObservability,
  buildPricingConfig,
  buildResponseAnalysis,
  estimateDetailedCost,
  estimateTokens,
  generateOptimizationRecommendations,
  reconcileTokenCounts,
};
