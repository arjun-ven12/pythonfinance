const test = require("node:test");
const assert = require("node:assert/strict");

const { compileStrategySettings } = require("../features/strategyLab/services/strategyCompiler");
const { createStrategyDraftService } = require("../features/strategyLab/services/strategyDraft.service");
const { validateStrategyDsl } = require("../features/strategyLab/services/strategyDslValidator");

function buildEmptyRegimeOverlays() {
  const emptyOverlay = {
    emaFast: "",
    emaSlow: "",
    rsiThreshold: "",
    atrStopMultiple: "",
    atrTakeProfitMultiple: "",
    trailingStopAtrMultiple: "",
    riskPerTrade: "",
    signalThreshold: "",
  };

  return {
    BULL_LOW_VOL: { ...emptyOverlay },
    BULL_HIGH_VOL: { ...emptyOverlay },
    SIDEWAYS: { ...emptyOverlay },
    BEAR_LOW_VOL: { ...emptyOverlay },
    BEAR_HIGH_VOL: { ...emptyOverlay },
    RISK_OFF: { ...emptyOverlay },
  };
}

function buildStrategyServices() {
  return {
    buildStrategyExperimentSettings(body = {}) {
      const settings = {
        ...(body.settings || body.settingsJson || body || {}),
      };
      const { strategyJson, validation } = compileStrategySettings(settings, {
        description: body.description,
      });
      settings.strategyJson = strategyJson;
      settings.dslValidation = validation;
      return settings;
    },
  };
}

test("strategy draft service compiles a valid natural-language draft into canonical Strategy Lab JSON", async () => {
  const { buildStrategyExperimentSettings } = buildStrategyServices();
  const draftService = createStrategyDraftService({
    aiService: {
      isConfigured: () => true,
      async generateStrategyDraft() {
        return {
          status: "READY",
          title: "Tech Swing Reversion",
          description: "Buy large-cap technology pullbacks when RSI recovers above 30 in an uptrend.",
          tradingStyle: "Swing",
          marketType: "US",
          timeframe: { primary: "1D", entry: "1D" },
          entryRules: [
            "RSI crosses above 30.",
            "Price remains above the 50 EMA.",
          ],
          exitRules: [
            "Exit when RSI rises above 70.",
            "Exit if price falls below the 20 EMA.",
          ],
          validationRules: ["Require at least 30 trades in research."],
          riskRules: ["Keep drawdown below 12% and cap daily loss at 3%."],
          positionSizing: "Risk 1% of capital per trade with ATR-based exits.",
          assumptions: ["Universe defaults to a custom US large-cap technology screen."],
          potentialRisks: ["Can underperform during sharp bearish trend breaks."],
          missingInformation: ["Specific stock universe source was not provided."],
          unsupportedElements: [],
          confidenceScore: 82,
          explanation: {
            summary: "This draft looks for oversold recovery inside a broader uptrend.",
            indicatorRationale: [
              "RSI identifies momentum recovery from oversold conditions.",
              "The EMA trend filter keeps trades aligned with the larger trend.",
            ],
            entryRationale: ["The entry waits for both recovery and trend confirmation."],
            exitRationale: ["The exits protect against failed bounces and profit exhaustion."],
            strengths: ["Clear trend filter", "Explainable trigger set"],
            weaknesses: ["Can miss deeper reversals before confirmation arrives"],
          },
          builderDraft: {
            objective: "max_risk_adjusted_return",
            template: "Mean Reversion",
            universeType: "CUSTOM_SCREEN",
            marketBias: "US",
            primaryTimeframe: "1D",
            entryTimeframe: "1D",
            sizingMethod: "risk_per_trade",
            sizingPreviewCapital: "50000",
            capitalSimulation: "50000",
            maxDrawdown: "12",
            maxPositionSize: "8",
            maxSectorExposure: "30",
            maxDailyLoss: "3",
            emaFast: "20",
            emaSlow: "50",
            rsiThreshold: "30",
            atrStopMultiple: "1.5",
            atrTakeProfitMultiple: "4",
            trailingStopAtrMultiple: "2",
            riskPerTrade: "0.01",
            signalThreshold: "60",
            technicalWeight: "0.5",
            regimeWeight: "0.25",
            newsWeight: "0.15",
            openaiWeight: "0.1",
            regimeFilter: true,
            newsFilter: false,
            marketHoursOnly: true,
            earningsFilter: true,
            universeId: "",
            universeName: "US Large Cap Technology",
            allowedSectors: ["Technology"],
            allowedRegimes: ["BULL_LOW_VOL", "SIDEWAYS"],
            instrumentTypes: ["SINGLE_STOCK", "ETF"],
            volatilityMin: "0",
            volatilityMax: "0.03",
            liquidityFloor: "1000000",
            holdingPeriodDays: "15",
            regimeOverlays: buildEmptyRegimeOverlays(),
            rules: [
              {
                group: "Entry",
                operator: "AND",
                left: "RSI",
                comparator: "CROSSES_ABOVE",
                right: "30",
                connector: "AND",
              },
              {
                group: "Signal",
                operator: "AND",
                left: "CLOSE",
                comparator: ">",
                right: "EMA_SLOW",
                connector: "AND",
              },
              {
                group: "Exit",
                operator: "THEN",
                left: "RSI",
                comparator: ">",
                right: "70",
                connector: "MANAGE",
              },
              {
                group: "Exit",
                operator: "THEN",
                left: "CLOSE",
                comparator: "<",
                right: "EMA_FAST",
                connector: "MANAGE",
              },
            ],
          },
        };
      },
    },
    buildStrategyExperimentSettings,
    validateStrategyDsl,
  });

  const result = await draftService.generateStrategyDraft("user-1", "Build a swing strategy.");

  assert.equal(result.status, "READY");
  assert.equal(result.canApprove, true);
  assert.equal(result.review.title, "Tech Swing Reversion");
  assert.ok(result.review.explanation.summary.includes("oversold recovery"));
  assert.equal(result.draft.form.settings.strategyJson.schemaVersion, "strategy-json/v1");
  assert.doesNotThrow(() => validateStrategyDsl(result.draft.strategyJson));
});

