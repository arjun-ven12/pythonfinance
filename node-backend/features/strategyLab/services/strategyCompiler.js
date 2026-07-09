const {
  strategyJsonContract,
  validateStrategyDsl,
} = require("./strategyDslValidator");

const TEMPLATE_HYPOTHESES = {
  Momentum: "Trend and momentum persistence can identify higher-probability continuation trades.",
  "Trend Following": "Sustained trend alignment can outperform in constructive market regimes.",
  "Mean Reversion": "Oversold pullbacks inside constructive trends can revert before trend damage occurs.",
  Breakout: "Price and volume expansion after compression can reveal institutional demand.",
  Value: "Lower-frequency trend confirmation can support longer horizon value-style entries.",
  "News Driven": "Technical candidates become safer when event risk and news context are favorable.",
  "Volatility Expansion": "Volatility expansion after compression can create asymmetric opportunities.",
  Pairs: "Relative dislocation can revert when correlation and spread behavior remain stable.",
};

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIndicator(raw = "") {
  const value = String(raw).trim().toUpperCase();
  if (!value) {
    throw new Error("Rule indicator is required.");
  }
  if (value.includes("EMA") && (value.includes("FAST") || value.includes("20"))) return "EMA_FAST";
  if (value.includes("EMA") && (value.includes("SLOW") || value.includes("50") || value.includes("100") || value.includes("200"))) return "EMA_SLOW";
  if (value.includes("RSI")) return "RSI";
  if (value.includes("MACD")) return "MACD";
  if (value.includes("ATR")) return "ATR";
  if (value.includes("VOLUME") && value.includes("SMA")) return "VOLUME_SMA_20";
  if (value === "VOLUME") return "VOLUME";
  if (value.includes("20-DAY HIGH") || value.includes("BREAKOUT LEVEL")) return "BREAKOUT_LEVEL";
  if (value.includes("BREAKOUT")) return "BREAKOUT";
  if (value.includes("VOLATILITY")) return "VOLATILITY_20";
  if (value.includes("PRICE ABOVE EMA")) return "PRICE_ABOVE_EMA";
  if (value.includes("VOLUME SPIKE")) return "VOLUME_SPIKE";
  if (value.includes("MOMENTUM")) return "MOMENTUM";
  if (value.includes("CLOSE") || value === "PRICE") return "CLOSE";
  if (value.includes("HOLDING") || value.includes("TIME EXIT")) return "HOLDING_PERIOD_DAYS";
  if (value.includes("SIGNAL")) return "SIGNAL_STATE";
  throw new Error(`Unsupported rule indicator: ${raw}.`);
}

function normalizeComparator(raw = "") {
  const value = String(raw).trim().toUpperCase();
  if (value.includes("BETWEEN")) return "BETWEEN";
  if (value.includes("CROSS") && value.includes("BELOW")) return "CROSSES_BELOW";
  if (value.includes("CROSS")) return "CROSSES_ABOVE";
  if (value.includes("TRAIL")) return "TRAILING_STOP_ATR";
  if (value.includes("TAKE") && value.includes("PROFIT")) return "TAKE_PROFIT_ATR";
  if (value.includes("STOP")) return "STOP_LOSS_ATR";
  if ([">", ">=", "<", "<=", "==", "!="].includes(value)) return value;
  if (value.includes("TRUE")) return "IS_TRUE";
  if (value.includes("<")) return "<";
  if (value.includes(">")) return ">";
  if (value.includes("=")) return "==";
  throw new Error(`Unsupported rule comparator: ${raw}.`);
}

function parseRangeValue(value, fallback = null) {
  const matches = String(value || "").match(/-?\d+(\.\d+)?/g) || [];
  if (matches.length >= 2) {
    return {
      min: Number(matches[0]),
      max: Number(matches[1]),
    };
  }
  return fallback;
}

function parseRuleValue(value, comparator, fallback = null) {
  const normalizedComparator = String(comparator || "").toUpperCase();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (normalizedComparator === "BETWEEN") {
    return parseRangeValue(value, fallback);
  }
  if (normalizedComparator === "IS_TRUE") {
    return true;
  }
  if (normalizedComparator === "==") {
    const normalizedValue = String(value || "").trim().toUpperCase();
    if (["BUY", "SELL", "HOLD"].includes(normalizedValue)) {
      return normalizedValue;
    }
  }
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return fallback;
  }
  try {
    return {
      kind: "indicator",
      indicator: normalizeIndicator(rawValue),
    };
  } catch (_error) {
    const match = rawValue.match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : fallback;
  }
}

function parseCsvList(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOverlayConfig(config, fallback = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return fallback;
  }

  const normalized = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    normalized[key] = typeof value === "string" ? toNumber(value, value) : value;
  }

  return normalized;
}

