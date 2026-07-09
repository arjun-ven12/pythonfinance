import { z } from "zod";
import strategyJsonContract from "../../../../../shared/strategyJson.contract.json";

const allowed = strategyJsonContract.allowed;

const stringIn = (values, label) =>
  z.string().refine((value) => values.includes(value), {
    message: `${label} is unsupported.`,
  });

const indicatorReferenceSchema = z.object({
  kind: z.literal("indicator"),
  indicator: stringIn(allowed.indicators, "Rule value indicator"),
});

const ruleSchema = z.lazy(() =>
  z.union([
    z.object({
      operator: stringIn(allowed.logicalOperators, "Rule operator"),
      children: z.array(ruleSchema).min(1),
    }),
    z.object({
      indicator: stringIn(allowed.indicators, "Rule indicator"),
      comparator: stringIn(allowed.comparators, "Rule comparator"),
      value: z.union([
        z.number(),
        z.string(),
        z.boolean(),
        z.null(),
        indicatorReferenceSchema,
        z.object({
          min: z.number(),
          max: z.number(),
        }),
      ]).optional(),
      raw: z.record(z.string(), z.unknown()).optional(),
    }),
  ])
);

const regimeOverlaySchema = z.record(
  stringIn(allowed.regimes, "Regime"),
  z.object({
    emaFast: z.number().optional(),
    emaSlow: z.number().optional(),
    rsiThreshold: z.number().optional(),
    atrStopMultiple: z.number().optional(),
    atrTakeProfitMultiple: z.number().optional(),
    trailingStopAtrMultiple: z.number().optional(),
    riskPerTrade: z.number().optional(),
    signalThreshold: z.number().optional(),
  })
);

export const strategyJsonZodSchema = z.object({
  schemaVersion: z.literal(strategyJsonContract.schemaVersion),
  metadata: z.object({
    template: z.string(),
    objective: z.string().optional(),
    compiler: z.string(),
    generatedAt: z.string(),
    designNotes: z.array(z.object({
      field: z.string(),
      path: z.string(),
      label: z.string().optional(),
      value: z.unknown(),
    })),
    builderState: z.unknown().optional(),
  }),
  executable: z.object({
    universe: z.object({
      type: stringIn(allowed.universeTypes, "Universe type"),
      universeId: z.string(),
      universeName: z.string(),
      market: stringIn(allowed.markets, "Market"),
    }),
    timeframe: z.object({
      primary: stringIn(allowed.timeframes, "Primary timeframe"),
      entry: stringIn(allowed.timeframes, "Entry timeframe"),
    }),
    entryRules: z.array(ruleSchema).min(1),
    exitRules: z.array(ruleSchema),
    positionSizing: z.object({
      method: stringIn(allowed.sizingMethods, "Sizing method"),
      riskPerTrade: z.number(),
      previewCapital: z.number(),
    }),
    riskRules: z.array(ruleSchema),
    filters: z.object({
      marketRegime: z.boolean(),
      news: z.boolean(),
      earnings: z.boolean(),
      marketHoursOnly: z.boolean(),
    }),
    execution: z.object({
      entryTiming: stringIn(allowed.entryTiming, "Entry timing"),
      confirmation: stringIn(allowed.confirmation, "Confirmation"),
      scaleIn: z.boolean(),
      scaleOut: z.boolean(),
    }),
    validation: z.object({
      minimumTrades: z.number(),
      minimumExpectancy: z.number(),
      maxDrawdown: z.number(),
      sharpeFloor: z.number(),
      maxPositionSize: z.number(),
      maxSectorExposure: z.number(),
      maxDailyLoss: z.number(),
    }),
    parameters: z.object({
      emaFast: z.number(),
      emaSlow: z.number(),
      rsiThreshold: z.number(),
      atrStopMultiple: z.number(),
      atrTakeProfitMultiple: z.number(),
      trailingStopAtrMultiple: z.number(),
      signalThreshold: z.number(),
    }),
    weights: z.object({
      technical: z.number(),
      regime: z.number(),
      news: z.number(),
      openai: z.number(),
    }),
    envelope: z.object({
      sectors: z.array(z.string()),
      regimes: z.array(stringIn(allowed.regimes, "Envelope regime")),
      instrumentTypes: z.array(stringIn(allowed.instrumentTypes, "Instrument type")),
      volBand: z.object({
        min: z.number(),
        max: z.number(),
      }),
      liquidityFloor: z.number(),
      holdingPeriodDays: z.number(),
    }),
    regimeOverlays: regimeOverlaySchema,
    allocationMatrix: z.record(z.string(), z.unknown()).optional(),
  }),
  research: z.object({
    hypothesis: z.string(),
    rationale: z.string(),
    notes: z.string(),
    designNotes: z.record(z.string(), z.unknown()),
    assumptions: z.array(z.string()),
  }),
  evidence: z.object({
    robustness: z.unknown().nullable(),
    confidence: z.unknown().nullable(),
    validation: z.unknown().nullable(),
    deploymentScore: z.unknown().nullable(),
  }),
});

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIndicator(raw = "") {
  const value = String(raw).trim().toUpperCase();
  if (!value) throw new Error("Rule indicator is required.");
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

function parseRegimeOverlays(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, config]) => config && typeof config === "object" && !Array.isArray(config))
        .map(([regime, config]) => [regime, normalizeOverlayConfig(config, {})])
    );
  }

  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fallback;
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, config]) => config && typeof config === "object" && !Array.isArray(config))
        .map(([regime, config]) => [regime, normalizeOverlayConfig(config, {})])
    );
  } catch {
    return fallback;
  }
}