test("strategy draft service normalizes fractional confidence scores into 0-100 values", async () => {
  const { buildStrategyExperimentSettings } = buildStrategyServices();
  const draftService = createStrategyDraftService({
    aiService: {
      isConfigured: () => true,
      async generateStrategyDraft() {
        return {
          status: "READY",
          title: "Fractional Confidence Draft",
          description: "Confidence returned as a fraction.",
          tradingStyle: "Swing",
          marketType: "US",
          timeframe: { primary: "1D", entry: "1D" },
          entryRules: ["RSI crosses above 30."],
          exitRules: ["Exit when RSI rises above 70."],
          validationRules: ["Require at least 30 trades in research."],
          riskRules: ["Risk 1% per trade."],
          positionSizing: "Risk 1% per trade with ATR-based exits.",
          assumptions: [],
          potentialRisks: [],
          missingInformation: [],
          unsupportedElements: [],
          confidenceScore: 0.74,
          explanation: {
            summary: "Fractional confidence should display as 74/100.",
            indicatorRationale: [],
            entryRationale: [],
            exitRationale: [],
            strengths: [],
            weaknesses: [],
          },
          builderDraft: {
            objective: "max_risk_adjusted_return",
            template: "Momentum",
            universeType: "CUSTOM_SCREEN",
            marketBias: "US",
            primaryTimeframe: "1D",
            entryTimeframe: "1D",
            sizingMethod: "risk_per_trade",
            sizingPreviewCapital: "50000",
            capitalSimulation: "50000",
            maxDrawdown: "12",
            maxPositionSize: "8",
            maxSectorExposure: "30",
            maxDailyLoss: "3",
            emaFast: "20",
            emaSlow: "50",
            rsiThreshold: "30",
            atrStopMultiple: "1.5",
            atrTakeProfitMultiple: "4",
            trailingStopAtrMultiple: "2",
            riskPerTrade: "0.01",
            signalThreshold: "60",
            technicalWeight: "0.5",
            regimeWeight: "0.25",
            newsWeight: "0.15",
            openaiWeight: "0.1",
            regimeFilter: true,
            newsFilter: false,
            marketHoursOnly: true,
            earningsFilter: true,
            universeId: "",
            universeName: "",
            allowedSectors: [],
            allowedRegimes: ["BULL_LOW_VOL"],
            instrumentTypes: ["SINGLE_STOCK"],
            volatilityMin: "0",
            volatilityMax: "0.03",
            liquidityFloor: "1000000",
            holdingPeriodDays: "15",
            regimeOverlays: buildEmptyRegimeOverlays(),
            rules: [
              {
                group: "Entry",
                operator: "AND",
                left: "RSI",
                comparator: "CROSSES_ABOVE",
                right: "30",
                connector: "AND",
              },
            ],
          },
        };
      },
    },
    buildStrategyExperimentSettings,
    validateStrategyDsl,
  });

  const result = await draftService.generateStrategyDraft("user-1", "Build a swing strategy.");

  assert.equal(result.advisory.confidenceScore, 74);
  assert.equal(result.review.confidenceScore, 74);
});