function parseJsonObject(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

function parseRegimeOverlays(value, fallback = {}) {
  const parsed = parseJsonObject(value, fallback);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fallback;
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([, config]) => config && typeof config === "object" && !Array.isArray(config))
      .map(([regime, config]) => [regime, normalizeOverlayConfig(config, {})])
  );
}

function compileExitRule(rule = {}) {
  const left = String(rule.left || rule.indicator || "").trim();
  const leftUpper = left.toUpperCase();
  const right = rule.right ?? rule.value ?? "";
  if (leftUpper.includes("TRAIL")) {
    return { indicator: "ATR", comparator: "TRAILING_STOP_ATR", value: parseRuleValue(right, "TRAILING_STOP_ATR", 2) };
  }
  if (leftUpper.includes("TAKE") && leftUpper.includes("PROFIT")) {
    return { indicator: "ATR", comparator: "TAKE_PROFIT_ATR", value: parseRuleValue(right, "TAKE_PROFIT_ATR", 8) };
  }
  if (leftUpper.includes("STOP")) {
    return { indicator: "ATR", comparator: "STOP_LOSS_ATR", value: parseRuleValue(right, "STOP_LOSS_ATR", 1.5) };
  }
  if (leftUpper.includes("TIME")) {
    return { indicator: "HOLDING_PERIOD_DAYS", comparator: ">=", value: parseRuleValue(right, ">=", 15) };
  }
  if (leftUpper.includes("SIGNAL")) {
    return { indicator: "SIGNAL_STATE", comparator: "==", value: "SELL" };
  }
  return null;
}

function compileRuleBlock(rule = {}, context = {}) {
  const connector = String(rule.connector || rule.operator || "AND").toUpperCase();
  if (connector === "NOT" && !Array.isArray(rule.children)) {
    return {
      operator: "NOT",
      children: [compileRuleBlock({ ...rule, operator: "AND", connector: "AND" }, context)],
    };
  }
  if (["AND", "OR", "NOT", "GROUP"].includes(connector) && Array.isArray(rule.children)) {
    return {
      operator: connector,
      children: rule.children.map((child) => compileRuleBlock(child, context)),
    };
  }

  if (context.group === "Exit") {
    const exitRule = compileExitRule(rule);
    if (exitRule) {
      return {
        ...exitRule,
        raw: {
          group: rule.group || "Exit",
          left: rule.left || rule.indicator || "",
          comparator: rule.comparator || "=",
          right: rule.right ?? rule.value ?? "",
          connector: rule.connector || "MANAGE",
        },
      };
    }
  }

  const comparator = normalizeComparator(rule.comparator);

  return {
    indicator: normalizeIndicator(rule.left || rule.indicator),
    comparator,
    value: parseRuleValue(rule.right ?? rule.value, comparator, null),
    raw: {
      group: rule.group || "Signal",
      left: rule.left || rule.indicator || "",
      comparator: rule.comparator || ">",
      right: rule.right ?? rule.value ?? "",
      connector: rule.connector || "AND",
    },
  };
}

function combineRules(rules = []) {
  const compiled = rules.map((rule) => compileRuleBlock(rule, { group: rule.group }));
  if (compiled.length === 1) return compiled[0];
  return { operator: "AND", children: compiled };
}

