const assert = require("node:assert/strict");
const test = require("node:test");
const { importanceFor, validateEvent } = require("../features/memory/services/memoryPolicy");

function event(overrides = {}) { return { userId: "user-1", eventType: "BACKTEST_COMPLETED", title: " Momentum backtest  completed ", summary: " Backtest finished. ", sourceType: "STRATEGY_RUN", sourceId: "run-1", structuredData: { sharpe: 1.2, apiKey: "secret", nested: { sessionToken: "secret", trades: 42 } }, occurredAt: "2026-07-13T00:00:00Z", ...overrides }; }

test("memory validation produces deterministic bounded summaries, hashes, and redaction", () => {
  const first = validateEvent(event()); const second = validateEvent(event());
  assert.equal(first.category, "RESEARCH");
  assert.equal(first.title, "Momentum backtest completed");
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.dedupeKey, second.dedupeKey);
  assert.equal(first.structuredData.apiKey, undefined);
  assert.equal(first.structuredData.nested.sessionToken, undefined);
  assert.equal(first.structuredData.nested.trades, 42);
});

test("importance is deterministic and reflects capital, outcome, and state transitions", () => {
  assert.equal(importanceFor("MATRIX_DEPLOYED"), 98);
  assert.equal(importanceFor("BACKTEST_COMPLETED", { measurableOutcome: true }), 75);
  assert.equal(importanceFor("ORDER_FILLED", { realCapitalImpact: true, stateTransition: true }), 100);
});

test("memory validation rejects mismatched categories, unknown events, and confidence bounds", () => {
  assert.throws(() => validateEvent(event({ category: "TRADE" })), /does not match/i);
  assert.throws(() => validateEvent(event({ eventType: "CLICKED_BUTTON" })), /unsupported memory event/i);
  assert.throws(() => validateEvent(event({ confidence: 101 })), /between 0 and 100/i);
});