test("strategy draft service preserves ambiguity notes without blocking a valid draft", async () => {
  const { buildStrategyExperimentSettings } = buildStrategyServices();
  const draftService = createStrategyDraftService({
    aiService: {
      isConfigured: () => true,
      async generateStrategyDraft() {
        return {
          status: "READY",
          title: "Momentum Draft",
          description: "Generic momentum strategy.",
          tradingStyle: "Swing",
          marketType: "US",
          timeframe: { primary: "1D", entry: "1D" },
          entryRules: ["Buy when price is above the 50 EMA."],
          exitRules: ["Use an ATR stop."],
          validationRules: ["Require at least 30 trades."],
          riskRules: ["Risk 1% per trade."],
          positionSizing: "Risk 1% per trade.",
          assumptions: ["Defaults to daily US equities."],
          potentialRisks: ["Momentum can whipsaw in sideways markets."],
          missingInformation: ["Preferred universe", "Preferred stop-loss style"],
          unsupportedElements: [],
          confidenceScore: 61,
          explanation: {
            summary: "A conservative default momentum draft.",
            indicatorRationale: ["EMA trend filter keeps the draft simple."],
            entryRationale: ["The draft waits for directional confirmation."],
            exitRationale: ["ATR exits adapt to volatility."],
            strengths: ["Simple rule set"],
            weaknesses: ["Needs tighter user constraints"],
          },
          builderDraft: {
            objective: "max_risk_adjusted_return",
            template: "Momentum",
            universeType: "CUSTOM_SCREEN",
            marketBias: "US",
            primaryTimeframe: "1D",
            entryTimeframe: "1D",
            sizingMethod: "risk_per_trade",
            sizingPreviewCapital: "50000",
            capitalSimulation: "50000",
            maxDrawdown: "12",
            maxPositionSize: "8",
            maxSectorExposure: "30",
            maxDailyLoss: "3",
            emaFast: "20",
            emaSlow: "50",
            rsiThreshold: "55",
            atrStopMultiple: "1.5",
            atrTakeProfitMultiple: "8",
            trailingStopAtrMultiple: "2",
            riskPerTrade: "0.01",
            signalThreshold: "60",
            technicalWeight: "0.45",
            regimeWeight: "0.25",
            newsWeight: "0.15",
            openaiWeight: "0.15",
            regimeFilter: true,
            newsFilter: false,
            marketHoursOnly: true,
            earningsFilter: true,
            universeId: "",
            universeName: "",
            allowedSectors: [],
            allowedRegimes: ["BULL_LOW_VOL"],
            instrumentTypes: ["SINGLE_STOCK"],
            volatilityMin: "0",
            volatilityMax: "0.03",
            liquidityFloor: "1000000",
            holdingPeriodDays: "15",
            regimeOverlays: buildEmptyRegimeOverlays(),
            rules: [
              {
                group: "Signal",
                operator: "AND",
                left: "CLOSE",
                comparator: ">",
                right: "EMA_SLOW",
                connector: "AND",
              },
            ],
          },
        };
      },
    },
    buildStrategyExperimentSettings,
    validateStrategyDsl,
  });

  const result = await draftService.generateStrategyDraft("user-1", "Create a momentum strategy.");

  assert.equal(result.status, "READY");
  assert.equal(result.review.missingInformation.length, 2);
  assert.equal(result.review.assumptions.length, 1);
});