function compileStrategySettings(settings = {}, metadata = {}) {
  const rules = Array.isArray(settings.rules) && settings.rules.length > 0
    ? settings.rules
    : [
        { group: "Signal", left: "EMA(20)", comparator: ">", right: "EMA(50)", connector: "AND" },
        { group: "Entry", left: "RSI(14)", comparator: "<", right: settings.rsiThreshold || 65, connector: "AND" },
      ];
  const entryRules = rules.filter((rule) => ["Market", "Signal", "Entry", "Validation", undefined].includes(rule.group));
  const exitRules = rules.filter((rule) => rule.group === "Exit");
  const riskRules = rules.filter((rule) => rule.group === "Risk");

  const designNotes = Object.entries(strategyJsonContract.builderControls)
    .filter(([field, control]) => control.executable === false && settings[field] !== undefined)
    .map(([field, control]) => ({
      field,
      path: control.path,
      label: control.label,
      value: settings[field],
    }));

  const strategyJson = {
    schemaVersion: strategyJsonContract.schemaVersion,
    metadata: {
      template: settings.template || "Momentum",
      objective: settings.objective || "max_risk_adjusted_return",
      compiler: "strategyCompiler.js",
      generatedAt: new Date(0).toISOString(),
      designNotes,
    },
    executable: {
      universe: {
        type: settings.universeType || "SINGLE",
        universeId: settings.universeId || "",
        universeName: settings.universeName || "",
        market: settings.marketBias || "US_AND_SGX",
      },
      timeframe: {
        primary: settings.primaryTimeframe || "1D",
        entry: settings.entryTimeframe || "1H",
      },
      entryRules: [combineRules(entryRules.length ? entryRules : rules)],
      exitRules: (exitRules.length ? exitRules : [
        { group: "Exit", left: "Stop loss", comparator: "=", right: settings.atrStopMultiple || 1.5, connector: "MANAGE" },
        { group: "Exit", left: "Take profit", comparator: "=", right: settings.atrTakeProfitMultiple || 8, connector: "MANAGE" },
        { group: "Exit", left: "ATR trailing stop", comparator: "=", right: settings.trailingStopAtrMultiple || 2, connector: "MANAGE" },
        { group: "Exit", left: "Signal exit", comparator: "=", right: "SELL", connector: "MANAGE" },
      ]).map((rule) => compileRuleBlock(rule, { group: "Exit" })),
      positionSizing: {
        method: settings.sizingMethod || "risk_per_trade",
        riskPerTrade: toNumber(settings.riskPerTrade, 0.01),
        previewCapital: toNumber(settings.sizingPreviewCapital, 50000),
      },
      riskRules: riskRules.map((rule) => compileRuleBlock(rule, { group: "Risk" })),
      filters: {
        marketRegime: Boolean(settings.regimeFilter),
        news: Boolean(settings.newsFilter),
        earnings: Boolean(settings.earningsFilter),
        marketHoursOnly: Boolean(settings.marketHoursOnly),
      },
      execution: {
        entryTiming: settings.entryTiming || "next_bar",
        confirmation: settings.closeConfirmation !== false ? "close_confirmation" : "none",
        scaleIn: Boolean(settings.scaleIn),
        scaleOut: Boolean(settings.scaleOut),
      },
      validation: {
        minimumTrades: toNumber(settings.minimumTrades, 30),
        minimumExpectancy: toNumber(settings.minimumExpectancy, 0),
        maxDrawdown: toNumber(settings.maxDrawdown, 12),
        sharpeFloor: toNumber(settings.sharpeFloor, 1),
        maxPositionSize: toNumber(settings.maxPositionSize, 8),
        maxSectorExposure: toNumber(settings.maxSectorExposure, 30),
        maxDailyLoss: toNumber(settings.maxDailyLoss, 3),
      },
      parameters: {
        emaFast: toNumber(settings.emaFast, 20),
        emaSlow: toNumber(settings.emaSlow, 50),
        rsiThreshold: toNumber(settings.rsiThreshold, 55),
        atrStopMultiple: toNumber(settings.atrStopMultiple, 1.5),
        atrTakeProfitMultiple: toNumber(settings.atrTakeProfitMultiple, 8),
        trailingStopAtrMultiple: toNumber(settings.trailingStopAtrMultiple, 2),
        signalThreshold: toNumber(settings.signalThreshold, 60),
      },
      weights: {
        technical: toNumber(settings.technicalWeight, 0.45),
        regime: toNumber(settings.regimeWeight, 0.25),
        news: toNumber(settings.newsWeight, 0.15),
        openai: toNumber(settings.openaiWeight, 0.15),
      },
      envelope: {
        sectors: parseCsvList(settings.allowedSectors),
        regimes: parseCsvList(settings.allowedRegimes),
        instrumentTypes: parseCsvList(settings.instrumentTypes),
        volBand: {
          min: toNumber(settings.volatilityMin, 0),
          max: toNumber(settings.volatilityMax, 0.03),
        },
        liquidityFloor: toNumber(settings.liquidityFloor, 1000000),
        holdingPeriodDays: toNumber(settings.holdingPeriodDays, 15),
      },
      regimeOverlays: parseRegimeOverlays(settings.regimeOverlays, {}),
      allocationMatrix: parseJsonObject(settings.allocationMatrix, {}),
    },
    research: {
      hypothesis: settings.hypothesis || TEMPLATE_HYPOTHESES[settings.template] || TEMPLATE_HYPOTHESES.Momentum,
      rationale: settings.rationale || metadata.description || "",
      notes: settings.strategyPrompt || "",
      designNotes: Object.fromEntries(designNotes.map((note) => [note.field, note.value])),
      assumptions: [
        "Signals execute no earlier than the next bar.",
        "OpenAI/news layers may adjust confidence but do not generate BUY/SELL signals.",
        "Promotion requires evidence gates.",
      ],
    },
    evidence: {
      robustness: settings.robustness || (settings.robustnessMode ? { requested: true } : null),
      confidence: settings.confidenceEvidence || null,
      validation: settings.validationEvidence || null,
      deploymentScore: settings.deploymentScore || null,
    },
  };

  const validation = validateStrategyDsl(strategyJson);
  return { strategyJson, validation };
}

module.exports = {
  compileStrategySettings,
};
