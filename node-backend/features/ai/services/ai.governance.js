const crypto = require("node:crypto");

const DEFAULT_LIMITS = Object.freeze({
  dailyTokenLimitPerUser: 20_000,
  dailyCostLimitPerUser: 2,
  maxConcurrentRequestsPerUser: 2,
  maxConcurrentRequestsGlobal: 8,
  cacheMaxEntries: 250,
  inputCostPer1M: 0.25,
  outputCostPer1M: 2,
});

const FEATURE_BUDGET_ENV_KEYS = Object.freeze({
  analyzeStock: "ANALYZE_STOCK",
  analyzePortfolio: "ANALYZE_PORTFOLIO",
  portfolioCopilotOverview: "PORTFOLIO_COPILOT_OVERVIEW",
  portfolioCopilotQuestion: "PORTFOLIO_COPILOT_QUESTION",
  portfolioRecommendation: "PORTFOLIO_RECOMMENDATION",
  portfolioScenarioProposal: "PORTFOLIO_SCENARIO_PROPOSAL",
  portfolioScenarioInterpretation: "PORTFOLIO_SCENARIO_INTERPRETATION",
  portfolioProposalComparison: "PORTFOLIO_PROPOSAL_COMPARISON",
  marketResearchOverview: "MARKET_RESEARCH_OVERVIEW",
  symbolResearch: "SYMBOL_RESEARCH",
  sectorResearch: "SECTOR_RESEARCH",
  scannerResearchExplanation: "SCANNER_RESEARCH_EXPLANATION",
  watchlistResearchSummary: "WATCHLIST_RESEARCH_SUMMARY",
  upcomingEventsSummary: "UPCOMING_EVENTS_SUMMARY",
  deepResearch: "DEEP_RESEARCH", marketImpact: "MARKET_IMPACT", portfolioImpact: "PORTFOLIO_IMPACT",
  strategyImpact: "STRATEGY_IMPACT", matrixImpact: "MATRIX_IMPACT", scannerImpact: "SCANNER_IMPACT",
  comparisonResearch: "COMPARISON_RESEARCH", themeResearch: "THEME_RESEARCH", companyResearch: "COMPANY_RESEARCH",
  researchProjectReport: "RESEARCH_PROJECT_REPORT", researchProjectQuestion: "RESEARCH_PROJECT_QUESTION",
  researchThesisReview: "RESEARCH_THESIS_REVIEW", researchChangeAnalysis: "RESEARCH_CHANGE_ANALYSIS", researchProjectComparison: "RESEARCH_PROJECT_COMPARISON",
  matrixAudit: "MATRIX_AUDIT", matrixExplanation: "MATRIX_EXPLANATION", matrixReplayAnalysis: "MATRIX_REPLAY_ANALYSIS", matrixDeploymentAnalysis: "MATRIX_DEPLOYMENT_ANALYSIS", matrixAllocationAnalysis: "MATRIX_ALLOCATION_ANALYSIS", matrixCoverageAnalysis: "MATRIX_COVERAGE_ANALYSIS", matrixRiskAnalysis: "MATRIX_RISK_ANALYSIS", matrixQuestionAnswer: "MATRIX_QUESTION_ANSWER",
  matrixRecommendation: "MATRIX_RECOMMENDATION", matrixScenarioProposal: "MATRIX_SCENARIO_PROPOSAL", matrixScenarioInterpretation: "MATRIX_SCENARIO_INTERPRETATION", matrixAlternativeComparison: "MATRIX_ALTERNATIVE_COMPARISON",
  chat: "CHAT",
  explainScannerResult: "EXPLAIN_SCANNER_RESULT",
  newsReasoning: "NEWS_REASONING",
  reviewTrade: "REVIEW_TRADE",
  summarizeNews: "SUMMARIZE_NEWS",
  playbookRecommendation: "PLAYBOOK_RECOMMENDATION",
});