test("strategy draft service rejects unsupported strategy requests instead of inventing logic", async () => {
  const { buildStrategyExperimentSettings } = buildStrategyServices();
  const draftService = createStrategyDraftService({
    aiService: {
      isConfigured: () => true,
      async generateStrategyDraft() {
        return {
          status: "UNSUPPORTED",
          title: "Unsupported Draft",
          description: "Uses unsupported indicators.",
          tradingStyle: "Swing",
          marketType: "US",
          timeframe: { primary: "1D", entry: "1D" },
          entryRules: [],
          exitRules: [],
          validationRules: [],
          riskRules: [],
          positionSizing: "Not available.",
          assumptions: [],
          potentialRisks: [],
          missingInformation: [],
          unsupportedElements: ["Bollinger Bands", "VWAP"],
          confidenceScore: 0,
          explanation: {
            summary: "The request depends on unsupported indicators.",
            indicatorRationale: [],
            entryRationale: [],
            exitRationale: [],
            strengths: [],
            weaknesses: ["Unsupported Strategy Lab indicators requested"],
          },
          builderDraft: {
            objective: "custom",
            template: "Custom",
            universeType: "CUSTOM_SCREEN",
            marketBias: "US",
            primaryTimeframe: "1D",
            entryTimeframe: "1D",
            sizingMethod: "risk_per_trade",
            sizingPreviewCapital: "50000",
            capitalSimulation: "50000",
            maxDrawdown: "12",
            maxPositionSize: "8",
            maxSectorExposure: "30",
            maxDailyLoss: "3",
            emaFast: "20",
            emaSlow: "50",
            rsiThreshold: "55",
            atrStopMultiple: "1.5",
            atrTakeProfitMultiple: "8",
            trailingStopAtrMultiple: "2",
            riskPerTrade: "0.01",
            signalThreshold: "60",
            technicalWeight: "0.45",
            regimeWeight: "0.25",
            newsWeight: "0.15",
            openaiWeight: "0.15",
            regimeFilter: true,
            newsFilter: false,
            marketHoursOnly: true,
            earningsFilter: true,
            universeId: "",
            universeName: "",
            allowedSectors: [],
            allowedRegimes: [],
            instrumentTypes: ["SINGLE_STOCK"],
            volatilityMin: "0",
            volatilityMax: "0.03",
            liquidityFloor: "1000000",
            holdingPeriodDays: "15",
            regimeOverlays: buildEmptyRegimeOverlays(),
            rules: [],
          },
        };
      },
    },
    buildStrategyExperimentSettings,
    validateStrategyDsl,
  });

  const result = await draftService.generateStrategyDraft("user-1", "Use Bollinger Bands and VWAP.");

  assert.equal(result.canApprove, false);
  assert.deepEqual(result.review.unsupportedElements, ["Bollinger Bands", "VWAP"]);
  assert.equal(result.draft, undefined);
});

