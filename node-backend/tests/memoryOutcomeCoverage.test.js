const assert = require("node:assert/strict");
const test = require("node:test");
const {
  brokerOrderTransitionEvent,
  internalPaperExecutionEvents,
  opportunityEvent,
  portfolioAllocationChangedEvent,
  portfolioOutcomeEvent,
  portfolioSnapshotEvent,
  strategyEditDecisionEvent,
  strategyRollbackEvent,
  strategyValidationEvent,
} = require("../features/memory/services/memoryEvents");
const { validateEvent } = require("../features/memory/services/memoryPolicy");
const { hasMaterialPortfolioChange } = require("../services/portfolioLedgerService");

test("outcome-chain event builders validate with canonical provenance links", () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const snapshot = portfolioSnapshotEvent({ id: "snap-1", userId: "user-1", equity: 101000, cash: 50000, stateJson: { realized_pnl: 1000, exposure_pct: 50, positions: { NVDA: { quantity: 10 } } }, createdAt: now }, { fillId: "fill-1", tradeId: "trade-1", orderId: "order-1", approvalId: "approval-1", strategyVersionId: "version-1", matrixCellId: "Technology:BULL_LOW_VOLATILITY" });
  const validated = validateEvent(snapshot);
  assert.equal(validated.eventType, "PORTFOLIO_SNAPSHOT_RECORDED");
  assert.ok(validated.links.some((item) => item.entityType === "FILL" && item.relationshipType === "RESULTED_IN"));
  assert.ok(validated.links.some((item) => item.entityType === "STRATEGY_VERSION" && item.relationshipType === "ATTRIBUTED_TO"));
  const outcome = validateEvent(portfolioOutcomeEvent({ id: "snap-1", userId: "user-1", stateJson: { equity: 101000, cash: 50000 }, createdAt: now }, { beforeState: { equity: 100000, cash: 51000 }, observedAfter: "BROKER_FILL", fillIds: ["fill-1"] }));
  assert.equal(outcome.structuredData.metricDeltas.equity, 1000);
  assert.ok(outcome.links.some((item) => item.entityType === "FILL" && item.relationshipType === "OBSERVED_AFTER"));
  validateEvent(portfolioAllocationChangedEvent({ id: "snap-1", userId: "user-1", createdAt: now }, { symbol: "NVDA", beforeQuantity: 5, afterQuantity: 10, fillId: "fill-1" }));
});

test("internal paper fills emit truthful open, close, position, and outcome transitions", () => {
  const trade = { id: "paper-1", userId: "user-1", approvalRequestId: "approval-1", symbol: "NVDA", side: "BUY", quantity: 5, fillPrice: 100, fee: 1, filledAt: new Date() };
  const opened = internalPaperExecutionEvents(trade, { beforeQuantity: 0, afterQuantity: 5, snapshotId: "snap-1" });
  assert.deepEqual(opened.map((event) => event.eventType), ["INTERNAL_PAPER_FILL_RECORDED", "TRADE_OPENED", "POSITION_INCREASED"]);
  const closed = internalPaperExecutionEvents({ ...trade, id: "paper-2", side: "SELL" }, { beforeQuantity: 5, afterQuantity: 0, realizedPnlDelta: 25 });
  assert.deepEqual(closed.map((event) => event.eventType), ["INTERNAL_PAPER_FILL_RECORDED", "TRADE_CLOSED", "POSITION_CLOSED", "TRADE_OUTCOME_RECORDED"]);
  const reduced = internalPaperExecutionEvents({ ...trade, id: "paper-3", side: "SELL", quantity: 2 }, { beforeQuantity: 5, afterQuantity: 3 });
  assert.deepEqual(reduced.map((event) => event.eventType), ["INTERNAL_PAPER_FILL_RECORDED", "TRADE_PARTIALLY_CLOSED", "POSITION_REDUCED"]);
  [...opened, ...closed, ...reduced].forEach((event) => validateEvent(event));
});

test("broker terminal and partial states map to distinct idempotent events", () => {
  const base = { id: "order-1", userId: "user-1", symbol: "NVDA", side: "BUY", quantity: 10, broker: "IBKR", mode: "PAPER_BROKER", lastUpdatedAt: new Date() };
  const partial = brokerOrderTransitionEvent({ ...base, status: "PARTIALLY_FILLED", filledQuantity: 4, remainingQuantity: 6 }, "SUBMITTED");
  const rejected = brokerOrderTransitionEvent({ ...base, status: "REJECTED", filledQuantity: 0, remainingQuantity: 10 }, "SUBMITTED");
  assert.equal(partial.eventType, "ORDER_PARTIALLY_FILLED");
  assert.equal(rejected.eventType, "ORDER_REJECTED");
  assert.notEqual(partial.dedupeKey, rejected.dedupeKey);
  validateEvent(partial);
  validateEvent(rejected);
});

test("scanner and strategy lifecycle builders remain bounded and valid", () => {
  const opportunity = opportunityEvent({ id: "opp-1", userId: "user-1", scanId: "scan-1", strategyVersionId: "v1", symbol: "NVDA", signal: "BUY", opportunityScore: 88, confidence: 0.74, createdAt: new Date() }, "OPPORTUNITY_ROUTED", { reason: "Approval requested" });
  assert.equal(validateEvent(opportunity).confidence, 74);
  const proposed = strategyEditDecisionEvent({ id: "strategy-1", userId: "user-1", updatedAt: new Date() }, "STRATEGY_EDIT_PROPOSED", { contractHash: "hash-1", parentVersionId: "v1" });
  const blocked = strategyValidationEvent({ id: "v2", userId: "user-1", experimentId: "strategy-1", version: 2 }, false, { deploymentBlocked: true, failureCodes: ["LOW_SAMPLE_SIZE"] });
  const rollback = strategyRollbackEvent({ id: "v1", userId: "user-1", experimentId: "strategy-1", version: 1 }, { id: "v2", version: 2 }, { reason: "Regression" });
  [proposed, blocked, rollback].forEach((event) => validateEvent(event));
});

test("portfolio snapshots suppress unchanged polling but retain material changes", () => {
  const state = { equity: 100000, cash: 50000, positions: { NVDA: { quantity: 10 } } };
  assert.equal(hasMaterialPortfolioChange(state, { ...state, generated_at: new Date().toISOString() }), false);
  assert.equal(hasMaterialPortfolioChange(state, { ...state, cash: 49000 }), true);
  assert.equal(hasMaterialPortfolioChange(state, { ...state, positions: { NVDA: { quantity: 11 } } }), true);
  assert.equal(hasMaterialPortfolioChange(state, state, true), true);
});
