const test = require("node:test");
const assert = require("node:assert/strict");

const { createStrategyResearchService } = require("../features/strategyLab/services/strategyResearch.service");

function buildExperiment() {
  return {
    id: "exp-1",
    name: "Momentum Research",
    description: "Research strategy",
    status: "TESTED",
    settingsJson: {
      template: "Momentum",
      objective: "max_risk_adjusted_return",
      marketBias: "US",
      primaryTimeframe: "1D",
      entryTimeframe: "1D",
      riskPerTrade: "0.01",
      emaFast: "20",
      emaSlow: "50",
      rsiThreshold: "55",
      robustness: {
        score: 68,
        rating: "Moderate",
      },
      deploymentReadiness: {
        score: 64,
        label: "Needs more evidence",
      },
    },
    runs: [
      {
        id: "run-1",
        createdAt: new Date(0).toISOString(),
        returnPct: 12.5,
        sharpe: 0.92,
        sortino: 1.21,
        maxDrawdown: -11.4,
        winRate: 58,
        expectancy: 0.32,
        tradeCount: 29,
        profitFactor: 1.28,
        settingsJson: {
          equity_curve: [{ date: "2026-01-01", equity: 100000 }],
          drawdown_curve: [{ date: "2026-01-01", drawdown: 0 }],
          completed_trade_log: [{ symbol: "AAPL" }],
          monthly_returns: [{ month: "2026-01", return_pct: 1.2 }],
          regime_breakdown: [{ regime: "BULL_LOW_VOL", winRate: 61, realizedReturn: 14, sampleCount: 18 }],
          sector_breakdown: [{ sector: "Technology", winRate: 60 }],
          validation_summary: "Evidence still maturing",
        },
      },
    ],
    walkForwardRuns: [
      {
        id: "wf-1",
        createdAt: new Date(0).toISOString(),
        oosReturn: 6.3,
        oosSharpe: 0.71,
        oosDrawdown: -7.5,
        stabilityScore: 62,
        summaryJson: {
          outOfRegimeStability: {
            pass: false,
            returnDecayPct: 22,
          },
        },
        segments: [{ phase: "TEST", segmentIndex: 0, returnPct: 4.2, sharpe: 0.6, tradeCount: 8 }],
      },
    ],
    stressResults: [
      {
        id: "mc-1",
        createdAt: new Date(0).toISOString(),
        bestReturn: 24,
        medianReturn: 8,
        worstReturn: -18,
        probability20Drawdown: 17,
      },
    ],
    parameterSweeps: [
      {
        id: "sweep-1",
        createdAt: new Date(0).toISOString(),
        totalRuns: 25,
        symbol: "AAPL",
        period: "2y",
        results: [{ rank: 1, emaFast: 20, emaSlow: 50, rsiThreshold: 55, sharpe: 1.1, returnPct: 15 }],
      },
    ],
    versions: [
      {
        id: "ver-2",
        version: 2,
        createdAt: new Date(0).toISOString(),
        changeNote: "Reduce drawdown",
        evidenceJson: { robustness: { score: 68 } },
        settingsJson: {
          template: "Momentum",
          objective: "max_risk_adjusted_return",
          marketBias: "US",
          primaryTimeframe: "1D",
          entryTimeframe: "1D",
          riskPerTrade: "0.01",
          emaFast: "20",
          emaSlow: "50",
          rsiThreshold: "55",
        },
      },
      {
        id: "ver-1",
        version: 1,
        createdAt: new Date(0).toISOString(),
        changeNote: "Initial",
        evidenceJson: { robustness: { score: 54 } },
        settingsJson: {
          template: "Momentum",
          objective: "max_risk_adjusted_return",
          marketBias: "US",
          primaryTimeframe: "1D",
          entryTimeframe: "1D",
          riskPerTrade: "0.02",
          emaFast: "10",
          emaSlow: "40",
          rsiThreshold: "50",
        },
      },
    ],
  };
}