test("strategy draft service fails if the AI returns a non-compilable operator", async () => {
  const { buildStrategyExperimentSettings } = buildStrategyServices();
  const draftService = createStrategyDraftService({
    aiService: {
      isConfigured: () => true,
      async generateStrategyDraft() {
        return {
          status: "READY",
          title: "Broken Draft",
          description: "Contains an invalid comparator.",
          tradingStyle: "Swing",
          marketType: "US",
          timeframe: { primary: "1D", entry: "1D" },
          entryRules: ["Broken rule"],
          exitRules: [],
          validationRules: [],
          riskRules: [],
          positionSizing: "Risk 1% per trade.",
          assumptions: [],
          potentialRisks: [],
          missingInformation: [],
          unsupportedElements: [],
          confidenceScore: 50,
          explanation: {
            summary: "Invalid comparator test.",
            indicatorRationale: [],
            entryRationale: [],
            exitRationale: [],
            strengths: [],
            weaknesses: [],
          },
          builderDraft: {
            objective: "max_risk_adjusted_return",
            template: "Custom",
            universeType: "CUSTOM_SCREEN",
            marketBias: "US",
            primaryTimeframe: "1D",
            entryTimeframe: "1D",
            sizingMethod: "risk_per_trade",
            sizingPreviewCapital: "50000",
            capitalSimulation: "50000",
            maxDrawdown: "12",
            maxPositionSize: "8",
            maxSectorExposure: "30",
            maxDailyLoss: "3",
            emaFast: "20",
            emaSlow: "50",
            rsiThreshold: "55",
            atrStopMultiple: "1.5",
            atrTakeProfitMultiple: "8",
            trailingStopAtrMultiple: "2",
            riskPerTrade: "0.01",
            signalThreshold: "60",
            technicalWeight: "0.45",
            regimeWeight: "0.25",
            newsWeight: "0.15",
            openaiWeight: "0.15",
            regimeFilter: true,
            newsFilter: false,
            marketHoursOnly: true,
            earningsFilter: true,
            universeId: "",
            universeName: "",
            allowedSectors: [],
            allowedRegimes: [],
            instrumentTypes: ["SINGLE_STOCK"],
            volatilityMin: "0",
            volatilityMax: "0.03",
            liquidityFloor: "1000000",
            holdingPeriodDays: "15",
            regimeOverlays: buildEmptyRegimeOverlays(),
            rules: [
              {
                group: "Signal",
                operator: "AND",
                left: "CLOSE",
                comparator: "XOR",
                right: "EMA_SLOW",
                connector: "AND",
              },
            ],
          },
        };
      },
    },
    buildStrategyExperimentSettings,
    validateStrategyDsl,
  });

  await assert.rejects(
    () => draftService.generateStrategyDraft("user-1", "Broken prompt"),
    /Unsupported rule comparator/
  );
});

test("strategy draft service tolerates human-readable exit rule labels from AI output", async () => {
  const { buildStrategyExperimentSettings } = buildStrategyServices();
  const draftService = createStrategyDraftService({
    aiService: {
      isConfigured: () => true,
      async generateStrategyDraft() {
        return {
          status: "READY",
          title: "Readable Exit Draft",
          description: "Uses human-readable exit rule labels.",
          tradingStyle: "Swing",
          marketType: "US",
          timeframe: { primary: "1D", entry: "1D" },
          entryRules: ["Price is above the 50 EMA."],
          exitRules: ["Use a stop loss."],
          validationRules: ["Require at least 30 trades."],
          riskRules: ["Risk 1% per trade."],
          positionSizing: "Risk 1% per trade.",
          assumptions: [],
          potentialRisks: [],
          missingInformation: [],
          unsupportedElements: [],
          confidenceScore: 73,
          explanation: {
            summary: "Exit labels should normalize cleanly.",
            indicatorRationale: [],
            entryRationale: [],
            exitRationale: [],
            strengths: [],
            weaknesses: [],
          },
          builderDraft: {
            objective: "max_risk_adjusted_return",
            template: "Momentum",
            universeType: "CUSTOM_SCREEN",
            marketBias: "US",
            primaryTimeframe: "1D",
            entryTimeframe: "1D",
            sizingMethod: "risk_per_trade",
            sizingPreviewCapital: "50000",
            capitalSimulation: "50000",
            maxDrawdown: "12",
            maxPositionSize: "8",
            maxSectorExposure: "30",
            maxDailyLoss: "3",
            emaFast: "20",
            emaSlow: "50",
            rsiThreshold: "55",
            atrStopMultiple: "1.5",
            atrTakeProfitMultiple: "8",
            trailingStopAtrMultiple: "2",
            riskPerTrade: "0.01",
            signalThreshold: "60",
            technicalWeight: "0.45",
            regimeWeight: "0.25",
            newsWeight: "0.15",
            openaiWeight: "0.15",
            regimeFilter: true,
            newsFilter: false,
            marketHoursOnly: true,
            earningsFilter: true,
            universeId: "",
            universeName: "",
            allowedSectors: [],
            allowedRegimes: ["BULL_LOW_VOL"],
            instrumentTypes: ["SINGLE_STOCK"],
            volatilityMin: "0",
            volatilityMax: "0.03",
            liquidityFloor: "1000000",
            holdingPeriodDays: "15",
            regimeOverlays: buildEmptyRegimeOverlays(),
            rules: [
              {
                group: "Signal",
                operator: "AND",
                left: "Close",
                comparator: ">",
                right: "EMA_SLOW",
                connector: "AND",
              },
              {
                group: "Exit",
                operator: "THEN",
                left: "Stop loss.",
                comparator: "<=",
                right: "1.5",
                connector: "MANAGE",
              },
            ],
          },
        };
      },
    },
    buildStrategyExperimentSettings,
    validateStrategyDsl,
  });

  const result = await draftService.generateStrategyDraft(
    "user-1",
    "Create a strategy with a stop loss."
  );

  assert.equal(result.status, "READY");
  assert.doesNotThrow(() => validateStrategyDsl(result.draft.strategyJson));
});