const DEFAULT_FEATURE_BUDGETS = Object.freeze({
  analyzeStock: { tokenLimit: 8_000, costLimit: 1 },
  analyzePortfolio: { tokenLimit: 8_000, costLimit: 1 },
  portfolioCopilotOverview: { tokenLimit: 8_000, costLimit: 1 },
  portfolioCopilotQuestion: { tokenLimit: 10_000, costLimit: 1 },
  portfolioRecommendation: { tokenLimit: 12_000, costLimit: 1.25 },
  portfolioScenarioProposal: { tokenLimit: 12_000, costLimit: 1.25 },
  portfolioScenarioInterpretation: { tokenLimit: 12_000, costLimit: 1.25 },
  portfolioProposalComparison: { tokenLimit: 14_000, costLimit: 1.5 },
  marketResearchOverview: { tokenLimit: 12_000, costLimit: 1.25 },
  symbolResearch: { tokenLimit: 12_000, costLimit: 1.25 },
  sectorResearch: { tokenLimit: 12_000, costLimit: 1.25 },
  scannerResearchExplanation: { tokenLimit: 10_000, costLimit: 1 },
  watchlistResearchSummary: { tokenLimit: 10_000, costLimit: 1 },
  upcomingEventsSummary: { tokenLimit: 10_000, costLimit: 1 },
  deepResearch: { tokenLimit: 18_000, costLimit: 2 }, marketImpact: { tokenLimit: 14_000, costLimit: 1.5 },
  portfolioImpact: { tokenLimit: 14_000, costLimit: 1.5 }, strategyImpact: { tokenLimit: 14_000, costLimit: 1.5 },
  matrixImpact: { tokenLimit: 14_000, costLimit: 1.5 }, scannerImpact: { tokenLimit: 12_000, costLimit: 1.25 },
  comparisonResearch: { tokenLimit: 18_000, costLimit: 2 }, themeResearch: { tokenLimit: 18_000, costLimit: 2 }, companyResearch: { tokenLimit: 18_000, costLimit: 2 },
  researchProjectReport: { tokenLimit: 18_000, costLimit: 2 }, researchProjectQuestion: { tokenLimit: 14_000, costLimit: 1.5 },
  researchThesisReview: { tokenLimit: 14_000, costLimit: 1.5 }, researchChangeAnalysis: { tokenLimit: 16_000, costLimit: 1.75 }, researchProjectComparison: { tokenLimit: 18_000, costLimit: 2 },
  matrixAudit: { tokenLimit: 14_000, costLimit: 1.5 }, matrixExplanation: { tokenLimit: 14_000, costLimit: 1.5 }, matrixReplayAnalysis: { tokenLimit: 14_000, costLimit: 1.5 }, matrixDeploymentAnalysis: { tokenLimit: 14_000, costLimit: 1.5 }, matrixAllocationAnalysis: { tokenLimit: 14_000, costLimit: 1.5 }, matrixCoverageAnalysis: { tokenLimit: 12_000, costLimit: 1.25 }, matrixRiskAnalysis: { tokenLimit: 14_000, costLimit: 1.5 }, matrixQuestionAnswer: { tokenLimit: 14_000, costLimit: 1.5 },
  matrixRecommendation: { tokenLimit: 16_000, costLimit: 1.75 }, matrixScenarioProposal: { tokenLimit: 16_000, costLimit: 1.75 }, matrixScenarioInterpretation: { tokenLimit: 18_000, costLimit: 2 }, matrixAlternativeComparison: { tokenLimit: 18_000, costLimit: 2 },
  chat: { tokenLimit: 10_000, costLimit: 1 },
  explainScannerResult: { tokenLimit: 8_000, costLimit: 1 },
  newsReasoning: { tokenLimit: 15_000, costLimit: 1.5 },
  reviewTrade: { tokenLimit: 8_000, costLimit: 1 },
  summarizeNews: { tokenLimit: 8_000, costLimit: 1 },
  playbookRecommendation: { tokenLimit: 8_000, costLimit: 1 },
});

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function buildFeatureBudgets(env = process.env) {
  const jsonBudgets = parseJsonObject(env.AI_FEATURE_DAILY_BUDGETS_JSON);
  const budgets = {};

  for (const [featureType, defaults] of Object.entries(DEFAULT_FEATURE_BUDGETS)) {
    const envKey = FEATURE_BUDGET_ENV_KEYS[featureType];
    const jsonBudget = jsonBudgets[featureType] || {};
    budgets[featureType] = {
      tokenLimit: toInteger(
        env[`AI_FEATURE_DAILY_TOKEN_LIMIT_${envKey}`],
        toInteger(jsonBudget.tokenLimit, defaults.tokenLimit)
      ),
      costLimit: toNumber(
        env[`AI_FEATURE_DAILY_COST_LIMIT_${envKey}`],
        toNumber(jsonBudget.costLimit, defaults.costLimit)
      ),
    };
  }

  return budgets;
}