test("strategy research service generates research reports from existing evidence only", async () => {
  const service = createStrategyResearchService({
    aiService: {
      isConfigured: () => true,
      async generateStrategyResearchReport(_userId, payload) {
        assert.equal(payload.workflow, "RESEARCH_REPORT");
        assert.equal(payload.context.strategy.name, "Momentum Research");
        assert.ok(payload.availableEvidence.length > 0);
        return {
          summary: "Research quality is promising but still evidence-limited.",
          recommendation: "Keep the strategy in research mode and expand out-of-sample validation.",
          reasoning: ["Walk-forward decay and a light trade count both reduce trust."],
          evidence: [payload.availableEvidence[0]],
          limitations: ["Evidence still maturing"],
          nextAction: "Run additional out-of-sample and regime-specific tests.",
          reasoningBreakdown: {
            evidenceBackedStatements: ["The latest saved backtest and walk-forward data are available."],
            inferences: ["Moderate robustness implies the edge may not generalize cleanly."],
            suggestions: ["Expand date coverage and regime validation."],
            unknowns: [],
          },
          executiveSummary: "Returns are acceptable but robustness remains moderate.",
          performanceSummary: "Sharpe is modest relative to drawdown.",
          strengths: ["Positive return profile"],
          weaknesses: ["Trade sample is still light"],
          riskAssessment: ["Drawdown remains meaningful"],
          regimeAnalysis: ["Bull low-volatility regimes helped most"],
          robustnessReview: ["Walk-forward decay suggests caution"],
          executionAnalysis: ["Trade count is moderate"],
          capitalUsage: ["Capital usage data is limited"],
          failureModes: ["Can struggle outside trend-friendly regimes"],
          researchRecommendations: [
            {
              recommendation: "Test broader date windows.",
              confidence: 77,
              evidence: ["Walk-forward decay", "Limited trade count"],
              limitations: ["No newer matrix replay run supplied"],
            },
          ],
          supportingMetrics: ["Return 12.5%", "Sharpe 0.92"],
          knownLimitations: ["Evidence still maturing"],
          confidenceScore: 77,
        };
      },
    },
  });

  const result = await service.generateResearchReport("user-1", buildExperiment(), {
    lifecycle: { experimentId: "exp-1", status: "TESTED" },
    memory: { timeline: [] },
  });

  assert.equal(result.strategyId, "exp-1");
  assert.equal(result.advisory.evidence.length, 1);
  assert.equal(result.report.confidenceScore, 77);
});

test("strategy research service compares saved versions with validation evidence", async () => {
  const experiment = buildExperiment();
  const service = createStrategyResearchService({
    aiService: {
      isConfigured: () => true,
      async compareStrategyVersions(_userId, payload) {
        assert.equal(payload.workflow, "VERSION_COMPARE");
        assert.ok(payload.changedFields.length > 0);
        return {
          summary: "Version 2 improves risk posture without changing the strategy family.",
          recommendation: "Prefer version 2 for continued research because it lowers risk per trade.",
          reasoning: ["The saved settings reduce risk per trade and increase the slow EMA filter."],
          evidence: [payload.availableEvidence[0]],
          limitations: ["Per-version backtest attribution is limited"],
          nextAction: "Run fresh matched backtests for both versions if you need tighter attribution.",
          reasoningBreakdown: {
            evidenceBackedStatements: ["Both versions exist in saved version history."],
            inferences: ["A slower EMA plus lower risk likely reduces signal frequency."],
            suggestions: ["Use matched re-runs for clean version attribution."],
            unknowns: [],
          },
          executiveSummary: "Version 2 lowers risk at the cost of slightly slower entries.",
          ruleChanges: ["EMA slow increased from 40 to 50"],
          performanceDifferences: ["Validation evidence is stronger in version 2"],
          riskDifferences: ["Risk per trade reduced from 2% to 1%"],
          tradeFrequency: "Likely lower because of slower confirmation settings.",
          marketSuitability: "Version 2 should fit steadier trends better.",
          executionComplexity: "Complexity is unchanged.",
          robustness: "Version 2 shows better robustness evidence.",
          regressions: ["Potentially fewer signals"],
          improvements: ["Lower per-trade risk"],
          supportingMetrics: ["Robustness 68 vs 54"],
          knownLimitations: ["Per-version backtest attribution is limited"],
          confidenceScore: 74,
        };
      },
    },
  });

  const result = await service.compareVersions(
    "user-1",
    experiment,
    experiment.versions[0],
    experiment.versions[1],
    {
      leftValidation: { hitRate: 56, sampleCount: 40 },
      rightValidation: { hitRate: 49, sampleCount: 24 },
    }
  );

  assert.equal(result.leftVersionId, "ver-2");
  assert.equal(result.advisory.evidence.length, 1);
  assert.equal(result.comparison.confidenceScore, 74);
});
