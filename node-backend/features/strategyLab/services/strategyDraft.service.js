const path = require("node:path");

const strategyJsonContract = require(path.join(
  __dirname,
  "../../../../shared/strategyJson.contract.json"
));
const {
  buildNoEvidenceLimitation,
  normalizeEvidenceReferences,
} = require("./strategyCopilotEvidence.service");

const RULE_LEFT_LABELS = Object.freeze({
  CLOSE: "Close",
  VOLUME: "Volume",
  VOLUME_SMA_20: "SMA(Volume, 20)",
  BREAKOUT_LEVEL: "Breakout level",
  VOLATILITY_20: "Volatility(20)",
  EMA_FAST: "EMA({{emaFast}})",
  EMA_SLOW: "EMA({{emaSlow}})",
  RSI: "RSI(14)",
  MACD: "MACD",
  ATR: "ATR",
  MOMENTUM: "Momentum",
  PRICE_ABOVE_EMA: "Price above EMA",
  VOLATILITY_CONTROLLED: "Volatility controlled",
  VOLUME_SPIKE: "Volume spike",
  BREAKOUT: "Breakout",
  SIGNAL_STATE: "Signal state",
  HOLDING_PERIOD_DAYS: "Holding period days",
  STOP_LOSS: "Stop loss",
  TAKE_PROFIT: "Take profit",
  TRAILING_STOP: "ATR trailing stop",
  TIME_EXIT: "Time exit",
  SIGNAL_EXIT: "Signal exit",
});

const DEFAULT_REVIEW_STATUS = "UNSUPPORTED";
const REVIEW_STATUSES = new Set(["READY", "NEEDS_CLARIFICATION", "UNSUPPORTED"]);
const EXIT_RULE_KEYS = new Set([
  "STOP_LOSS",
  "TAKE_PROFIT",
  "TRAILING_STOP",
  "TIME_EXIT",
  "SIGNAL_EXIT",
]);
const RULE_LEFT_ALIASES = Object.freeze(
  Object.entries(RULE_LEFT_LABELS).reduce((acc, [key, label]) => {
    acc[normalizeRuleToken(key)] = key;
    acc[normalizeRuleToken(label)] = key;
    return acc;
  }, {})
);

function normalizeRuleToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toStringValue(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return String(fallback);
  }
  return String(value);
}

function toNumberString(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : String(fallback);
}

function normalizeConfidenceScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  if (parsed > 0 && parsed <= 1) {
    return Math.round(parsed * 100);
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function toBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function toStringList(value, fallback = []) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : fallback;
}

function resolveRuleLeftKey(left) {
  const raw = String(left || "").trim();
  const normalized = normalizeRuleToken(raw);
  if (RULE_LEFT_ALIASES[normalized]) {
    return RULE_LEFT_ALIASES[normalized];
  }

  if (normalized.includes("EMA")) {
    const periodMatch = raw.match(/(\d+)/);
    const period = periodMatch ? Number(periodMatch[1]) : null;
    if (normalized.includes("FAST") || (Number.isFinite(period) && period <= 20)) {
      return "EMA_FAST";
    }
    if (
      normalized.includes("SLOW") ||
      (Number.isFinite(period) && [50, 100, 200].includes(period))
    ) {
      return "EMA_SLOW";
    }
  }
  if (normalized.includes("RSI")) return "RSI";
  if (normalized.includes("MACD")) return "MACD";
  if (normalized.includes("ATR")) return "ATR";
  if (normalized.includes("VOLUME") && normalized.includes("SMA")) return "VOLUME_SMA_20";
  if (normalized === "VOLUME") return "VOLUME";
  if (normalized.includes("BREAKOUT_LEVEL") || normalized.includes("20_DAY_HIGH")) return "BREAKOUT_LEVEL";
  if (normalized.includes("BREAKOUT")) return "BREAKOUT";
  if (normalized.includes("VOLATILITY")) return "VOLATILITY_20";
  if (normalized.includes("PRICE_ABOVE_EMA")) return "PRICE_ABOVE_EMA";
  if (normalized.includes("VOLUME_SPIKE")) return "VOLUME_SPIKE";
  if (normalized.includes("MOMENTUM")) return "MOMENTUM";
  if (normalized.includes("CLOSE") || normalized === "PRICE") return "CLOSE";
  if (normalized.includes("HOLDING") || normalized.includes("TIME_EXIT")) return "HOLDING_PERIOD_DAYS";
  if (normalized.includes("SIGNAL")) return "SIGNAL_STATE";
  return null;
}

