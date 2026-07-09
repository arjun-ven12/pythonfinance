const test = require("node:test");
const assert = require("node:assert/strict");
const { computeDeploymentReadiness } = require("../features/strategyLab/services/deploymentReadiness");
const {
  computeLifecycleReadiness,
  getRuleSnapshot,
} = require("../features/strategyLab/services/strategyLifecycleService");

test("strategy lifecycle activation gates require evidence", () => {
  const readiness = computeLifecycleReadiness({
    computeDeploymentReadiness,
    latestRun: {
      tradeCount: 100,
      sharpe: 1.8,
      maxDrawdown: -8,
      expectancy: 0.9,
    },
    robustness: { score: 80 },
    latestWalkForward: { stabilityScore: 20 },
    validation: { hitRate: 70, averageConfidence: 75 },
    activationRules: {
      minimumTrades: 30,
      minimumRobustness: 60,
      minimumWalkForwardStability: 55,
      validationConfidenceThreshold: 55,
    },
  });

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.gates.minimumWalkForwardStability.pass, false);
  assert.match(readiness.reasons.join(" "), /Walk-forward/);
});

test("strategy lifecycle allows activation when all gates pass", () => {
  const readiness = computeLifecycleReadiness({
    computeDeploymentReadiness,
    latestRun: {
      tradeCount: 120,
      sharpe: 2.1,
      maxDrawdown: -6,
      expectancy: 1.2,
    },
    robustness: { score: 82 },
    latestWalkForward: {
      stabilityScore: 72,
      summaryJson: {
        outOfRegimeStability: {
          pass: true,
          trainReturn: 18,
          outOfRegimeReturn: 12,
          returnDecayPct: -33.33,
        },
      },
    },
    validation: {
      hitRate: 68,
      averageConfidence: 77,
      byRegime: [
        { regime: "BULL_LOW_VOL", sampleCount: 18, hitRate: 63 },
        { regime: "BEAR_HIGH_VOL", sampleCount: 14, hitRate: 57 },
      ],
    },
    activationRules: {
      minimumTrades: 30,
      minimumRobustness: 60,
      minimumWalkForwardStability: 55,
      validationConfidenceThreshold: 55,
    },
  });

  assert.equal(readiness.canActivate, true);
  assert.equal(readiness.gates.minimumTrades.pass, true);
  assert.equal(readiness.gates.validationConfidenceThreshold.pass, true);
});

test("strategy lifecycle blocks activation when out-of-regime walk-forward fails", () => {
  const readiness = computeLifecycleReadiness({
    computeDeploymentReadiness,
    latestRun: {
      tradeCount: 120,
      sharpe: 2.1,
      maxDrawdown: -6,
      expectancy: 1.2,
    },
    robustness: { score: 82 },
    latestWalkForward: {
      stabilityScore: 72,
      summaryJson: {
        outOfRegimeStability: {
          pass: false,
          trainReturn: 22,
          outOfRegimeReturn: -4,
          returnDecayPct: -118.18,
        },
      },
    },
    validation: {
      hitRate: 68,
      averageConfidence: 77,
      byRegime: [
        { regime: "BULL_LOW_VOL", sampleCount: 18, hitRate: 63 },
        { regime: "BEAR_HIGH_VOL", sampleCount: 14, hitRate: 57 },
      ],
    },
    activationRules: {
      minimumTrades: 30,
      minimumRobustness: 60,
      minimumWalkForwardStability: 55,
      validationConfidenceThreshold: 55,
      requireOutOfRegimePass: true,
    },
  });

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.gates.outOfRegimeWalkForward.pass, false);
  assert.match(readiness.reasons.join(" "), /Out-of-regime walk-forward failed/);
});

test("strategy lifecycle blocks activation when per-regime evidence is too thin", () => {
  const readiness = computeLifecycleReadiness({
    computeDeploymentReadiness,
    latestRun: {
      tradeCount: 120,
      sharpe: 2.1,
      maxDrawdown: -6,
      expectancy: 1.2,
    },
    robustness: { score: 82 },
    latestWalkForward: {
      stabilityScore: 72,
      summaryJson: {
        outOfRegimeStability: {
          pass: true,
          trainReturn: 18,
          outOfRegimeReturn: 12,
          returnDecayPct: -33.33,
        },
      },
    },
    validation: {
      hitRate: 68,
      averageConfidence: 77,
      byRegime: [
        { regime: "BULL_LOW_VOL", sampleCount: 8, hitRate: 63 },
        { regime: "BEAR_HIGH_VOL", sampleCount: 14, hitRate: 40 },
      ],
    },
    activationRules: {
      minimumTrades: 30,
      minimumRobustness: 60,
      minimumWalkForwardStability: 55,
      validationConfidenceThreshold: 55,
      perRegimeMinimumTrades: 10,
      perRegimeMinimumHitRate: 45,
      requireOutOfRegimePass: true,
    },
  });

  assert.equal(readiness.canActivate, false);
  assert.equal(readiness.gates.perRegimeEvidence.pass, false);
  assert.equal(readiness.gates.perRegimeEvidence.failingRegimes.length, 2);
});

test("rule snapshot preserves executable strategy attribution", () => {
  const snapshot = getRuleSnapshot(
    {
      executable: {
        entryRules: [{ indicator: "EMA", comparator: ">", value: 50 }],
        exitRules: [{ type: "TAKE_PROFIT" }],
      },
    },
    {
      emaFast: 20,
      emaSlow: 50,
      signalThreshold: 60,
    }
  );

  assert.equal(snapshot.entryRules.length, 1);
  assert.equal(snapshot.parameters.emaFast, 20);
  assert.equal(snapshot.parameters.signalThreshold, 60);
});
