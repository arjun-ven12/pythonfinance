const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildConfidenceGroups,
  buildDiagnostics,
  calculateBrierScore,
  calculateEvaluation,
  getConfidenceBucket,
  getReliability,
} = require("../services/validationService");

test("confidence bucket assignment is explicit and deterministic", () => {
  assert.equal(getConfidenceBucket(0).key, "0-49");
  assert.equal(getConfidenceBucket(49).key, "0-49");
  assert.equal(getConfidenceBucket(50).key, "50-59");
  assert.equal(getConfidenceBucket(59).key, "50-59");
  assert.equal(getConfidenceBucket(60).key, "60-69");
  assert.equal(getConfidenceBucket(79.47).key, "70-79");
  assert.equal(getConfidenceBucket(89).key, "80-89");
  assert.equal(getConfidenceBucket(90).key, "90-100");
  assert.equal(getConfidenceBucket(100).key, "90-100");
});

test("confidence buckets never place sub-50 confidence into 90-100", () => {
  const groups = buildConfidenceGroups([
    {
      id: "low",
      confidence: 35,
      evaluationStatus: "MATURED",
      actualReturn: -2,
      evaluationHorizon: "5D",
      outcomeDirection: "DOWN",
    },
    {
      id: "high",
      confidence: 95,
      evaluationStatus: "MATURED",
      actualReturn: 3,
      evaluationHorizon: "5D",
      outcomeDirection: "UP",
    },
  ]);

  assert.equal(groups.find((group) => group.key === "0-49").samples, 1);
  assert.equal(groups.find((group) => group.key === "90-100").samples, 1);
});

test("validation evaluation waits for maturity and calculates return path", () => {
  const signal = {
    timestamp: "2026-01-01T00:00:00.000Z",
    closePriceAtSignal: 100,
  };
  const prices = [
    { date: "2026-01-02", close: 102 },
    { date: "2026-01-03", close: 101 },
    { date: "2026-01-04", close: 106 },
    { date: "2026-01-05", close: 98 },
    { date: "2026-01-06", close: 110 },
  ];

  assert.equal(calculateEvaluation(signal, prices, { key: "5D", days: 5, returnField: "return5d" }).actualReturn, 10);
  assert.equal(calculateEvaluation(signal, prices.slice(0, 4), { key: "5D", days: 5, returnField: "return5d" }), null);

  const evaluation = calculateEvaluation(signal, prices, {
    key: "5D",
    days: 5,
    returnField: "return5d",
  });

  assert.equal(evaluation.entryPrice, 100);
  assert.equal(evaluation.exitPrice, 110);
  assert.equal(evaluation.return1d, 2);
  assert.equal(evaluation.return5d, 10);
  assert.equal(evaluation.maxReturn, 10);
  assert.equal(evaluation.minReturn, -2);
  assert.equal(evaluation.outcomeDirection, "UP");
  assert.equal(evaluation.evaluationStatus, "MATURED");
});

test("brier score and reliability are calculated from actual outcomes", () => {
  const rows = [
    { outcomeDirection: "UP" },
    { outcomeDirection: "DOWN" },
    { outcomeDirection: "UP" },
  ];

  assert.equal(calculateBrierScore(70, rows).toFixed(4), "0.2233");
  assert.equal(getReliability(10).evidenceScore, "LOW");
  assert.equal(getReliability(30).evidenceScore, "MEDIUM");
  assert.equal(getReliability(100).evidenceScore, "HIGH");
});

test("diagnostics report maturity coverage without inventing outcomes", () => {
  const diagnostics = buildDiagnostics([
    { confidence: 80, evaluationStatus: "PENDING" },
    { confidence: 90, evaluationStatus: "FAILED" },
    {
      confidence: 70,
      evaluationStatus: "MATURED",
      actualReturn: 2,
      evaluationHorizon: "5D",
    },
  ]);

  assert.equal(diagnostics.signalsGenerated, 3);
  assert.equal(diagnostics.signalsEvaluated, 1);
  assert.equal(diagnostics.evaluationFailures, 1);
  assert.equal(diagnostics.pendingMaturity, 1);
  assert.equal(diagnostics.coverage, 33.33);
});