function buildAiGovernanceConfig(env = process.env) {
  return {
    dailyTokenLimitPerUser: toInteger(
      env.AI_DAILY_TOKEN_LIMIT_PER_USER,
      DEFAULT_LIMITS.dailyTokenLimitPerUser
    ),
    dailyCostLimitPerUser: toNumber(
      env.AI_DAILY_COST_LIMIT_PER_USER,
      DEFAULT_LIMITS.dailyCostLimitPerUser
    ),
    maxConcurrentRequestsPerUser: toInteger(
      env.AI_MAX_CONCURRENT_REQUESTS_PER_USER,
      DEFAULT_LIMITS.maxConcurrentRequestsPerUser
    ),
    maxConcurrentRequestsGlobal: toInteger(
      env.AI_MAX_CONCURRENT_REQUESTS_GLOBAL,
      DEFAULT_LIMITS.maxConcurrentRequestsGlobal
    ),
    cacheMaxEntries: toInteger(env.AI_CACHE_MAX_ENTRIES, DEFAULT_LIMITS.cacheMaxEntries),
    inputCostPer1M: toNumber(
      env.AI_MODEL_INPUT_COST_PER_1M,
      DEFAULT_LIMITS.inputCostPer1M
    ),
    outputCostPer1M: toNumber(
      env.AI_MODEL_OUTPUT_COST_PER_1M,
      DEFAULT_LIMITS.outputCostPer1M
    ),
    modelPricing: parseJsonObject(env.AI_MODEL_PRICING_JSON),
    featureDailyBudgets: buildFeatureBudgets(env),
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function estimateOpenAiCostUsd(model, usage = {}, pricingConfig = {}) {
  const normalized = normalizeUsage(usage);
  const totalTokens = normalized.totalTokens || 0;
  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    return 0;
  }

  const modelPricing =
    pricingConfig.modelPricing?.[model] ||
    pricingConfig.modelPricing?.[String(model || "").toLowerCase()] ||
    {};
  const inputCostPer1M = toNumber(
    modelPricing.inputCostPer1M,
    toNumber(pricingConfig.inputCostPer1M, DEFAULT_LIMITS.inputCostPer1M)
  );
  const outputCostPer1M = toNumber(
    modelPricing.outputCostPer1M,
    toNumber(pricingConfig.outputCostPer1M, DEFAULT_LIMITS.outputCostPer1M)
  );
  const promptTokens = normalized.promptTokens || 0;
  const completionTokens = normalized.completionTokens || Math.max(0, totalTokens - promptTokens);
  const uncategorizedTokens = Math.max(0, totalTokens - promptTokens - completionTokens);
  const blendedFallback = (inputCostPer1M + outputCostPer1M) / 2;

  return Number(
    (
      (promptTokens / 1_000_000) * inputCostPer1M +
      (completionTokens / 1_000_000) * outputCostPer1M +
      (uncategorizedTokens / 1_000_000) * blendedFallback
    ).toFixed(6)
  );
}

function normalizeUsage(usage = {}) {
  return {
    promptTokens:
      Number(usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokens) || null,
    completionTokens:
      Number(usage.output_tokens ?? usage.completion_tokens ?? usage.completionTokens) || null,
    totalTokens: Number(usage.total_tokens ?? usage.totalTokens) || null,
    cachedTokens:
      Number(
        usage.cached_tokens ??
        usage.cachedTokens ??
        usage.input_tokens_details?.cached_tokens ??
        usage.prompt_tokens_details?.cached_tokens
      ) || 0,
    reasoningTokens:
      Number(
        usage.reasoning_tokens ??
        usage.reasoningTokens ??
        usage.output_tokens_details?.reasoning_tokens ??
        usage.completion_tokens_details?.reasoning_tokens
      ) || 0,
  };
}

function createBoundedCache({ maxEntries = DEFAULT_LIMITS.cacheMaxEntries, now = () => Date.now() } = {}) {
  const entries = new Map();
  let hits = 0;
  let misses = 0;
  let evictions = 0;
  const byFeature = new Map();

  function featureStats(featureType) {
    const key = featureType || "unknown";
    if (!byFeature.has(key)) {
      byFeature.set(key, { hits: 0, misses: 0, evictions: 0 });
    }
    return byFeature.get(key);
  }

  function get(key, featureType = "unknown") {
    const entry = entries.get(key);
    if (!entry || entry.expiresAt <= now()) {
      if (entry) entries.delete(key);
      misses += 1;
      featureStats(featureType).misses += 1;
      return null;
    }
    entries.delete(key);
    entries.set(key, entry);
    hits += 1;
    featureStats(featureType).hits += 1;
    return entry.value;
  }

  function set(key, value, ttlMs, featureType = "unknown") {
    if (!ttlMs || ttlMs <= 0) return;
    entries.set(key, {
      value,
      expiresAt: now() + ttlMs,
    });
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      const oldestFeature = entries.get(oldestKey)?.featureType || "unknown";
      entries.delete(oldestKey);
      evictions += 1;
      featureStats(oldestFeature).evictions += 1;
    }
    entries.get(key).featureType = featureType;
  }

  return {
    get,
    set,
    snapshot() {
      return {
        entries: entries.size,
        maxEntries,
        hits,
        misses,
        evictions,
        hitRate: hits + misses > 0 ? hits / (hits + misses) : 0,
        byFeature: Object.fromEntries(
          [...byFeature.entries()].map(([featureType, stats]) => [
            featureType,
            {
              ...stats,
              hitRate:
                stats.hits + stats.misses > 0
                  ? stats.hits / (stats.hits + stats.misses)
                  : 0,
            },
          ])
        ),
      };
    },
  };
}

function createConcurrencyGate({ maxGlobal, maxPerUser }) {
  let globalActive = 0;
  const perUser = new Map();

  function acquire(userId) {
    const key = userId || "anonymous";
    const activeForUser = perUser.get(key) || 0;
    if (globalActive >= maxGlobal || activeForUser >= maxPerUser) {
      const error = new Error("AI concurrency limit reached. Please try again shortly.");
      error.statusCode = 429;
      error.code = "AI_CONCURRENCY_LIMIT";
      throw error;
    }

    globalActive += 1;
    perUser.set(key, activeForUser + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      globalActive = Math.max(0, globalActive - 1);
      const nextUserCount = Math.max(0, (perUser.get(key) || 1) - 1);
      if (nextUserCount > 0) perUser.set(key, nextUserCount);
      else perUser.delete(key);
    };
  }

  return {
    acquire,
    snapshot() {
      return {
        globalActive,
        maxGlobal,
        maxPerUser,
        users: Object.fromEntries(perUser.entries()),
      };
    },
  };
}

module.exports = {
  buildAiGovernanceConfig,
  createBoundedCache,
  createConcurrencyGate,
  estimateOpenAiCostUsd,
  buildFeatureBudgets,
  normalizeUsage,
  sha256,
  stableStringify,
};