function mapRuleLeft(left, parameters) {
  const resolvedKey = resolveRuleLeftKey(left);
  const template = RULE_LEFT_LABELS[resolvedKey];
  if (!template) {
    throw new Error(`Unsupported strategy rule indicator: ${left}.`);
  }

  return template
    .replace("{{emaFast}}", String(parameters.emaFast))
    .replace("{{emaSlow}}", String(parameters.emaSlow));
}

function mapRuleRight(right, parameters) {
  if (right === undefined || right === null || right === "") {
    return "";
  }

  if (typeof right === "object" && !Array.isArray(right)) {
    if (right.kind === "indicator") {
      return mapRuleLeft(right.indicator, parameters);
    }
    if (Number.isFinite(Number(right.min)) && Number.isFinite(Number(right.max))) {
      return `${right.min} and ${right.max}`;
    }
  }

  return String(right);
}

function normalizeReviewStatus(value) {
  const status = String(value || DEFAULT_REVIEW_STATUS).trim().toUpperCase();
  return REVIEW_STATUSES.has(status) ? status : DEFAULT_REVIEW_STATUS;
}

function normalizeRule(rule = {}, parameters) {
  const resolvedLeftKey = resolveRuleLeftKey(rule.left);
  const normalizedGroup = EXIT_RULE_KEYS.has(resolvedLeftKey)
    ? "Exit"
    : String(rule.group || "Signal");

  return {
    id: String(rule.id || `ai-rule-${Math.random().toString(36).slice(2, 10)}`),
    group: normalizedGroup,
    operator: String(rule.operator || (normalizedGroup === "Exit" ? "THEN" : "AND")),
    left: mapRuleLeft(rule.left, parameters),
    comparator: String(rule.comparator || ">"),
    right: mapRuleRight(rule.right, parameters),
    connector: String(rule.connector || (normalizedGroup === "Exit" ? "MANAGE" : "AND")),
  };
}

function normalizeRegimeOverlays(overlays = {}) {
  if (!overlays || typeof overlays !== "object" || Array.isArray(overlays)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(overlays)
      .filter(([, config]) => config && typeof config === "object" && !Array.isArray(config))
      .map(([regime, config]) => [
        regime,
        Object.fromEntries(
          Object.entries(config)
            .filter(([, value]) => value !== undefined && value !== null && value !== "")
            .map(([key, value]) => [key, Number.isFinite(Number(value)) ? String(value) : value])
        ),
      ])
  );
}

