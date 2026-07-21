const test = require("node:test");
const assert = require("node:assert/strict");

const { compileStrategySettings } = require("../features/strategyLab/services/strategyCompiler");
const { validateStrategyDsl } = require("../features/strategyLab/services/strategyDslValidator");
const { createStrategyCopilotService } = require("../features/strategyLab/services/strategyCopilot.service");

function buildStrategyExperimentSettings(body = {}) {
  const settings = {
    ...(body.settings || body.settingsJson || body || {}),
  };
  const { strategyJson, validation } = compileStrategySettings(settings, {
    description: body.description,
  });
  settings.strategyJson = strategyJson;
  settings.dslValidation = validation;
  return settings;
}

function buildBaselineExperiment() {
  const settings = buildStrategyExperimentSettings({
    settings: {
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
      robustnessMode: false,
      strategyPrompt: "",
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
      universeName: "US Technology",
      allowedSectors: "Technology",
      allowedRegimes: "BULL_LOW_VOL",
      instrumentTypes: "SINGLE_STOCK",
      volatilityMin: "0",
      volatilityMax: "0.03",
      liquidityFloor: "1000000",
      holdingPeriodDays: "15",
      regimeOverlays: {},
      allocationMatrix: {},
      rules: [
        {
          id: "rule-1",
          group: "Signal",
          operator: "AND",
          left: "Close",
          comparator: ">",
          right: "EMA(50)",
          connector: "AND",
        },
        {
          id: "rule-2",
          group: "Entry",
          operator: "AND",
          left: "RSI(14)",
          comparator: "CROSSES_ABOVE",
          right: "55",
          connector: "AND",
        },
      ],
    },
  });

  return {
    id: "exp-1",
    name: "Momentum Lab",
    description: "Baseline strategy",
    status: "DRAFT",
    settingsJson: settings,
    versions: [{ id: "ver-1", version: 1, changeNote: "Initial", createdAt: new Date(0).toISOString() }],
    runs: [{ id: "run-1", returnPct: 12, sharpe: 1.2, maxDrawdown: -8, winRate: 58, expectancy: 0.4, tradeCount: 25 }],
  };
}