test("strategy draft service coerces exit-style labels into the Exit group", async () => {
  const { buildStrategyExperimentSettings } = buildStrategyServices();
  const draftService = createStrategyDraftService({
    aiService: {
      isConfigured: () => true,
      async generateStrategyDraft() {
        return {
          status: "READY",
          title: "Exit Group Draft",
          description: "Exit rule arrives under the wrong group.",
          tradingStyle: "Swing",
          marketType: "US",
          timeframe: { primary: "1D", entry: "1D" },
          entryRules: ["Price is above the 50 EMA."],
          exitRules: ["Use a stop loss."],
          validationRules: ["Require at least 30 trades."],
          riskRules: ["Risk 1% per trade."],
          positionSizing: "Risk 1% per trade.",
          assumptions: [],
          potentialRisks: [],
          missingInformation: [],
          unsupportedElements: [],
          confidenceScore: 73,
          explanation: {
            summary: "Exit labels should normalize into executable exits.",
            indicatorRationale: [],
            entryRationale: [],
            exitRationale: [],
            strengths: [],
            weaknesses: [],
          },
          builderDraft: {
            objective: "max_risk_adjusted_return",
            template: "Momentum",
            universeType: "CUSTOM_SCREEN",
            marketBias: "US",
            primaryTimeframe: "1D",
            entryTimeframe: "1D",
            sizingMethod: "risk_per_trade",
            sizingPreviewCapital: "50000",
            capitalSimulation: "50000",
            maxDrawdown: "12",
            maxPositionSize: "8",
            maxSectorExposure: "30",
            maxDailyLoss: "3",
            emaFast: "20",
            emaSlow: "50",
            rsiThreshold: "55",
            atrStopMultiple: "1.5",
            atrTakeProfitMultiple: "8",
            trailingStopAtrMultiple: "2",
            riskPerTrade: "0.01",
            signalThreshold: "60",
            technicalWeight: "0.45",
            regimeWeight: "0.25",
            newsWeight: "0.15",
            openaiWeight: "0.15",
            regimeFilter: true,
            newsFilter: false,
            marketHoursOnly: true,
            earningsFilter: true,
            universeId: "",
            universeName: "",
            allowedSectors: [],
            allowedRegimes: ["BULL_LOW_VOL"],
            instrumentTypes: ["SINGLE_STOCK"],
            volatilityMin: "0",
            volatilityMax: "0.03",
            liquidityFloor: "1000000",
            holdingPeriodDays: "15",
            regimeOverlays: buildEmptyRegimeOverlays(),
            rules: [
              {
                group: "Signal",
                operator: "AND",
                left: "Close",
                comparator: ">",
                right: "EMA_SLOW",
                connector: "AND",
              },
              {
                group: "Risk",
                operator: "AND",
                left: "Stop loss.",
                comparator: "<=",
                right: "1.5",
                connector: "AND",
              },
            ],
          },
        };
      },
    },
    buildStrategyExperimentSettings,
    validateStrategyDsl,
  });

  const result = await draftService.generateStrategyDraft(
    "user-1",
    "Create a strategy with a stop loss."
  );

  assert.ok(result?.draft?.strategyJson?.executable?.exitRules?.[0]?.comparator);
  assert.doesNotThrow(() => validateStrategyDsl(result.draft.strategyJson));
});