function normalizeBuilderSettings(builderDraft = {}, prompt) {
  const parameters = {
    emaFast: toNumberString(builderDraft.emaFast, 20),
    emaSlow: toNumberString(builderDraft.emaSlow, 50),
  };

  return {
    objective: toStringValue(builderDraft.objective, "max_risk_adjusted_return"),
    template: toStringValue(builderDraft.template, "Custom"),
    universeType: toStringValue(builderDraft.universeType, "CUSTOM_SCREEN"),
    marketBias: toStringValue(builderDraft.marketBias, "US"),
    primaryTimeframe: toStringValue(builderDraft.primaryTimeframe, "1D"),
    entryTimeframe: toStringValue(builderDraft.entryTimeframe, "1D"),
    sizingMethod: toStringValue(builderDraft.sizingMethod, "risk_per_trade"),
    sizingPreviewCapital: toNumberString(builderDraft.sizingPreviewCapital, 50000),
    maxDrawdown: toNumberString(builderDraft.maxDrawdown, 12),
    maxPositionSize: toNumberString(builderDraft.maxPositionSize, 8),
    maxSectorExposure: toNumberString(builderDraft.maxSectorExposure, 30),
    maxDailyLoss: toNumberString(builderDraft.maxDailyLoss, 3),
    robustnessMode: false,
    capitalSimulation: toNumberString(builderDraft.capitalSimulation, builderDraft.sizingPreviewCapital || 50000),
    strategyPrompt: String(prompt || "").trim(),
    rules: (Array.isArray(builderDraft.rules) ? builderDraft.rules : []).map((rule) =>
      normalizeRule(rule, parameters)
    ),
    emaFast: parameters.emaFast,
    emaSlow: parameters.emaSlow,
    rsiThreshold: toNumberString(builderDraft.rsiThreshold, 55),
    atrStopMultiple: toNumberString(builderDraft.atrStopMultiple, 1.5),
    atrTakeProfitMultiple: toNumberString(builderDraft.atrTakeProfitMultiple, 8),
    trailingStopAtrMultiple: toNumberString(builderDraft.trailingStopAtrMultiple, 2),
    riskPerTrade: toNumberString(builderDraft.riskPerTrade, 0.01),
    signalThreshold: toNumberString(builderDraft.signalThreshold, 60),
    technicalWeight: toNumberString(builderDraft.technicalWeight, 0.45),
    regimeWeight: toNumberString(builderDraft.regimeWeight, 0.25),
    newsWeight: toNumberString(builderDraft.newsWeight, 0.15),
    openaiWeight: toNumberString(builderDraft.openaiWeight, 0.15),
    regimeFilter: toBoolean(builderDraft.regimeFilter, true),
    newsFilter: toBoolean(builderDraft.newsFilter, false),
    marketHoursOnly: toBoolean(builderDraft.marketHoursOnly, true),
    earningsFilter: toBoolean(builderDraft.earningsFilter, true),
    universeId: toStringValue(builderDraft.universeId, ""),
    universeName: toStringValue(builderDraft.universeName, ""),
    allowedSectors: toStringList(builderDraft.allowedSectors).join(", "),
    allowedRegimes: toStringList(builderDraft.allowedRegimes).join(", "),
    instrumentTypes: toStringList(builderDraft.instrumentTypes).join(", "),
    volatilityMin: toNumberString(builderDraft.volatilityMin, 0),
    volatilityMax: toNumberString(builderDraft.volatilityMax, 0.03),
    liquidityFloor: toNumberString(builderDraft.liquidityFloor, 1000000),
    holdingPeriodDays: toNumberString(builderDraft.holdingPeriodDays, 15),
    regimeOverlays: normalizeRegimeOverlays(builderDraft.regimeOverlays),
    allocationMatrix: {},
  };
}

function createEmptyDraftResponse(review, prompt) {
  const evidence = normalizeEvidenceReferences(review.evidence || [], []);
  return {
    generatedAt: new Date().toISOString(),
    prompt: String(prompt || ""),
    status: normalizeReviewStatus(review.status),
    canApprove: false,
    historicalContextUsed: review.historicalContextUsed,
    advisory: {
      summary: String(review.summary || review.description || ""),
      recommendation: String(review.recommendation || "Clarify the request before generating a strategy draft."),
      reasoning: Array.isArray(review.reasoning) ? review.reasoning.map(String) : [],
      evidence,
      confidenceScore: normalizeConfidenceScore(review.confidenceScore),
      limitations: [
        ...(Array.isArray(review.limitations) ? review.limitations.map(String) : []),
        ...buildNoEvidenceLimitation(evidence),
      ],
      nextAction: String(review.nextAction || "Refine the prompt with supported Strategy Lab logic."),
      reasoningBreakdown: review.reasoningBreakdown || {
        evidenceBackedStatements: [],
        inferences: [],
        suggestions: ["Refine the request using supported indicators and rules."],
        unknowns: ["Insufficient evidence available."],
      },
    },
    review: {
      title: String(review.title || "Unsupported strategy request"),
      description: String(review.description || ""),
      tradingStyle: String(review.tradingStyle || "Unspecified"),
      marketType: String(review.marketType || "US"),
      timeframe: review.timeframe || { primary: "1D", entry: "1D" },
      entryRules: toStringList(review.entryRules),
      exitRules: toStringList(review.exitRules),
      validationRules: toStringList(review.validationRules),
      riskRules: toStringList(review.riskRules),
      positionSizing: String(review.positionSizing || "Not available."),
      assumptions: toStringList(review.assumptions),
      potentialRisks: toStringList(review.potentialRisks),
      missingInformation: toStringList(review.missingInformation),
      unsupportedElements: toStringList(review.unsupportedElements),
      confidenceScore: normalizeConfidenceScore(review.confidenceScore),
      explanation: review.explanation || {
        summary: "The request could not be converted into a supported Strategy Lab draft.",
        indicatorRationale: [],
        entryRationale: [],
        exitRationale: [],
        strengths: [],
        weaknesses: [],
      },
    },
  };
}