test("strategy copilot proposes a validated edit draft and returns a readable diff", async () => {
  const experiment = buildBaselineExperiment();
  const service = createStrategyCopilotService({
    aiService: {
      isConfigured: () => true,
      async proposeStrategyEdit() {
        return {
          summary: "Make the strategy more conservative with stronger trend confirmation.",
          recommendation: "Reduce per-trade risk and require a slower trend filter.",
          reasoning: ["The request specifically asked to reduce drawdown.", "A slower trend filter can cut weaker entries."],
          evidence: [],
          limitations: ["Insufficient evidence available."],
          nextAction: "Review the proposed changes before approving a new version.",
          reasoningBreakdown: {
            evidenceBackedStatements: [],
            inferences: ["A slower EMA filter may reduce weaker signals."],
            suggestions: ["Review the proposed diff before saving."],
            unknowns: ["Insufficient evidence available."],
          },
          status: "READY",
          title: "Momentum Lab",
          description: "Baseline strategy with tighter drawdown control.",
          summaryOfChanges: "Raised trend confirmation and reduced risk per trade.",
          reason: "The user asked to reduce drawdown.",
          expectedImpact: "Fewer trades with lower risk and stronger trend alignment.",
          possibleDownsides: ["Could reduce trade frequency."],
          tradeoffs: ["Lower drawdown may reduce upside capture."],
          assumptions: ["Universe remains US technology equities."],
          missingInformation: [],
          unsupportedElements: [],
          changeHighlights: ["Reduced risk per trade from 1% to 0.5%."],
          confidenceScore: 78,
          explanation: {
            summary: "The edit makes the strategy more conservative.",
            philosophy: "Only take stronger trend-aligned entries with smaller risk.",
            indicators: ["EMA trend filter", "RSI entry trigger"],
            entryRules: ["Require price above the slower EMA."],
            exitRules: ["Keep the ATR stop framework."],
            validationRules: ["Preserve current validation gates."],
            riskRules: ["Reduce per-trade risk."],
            positionSizing: "Risk 0.5% per trade.",
            expectedMarketConditions: ["Steady uptrends"],
            strengths: ["Lower drawdown risk"],
            weaknesses: ["Lower participation"],
            confidenceScore: 78,
          },
          builderDraft: {
            objective: "minimize_drawdown",
            template: "Momentum",
            universeType: "CUSTOM_SCREEN",
            marketBias: "US",
            primaryTimeframe: "1D",
            entryTimeframe: "1D",
            sizingMethod: "risk_per_trade",
            sizingPreviewCapital: "50000",
            capitalSimulation: "50000",
            maxDrawdown: "10",
            maxPositionSize: "8",
            maxSectorExposure: "30",
            maxDailyLoss: "2.5",
            emaFast: "20",
            emaSlow: "100",
            rsiThreshold: "55",
            atrStopMultiple: "1.5",
            atrTakeProfitMultiple: "8",
            trailingStopAtrMultiple: "2",
            riskPerTrade: "0.005",
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
            universeName: "US Technology",
            allowedSectors: ["Technology"],
            allowedRegimes: ["BULL_LOW_VOL"],
            instrumentTypes: ["SINGLE_STOCK"],
            volatilityMin: "0",
            volatilityMax: "0.03",
            liquidityFloor: "1000000",
            holdingPeriodDays: "20",
            regimeOverlays: {},
            rules: [
              {
                group: "Signal",
                operator: "AND",
                left: "Close",
                comparator: ">",
                right: "EMA(100)",
                connector: "AND",
              },
              {
                group: "Entry",
                operator: "AND",
                left: "RSI(14)",
                comparator: "CROSSES_ABOVE",
                right: "55",
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

  const result = await service.proposeStrategyEdit("user-1", experiment, "Reduce drawdown.");

  assert.equal(result.status, "READY");
  assert.equal(result.canApprove, true);
  assert.equal(result.advisory.evidence.length, 0);
  assert.match(result.advisory.limitations[0], /Insufficient evidence available/i);
  assert.ok(result.diff.indicatorChanges.some((item) => item.field === "emaSlow"));
  assert.ok(result.diff.positionSizingChanges.some((item) => item.field === "riskPerTrade"));
  assert.doesNotThrow(() => validateStrategyDsl(result.draft.strategyJson));
});

test("strategy copilot returns explanation payloads for existing strategies", async () => {
  const experiment = buildBaselineExperiment();
  const service = createStrategyCopilotService({
    aiService: {
      isConfigured: () => true,
      async explainStrategy() {
        return {
          recommendation: "Treat this as a trend-following momentum strategy with confirmation filters.",
          reasoning: ["Price must stay above trend filters before the RSI trigger is allowed to act."],
          evidence: [],
          limitations: ["Insufficient evidence available."],
          nextAction: "Compare the explanation against the compiled Strategy Lab contract.",
          reasoningBreakdown: {
            evidenceBackedStatements: [],
            inferences: ["The rule combination implies directional participation."],
            suggestions: ["Compare this explanation with backtest behavior."],
            unknowns: ["Insufficient evidence available."],
          },
          summary: "Momentum strategy with trend confirmation.",
          philosophy: "Participate in directional continuation while filtering weak setups.",
          indicators: ["EMA", "RSI"],
          entryRules: ["Price must stay above trend filter.", "RSI must recover."],
          exitRules: ["Exit on signal failure."],
          validationRules: ["Use drawdown and trade count gates."],
          riskRules: ["ATR risk framework."],
          positionSizing: "Risk per trade sizing.",
          expectedMarketConditions: ["Bullish trends"],
          strengths: ["Simple structure"],
          weaknesses: ["Can whipsaw in ranges"],
          confidenceScore: 80,
        };
      },
    },
    buildStrategyExperimentSettings,
    validateStrategyDsl,
  });

  const result = await service.explainStrategy("user-1", experiment);

  assert.equal(result.strategyId, "exp-1");
  assert.equal(result.explanation.confidenceScore, 80);
  assert.equal(result.advisory.evidence.length, 0);
  assert.ok(result.explanation.entryRules.length > 0);
});
