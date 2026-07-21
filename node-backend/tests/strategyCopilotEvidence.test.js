const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEvidenceCatalog,
  normalizeEvidenceReferences,
} = require("../features/strategyLab/services/strategyCopilotEvidence.service");

function buildExperiment() {
  return {
    id: "exp-1",
    settingsJson: {
      robustness: {
        score: 71,
        rating: "Stable",
      },
    },
    runs: [
      {
        id: "run-1",
        createdAt: new Date(0).toISOString(),
        returnPct: 14.2,
        sharpe: 1.12,
        maxDrawdown: -9.4,
        winRate: 59,
        tradeCount: 31,
      },
    ],
    walkForwardRuns: [],
    stressResults: [],
    versions: [{ id: "ver-1", version: 1, changeNote: "Initial", createdAt: new Date(0).toISOString() }],
  };
}

test("evidence catalog summarizes strategy lab metrics into compact evidence items", () => {
  const evidence = buildEvidenceCatalog(buildExperiment(), {});

  assert.ok(evidence.some((item) => item.sourceType === "BACKTEST" && item.metricName === "Sharpe"));
  assert.ok(evidence.some((item) => item.sourceType === "ROBUSTNESS" && item.metricName === "Score"));
});

test("evidence normalization rejects hallucinated evidence references", () => {
  const evidence = buildEvidenceCatalog(buildExperiment(), {});

  assert.throws(
    () =>
      normalizeEvidenceReferences(
        [{
          sourceType: "BACKTEST",
          sourceId: "run-1",
          metricName: "Sharpe",
          metricValue: "9.99",
          interpretation: "Fake",
          strength: "HIGH",
        }],
        evidence
      ),
    /mismatched evidence value/i
  );
});