function parseAllocationMatrix(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseRuleValue(value, comparator, fallback = null) {
  const normalizedComparator = String(comparator || "").toUpperCase();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (normalizedComparator === "BETWEEN") {
    return parseRangeValue(value, fallback);
  }
  if (normalizedComparator === "IS_TRUE") return true;
  if (normalizedComparator === "==") {
    const normalizedValue = String(value || "").trim().toUpperCase();
    if (["BUY", "SELL", "HOLD"].includes(normalizedValue)) return normalizedValue;
  }
  const rawValue = String(value || "").trim();
  if (!rawValue) return fallback;
  try {
    return { kind: "indicator", indicator: normalizeIndicator(rawValue) };
  } catch {
    const match = rawValue.match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : fallback;
  }
}

function compileExitRule(rule = {}) {
  const left = String(rule.left || rule.indicator || "").trim();
  const leftUpper = left.toUpperCase();
  const right = rule.right ?? rule.value ?? "";
  if (leftUpper.includes("TRAIL")) return { indicator: "ATR", comparator: "TRAILING_STOP_ATR", value: parseRuleValue(right, "TRAILING_STOP_ATR", 2) };
  if (leftUpper.includes("TAKE") && leftUpper.includes("PROFIT")) return { indicator: "ATR", comparator: "TAKE_PROFIT_ATR", value: parseRuleValue(right, "TAKE_PROFIT_ATR", 8) };
  if (leftUpper.includes("STOP")) return { indicator: "ATR", comparator: "STOP_LOSS_ATR", value: parseRuleValue(right, "STOP_LOSS_ATR", 1.5) };
  if (leftUpper.includes("TIME")) return { indicator: "HOLDING_PERIOD_DAYS", comparator: ">=", value: parseRuleValue(right, ">=", 15) };
  if (leftUpper.includes("SIGNAL")) return { indicator: "SIGNAL_STATE", comparator: "==", value: "SELL" };
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

const defaultRules = (settings) => [
  { group: "Signal", left: "EMA(20)", comparator: ">", right: "EMA(50)", connector: "AND" },
  { group: "Entry", left: "RSI(14)", comparator: "<", right: settings.rsiThreshold || 65, connector: "AND" },
];

export function normalizeStrategyBuilderState(form) {
  const settings = form.settings || {};
  return {
    name: String(form.name || ""),
    description: String(form.description || ""),
    status: String(form.status || "DRAFT"),
    settings: {
      objective: settings.objective || "max_risk_adjusted_return",
      template: settings.template || "Momentum",
      universeType: settings.universeType || "SINGLE",
      marketBias: settings.marketBias || "US_AND_SGX",
      primaryTimeframe: settings.primaryTimeframe || "1D",
      entryTimeframe: settings.entryTimeframe || "1H",
      sizingMethod: settings.sizingMethod || "risk_per_trade",
      sizingPreviewCapital: String(settings.sizingPreviewCapital ?? "50000"),
      maxDrawdown: String(settings.maxDrawdown ?? "12"),
      maxPositionSize: String(settings.maxPositionSize ?? "8"),
      maxSectorExposure: String(settings.maxSectorExposure ?? "30"),
      maxDailyLoss: String(settings.maxDailyLoss ?? "3"),
      robustnessMode: Boolean(settings.robustnessMode),
      capitalSimulation: String(settings.capitalSimulation ?? "50000"),
      strategyPrompt: String(settings.strategyPrompt || ""),
      rules: Array.isArray(settings.rules) ? settings.rules.map((rule) => ({ ...rule })) : [],
      emaFast: String(settings.emaFast ?? "20"),
      emaSlow: String(settings.emaSlow ?? "50"),
      rsiThreshold: String(settings.rsiThreshold ?? "55"),
      atrStopMultiple: String(settings.atrStopMultiple ?? "1.5"),
      atrTakeProfitMultiple: String(settings.atrTakeProfitMultiple ?? "8"),
      trailingStopAtrMultiple: String(settings.trailingStopAtrMultiple ?? "2"),
      riskPerTrade: String(settings.riskPerTrade ?? "0.01"),
      signalThreshold: String(settings.signalThreshold ?? "60"),
      technicalWeight: String(settings.technicalWeight ?? "0.45"),
      regimeWeight: String(settings.regimeWeight ?? "0.25"),
      newsWeight: String(settings.newsWeight ?? "0.15"),
      openaiWeight: String(settings.openaiWeight ?? "0.15"),
      regimeFilter: Boolean(settings.regimeFilter),
      newsFilter: Boolean(settings.newsFilter),
      marketHoursOnly: Boolean(settings.marketHoursOnly),
      earningsFilter: Boolean(settings.earningsFilter),
      universeId: String(settings.universeId || ""),
      universeName: String(settings.universeName || ""),
      allowedSectors: String(settings.allowedSectors || ""),
      allowedRegimes: String(settings.allowedRegimes || ""),
      instrumentTypes: String(settings.instrumentTypes || ""),
      volatilityMin: String(settings.volatilityMin ?? "0"),
      volatilityMax: String(settings.volatilityMax ?? "0.03"),
      liquidityFloor: String(settings.liquidityFloor ?? "1000000"),
      holdingPeriodDays: String(settings.holdingPeriodDays ?? "15"),
      regimeOverlays: parseRegimeOverlays(settings.regimeOverlays, {}),
      allocationMatrix: parseAllocationMatrix(settings.allocationMatrix, {}),
    },
  };
}

export function serializeStrategyBuilderState(form) {
  const state = normalizeStrategyBuilderState(form);
  const settings = state.settings;
  const rules = settings.rules.length > 0 ? settings.rules : defaultRules(settings);
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
      template: settings.template,
      objective: settings.objective,
      compiler: "frontend.strategyJsonContract",
      generatedAt: new Date(0).toISOString(),
      designNotes,
      builderState: state,
    },
    executable: {
      universe: {
        type: settings.universeType,
        universeId: settings.universeId,
        universeName: settings.universeName,
        market: settings.marketBias,
      },
      timeframe: {
        primary: settings.primaryTimeframe,
        entry: settings.entryTimeframe,
      },
      entryRules: [combineRules(entryRules.length ? entryRules : rules)],
      exitRules: (exitRules.length ? exitRules : [
        { group: "Exit", left: "Stop loss", comparator: "=", right: settings.atrStopMultiple || 1.5, connector: "MANAGE" },
        { group: "Exit", left: "Take profit", comparator: "=", right: settings.atrTakeProfitMultiple || 8, connector: "MANAGE" },
        { group: "Exit", left: "ATR trailing stop", comparator: "=", right: settings.trailingStopAtrMultiple || 2, connector: "MANAGE" },
        { group: "Exit", left: "Signal exit", comparator: "=", right: "SELL", connector: "MANAGE" },
      ]).map((rule) => compileRuleBlock(rule, { group: "Exit" })),
      positionSizing: {
        method: settings.sizingMethod,
        riskPerTrade: toNumber(settings.riskPerTrade, 0.01),
        previewCapital: toNumber(settings.sizingPreviewCapital, 50000),
      },
      riskRules: riskRules.map((rule) => compileRuleBlock(rule, { group: "Risk" })),
      filters: {
        marketRegime: settings.regimeFilter,
        news: settings.newsFilter,
        earnings: settings.earningsFilter,
        marketHoursOnly: settings.marketHoursOnly,
      },
      execution: {
        entryTiming: "next_bar",
        confirmation: "close_confirmation",
        scaleIn: false,
        scaleOut: false,
      },
      validation: {
        minimumTrades: 30,
        minimumExpectancy: 0,
        maxDrawdown: toNumber(settings.maxDrawdown, 12),
        sharpeFloor: 1,
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
      allocationMatrix: parseAllocationMatrix(settings.allocationMatrix, {}),
    },
    research: {
      hypothesis: `${settings.template} strategy hypothesis`,
      rationale: state.description,
      notes: settings.strategyPrompt,
      designNotes: Object.fromEntries(designNotes.map((note) => [note.field, note.value])),
      assumptions: [
        "Signals execute no earlier than the next bar.",
        "OpenAI/news layers may adjust confidence but do not generate BUY/SELL signals.",
        "Promotion requires evidence gates.",
      ],
    },
    evidence: {
      robustness: settings.robustnessMode ? { requested: true } : null,
      confidence: null,
      validation: null,
      deploymentScore: null,
    },
  };

  return strategyJsonZodSchema.parse(strategyJson);
}

export function hydrateStrategyBuilderState(strategyJson) {
  const parsed = strategyJsonZodSchema.parse(strategyJson);
  if (parsed.metadata.builderState) {
    return normalizeStrategyBuilderState(parsed.metadata.builderState);
  }

  const executable = parsed.executable;
  const designNotes = parsed.research.designNotes || {};
  return normalizeStrategyBuilderState({
    name: "",
    description: parsed.research.rationale || "",
    status: "DRAFT",
    settings: {
      template: parsed.metadata.template,
      objective: parsed.metadata.objective || designNotes.objective || "max_risk_adjusted_return",
      universeType: executable.universe.type,
      marketBias: executable.universe.market,
      primaryTimeframe: executable.timeframe.primary,
      entryTimeframe: executable.timeframe.entry,
      sizingMethod: executable.positionSizing.method,
      sizingPreviewCapital: String(executable.positionSizing.previewCapital),
      maxDrawdown: String(executable.validation.maxDrawdown),
      maxPositionSize: String(executable.validation.maxPositionSize),
      maxSectorExposure: String(executable.validation.maxSectorExposure),
      maxDailyLoss: String(executable.validation.maxDailyLoss),
      robustnessMode: Boolean(parsed.evidence.robustness?.requested),
      capitalSimulation: String(designNotes.capitalSimulation ?? "50000"),
      strategyPrompt: parsed.research.notes || "",
      rules: [],
      emaFast: String(executable.parameters.emaFast),
      emaSlow: String(executable.parameters.emaSlow),
      rsiThreshold: String(executable.parameters.rsiThreshold),
      atrStopMultiple: String(executable.parameters.atrStopMultiple),
      atrTakeProfitMultiple: String(executable.parameters.atrTakeProfitMultiple),
      trailingStopAtrMultiple: String(executable.parameters.trailingStopAtrMultiple),
      riskPerTrade: String(executable.positionSizing.riskPerTrade),
      signalThreshold: String(executable.parameters.signalThreshold),
      technicalWeight: String(executable.weights.technical),
      regimeWeight: String(executable.weights.regime),
      newsWeight: String(executable.weights.news),
      openaiWeight: String(executable.weights.openai),
      regimeFilter: executable.filters.marketRegime,
      newsFilter: executable.filters.news,
      marketHoursOnly: executable.filters.marketHoursOnly,
      earningsFilter: executable.filters.earnings,
      universeId: executable.universe.universeId,
      universeName: executable.universe.universeName,
      allowedSectors: (executable.envelope?.sectors || []).join(", "),
      allowedRegimes: (executable.envelope?.regimes || []).join(", "),
      instrumentTypes: (executable.envelope?.instrumentTypes || []).join(", "),
      volatilityMin: String(executable.envelope?.volBand?.min ?? 0),
      volatilityMax: String(executable.envelope?.volBand?.max ?? 0.03),
      liquidityFloor: String(executable.envelope?.liquidityFloor ?? 1000000),
      holdingPeriodDays: String(executable.envelope?.holdingPeriodDays ?? 15),
      regimeOverlays: executable.regimeOverlays || {},
      allocationMatrix: executable.allocationMatrix || {},
    },
  });
}

export function validateStrategyJson(strategyJson) {
  return strategyJsonZodSchema.safeParse(strategyJson);
}

export { strategyJsonContract };