test("strategy draft service normalizes readable EMA periods into supported builder keys", async () => {
  const { buildStrategyExperimentSettings } = buildStrategyServices();
  const draftService = createStrategyDraftService({
    aiService: {
      isConfigured: () => true,
      async generateStrategyDraft() {
        return {
          status: "READY",
          title: "EMA Alias Draft",
          description: "Uses readable EMA periods in AI output.",
          tradingStyle: "Swing",
          marketType: "US",
          timeframe: { primary: "1D", entry: "1D" },
          entryRules: ["EMA(10) is above EMA(50)."],
          exitRules: ["Use a stop loss."],
          validationRules: ["Require at least 30 trades."],
          riskRules: ["Risk 1% per trade."],
          positionSizing: "Risk 1% per trade.",
          assumptions: [],
          potentialRisks: [],
          missingInformation: [],
          unsupportedElements: [],
          confidenceScore: 73,
          explanation: {
            summary: "EMA period aliases should normalize cleanly.",
            indicatorRationale: [],
            entryRationale: [],
            exitRationale: [],
            strengths: [],
            weaknesses: [],
          },
          builderDraft: {
            objective: "max_risk_adjusted_return",
            template: "Momentum",
            universeType: "CUSTOM_SCREEN",
            marketBias: "US",
            primaryTimeframe: "1D",
            entryTimeframe: "1D",
            sizingMethod: "risk_per_trade",
            sizingPreviewCapital: "50000",
            capitalSimulation: "50000",
            maxDrawdown: "12",
            maxPositionSize: "8",
            maxSectorExposure: "30",
            maxDailyLoss: "3",
            emaFast: "10",
            emaSlow: "50",
            rsiThreshold: "55",
            atrStopMultiple: "1.5",
            atrTakeProfitMultiple: "8",
            trailingStopAtrMultiple: "2",
            riskPerTrade: "0.01",
            signalThreshold: "60",
            technicalWeight: "0.45",
            regimeWeight: "0.25",
            newsWeight: "0.15",
            openaiWeight: "0.15",
            regimeFilter: true,
            newsFilter: false,
            marketHoursOnly: true,
            earningsFilter: true,
            universeId: "",
            universeName: "",
            allowedSectors: [],
            allowedRegimes: ["BULL_LOW_VOL"],
            instrumentTypes: ["SINGLE_STOCK"],
            volatilityMin: "0",
            volatilityMax: "0.03",
            liquidityFloor: "1000000",
            holdingPeriodDays: "15",
            regimeOverlays: buildEmptyRegimeOverlays(),
            rules: [
              {
                group: "Signal",
                operator: "AND",
                left: "EMA(10)",
                comparator: ">",
                right: "EMA(50)",
                connector: "AND",
              },
              {
                group: "Exit",
                operator: "THEN",
                left: "Stop loss.",
                comparator: "<=",
                right: "1.5",
                connector: "MANAGE",
              },
            ],
          },
        };
      },
    },
    buildStrategyExperimentSettings,
    validateStrategyDsl,
  });

  const result = await draftService.generateStrategyDraft(
    "user-1",
    "Create a strategy with EMA(10) above EMA(50)."
  );

  assert.doesNotThrow(() => validateStrategyDsl(result.draft.strategyJson));
});