function createStrategyDraftService({
  aiService,
  buildStrategyExperimentSettings,
  validateStrategyDsl,
}) {
  async function generateStrategyDraft(userId, request) {
    if (!aiService?.isConfigured?.()) {
      const error = new Error("AI strategy generation is not configured.");
      error.statusCode = 503;
      throw error;
    }

    const payload =
      request && typeof request === "object" && !Array.isArray(request)
        ? request
        : { prompt: String(request || "") };
    const prompt = String(payload.prompt || "");
    const review = await aiService.generateStrategyDraft(userId, payload);
    const status = normalizeReviewStatus(review.status);

    if (status !== "READY" || toStringList(review.unsupportedElements).length > 0) {
      return createEmptyDraftResponse({ ...review, status }, prompt);
    }

    const settings = normalizeBuilderSettings(review.builderDraft || {}, prompt);
    settings.rules = (Array.isArray(review.builderDraft?.rules) ? review.builderDraft.rules : []).map((rule) =>
      normalizeRule(rule, {
        emaFast: settings.emaFast,
        emaSlow: settings.emaSlow,
      })
    );

    if (settings.rules.length === 0) {
      throw new Error("Generated strategy draft did not include any executable rules.");
    }

    const compiledSettings = buildStrategyExperimentSettings({
      name: review.title,
      description: review.description,
      status: "DRAFT",
      settings,
    });

    validateStrategyDsl(compiledSettings.strategyJson);

    return {
      generatedAt: new Date().toISOString(),
      prompt: String(prompt || ""),
      status: "READY",
      canApprove: true,
      historicalContextUsed: review.historicalContextUsed,
      advisory: {
        summary: String(review.summary || review.description || ""),
        recommendation: String(review.recommendation || "Review the generated draft before saving it."),
        reasoning: Array.isArray(review.reasoning) ? review.reasoning.map(String) : [],
        evidence: normalizeEvidenceReferences(review.evidence || [], []),
        confidenceScore: normalizeConfidenceScore(review.confidenceScore),
        limitations: [
          ...(Array.isArray(review.limitations) ? review.limitations.map(String) : []),
          ...buildNoEvidenceLimitation([]),
        ],
        nextAction: String(review.nextAction || "Inspect the generated draft and approve it only if the assumptions fit your intent."),
        reasoningBreakdown: review.reasoningBreakdown || {
          evidenceBackedStatements: [],
          inferences: Array.isArray(review.assumptions) ? review.assumptions.map(String) : [],
          suggestions: ["Review the generated contract and assumptions before saving."],
          unknowns: ["Insufficient evidence available."],
        },
      },
      review: {
        title: String(review.title || "AI Strategy Draft"),
        description: String(review.description || ""),
        tradingStyle: String(review.tradingStyle || compiledSettings.template || "Custom"),
        marketType: String(review.marketType || compiledSettings.marketBias || "US"),
        timeframe: review.timeframe || {
          primary: compiledSettings.primaryTimeframe || "1D",
          entry: compiledSettings.entryTimeframe || "1D",
        },
        entryRules: toStringList(review.entryRules),
        exitRules: toStringList(review.exitRules),
        validationRules: toStringList(review.validationRules),
        riskRules: toStringList(review.riskRules),
        positionSizing: String(review.positionSizing || "Risk-based sizing."),
        assumptions: toStringList(review.assumptions),
        potentialRisks: toStringList(review.potentialRisks),
        missingInformation: toStringList(review.missingInformation),
        unsupportedElements: toStringList(review.unsupportedElements),
        confidenceScore: normalizeConfidenceScore(review.confidenceScore),
        explanation: review.explanation,
        historicalContextUsed: review.historicalContextUsed,
      },
      draft: {
        form: {
          name: String(review.title || "AI Strategy Draft"),
          description: String(review.description || ""),
          status: "DRAFT",
          settings: compiledSettings,
        },
        strategyJson: compiledSettings.strategyJson,
        dslValidation: compiledSettings.dslValidation,
        contractSchemaVersion: strategyJsonContract.schemaVersion,
      },
    };
  }

  return {
    generateStrategyDraft,
  };
}

module.exports = {
  createStrategyDraftService,
};
