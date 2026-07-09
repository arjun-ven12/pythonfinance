const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createApprovalsController,
} = require("../features/approvals/controllers/approvals.controller");

function createResponseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createBaseApproval() {
  return {
    id: "approval-1",
    userId: "user-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    entryPrice: 100,
    stopLoss: 95,
    takeProfit: 110,
    status: "APPROVED",
    decisionNote: null,
  };
}

function createController(overrides = {}) {
  return createApprovalsController({
    buildApprovalRequestData: () => ({}),
    buildApprovalTradeEditData: () => ({}),
    estimateLedgerImpact: () => ({}),
    executeBrokerPaperOrder: async () => ({}),
    getApprovalRequestById: async () => createBaseApproval(),
    getDecisionNote: () => null,
    getPortfolioForUser: async () => ({ ledgerState: { cash: 100000 } }),
    getRequestOrderPayload: () => ({ orderType: "MARKET" }),
    listApprovalRequests: async () => [],
    persistPaperExecutionResult: async () => ({
      id: "approval-1",
      paper_execution: { filled: true },
    }),
    persistProposedTradeEditFromApproval: async () => null,
    proposedTradeToOrder: () => null,
    runPaperOrder: async () => ({ filled: true, trade: { symbol: "AAPL" } }),
    runPreTradeAnalysis: async () => ({
      allow_trade: true,
      safety_violations: [],
      upcoming_events: [],
      news_reasoning: {},
    }),
    syncApprovalRequestsFromProposedOrders: async () => {},
    transitionApprovalRequest: async () => ({}),
    updateApprovalRequestRecord: async () => createBaseApproval(),
    createApprovalRequestRecord: async () => ({}),
    ...overrides,
  });
}

test("approval paper execution runs pre-trade analysis in simulation mode", async () => {
  let receivedPayload = null;
  const controller = createController({
    runPreTradeAnalysis: async (_userId, payload) => {
      receivedPayload = payload;
      return {
        allow_trade: true,
        safety_violations: [],
        upcoming_events: [],
        news_reasoning: {},
      };
    },
  });
  const req = {
    params: { id: "approval-1" },
    user: { id: "user-1" },
    body: {},
  };
  const res = createResponseRecorder();

  await controller.executePaper(req, res);

  assert.equal(receivedPayload?.simulationMode, true);
  assert.equal(res.statusCode, 201);
});

test("approval paper execution returns block reason and override eligibility", async () => {
  const updatedRequest = { ...createBaseApproval(), decisionNote: "blocked" };
  const controller = createController({
    runPreTradeAnalysis: async () => ({
      allow_trade: false,
      explanation: "News filter suggests waiting until earnings pass.",
      safety_violations: ["News filter suggests waiting."],
      upcoming_events: [],
      news_reasoning: {},
    }),
    updateApprovalRequestRecord: async () => updatedRequest,
  });
  const req = {
    params: { id: "approval-1" },
    user: { id: "user-1" },
    body: {},
  };
  const res = createResponseRecorder();

  await controller.executePaper(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.override_eligible, true);
  assert.equal(res.body.block_reason, "News filter suggests waiting until earnings pass.");
});

test("approval paper execution allows manual override for analysis blocks", async () => {
  const controller = createController({
    runPreTradeAnalysis: async () => ({
      allow_trade: false,
      explanation: "Confidence is below the preferred threshold.",
      safety_violations: ["Confidence is below preferred threshold."],
      upcoming_events: [],
      news_reasoning: {},
    }),
    persistPaperExecutionResult: async (_userId, _approvalId, _paperResult, updates, decisionNote) => ({
      id: "approval-1",
      paper_execution: { filled: true },
      raw: updates.raw,
      decisionNote,
    }),
  });
  const req = {
    params: { id: "approval-1" },
    user: { id: "user-1" },
    body: { manualOverride: true },
  };
  const res = createResponseRecorder();

  await controller.executePaper(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.manual_override, true);
  assert.equal(res.body.block_reason, "Confidence is below the preferred threshold.");
});

test("broker paper execution forwards manual override to broker execution service", async () => {
  let receivedInput = null;
  const controller = createController({
    executeBrokerPaperOrder: async (_userId, _approvalId, input) => {
      receivedInput = input;
      return {
        brokerOrder: { id: "order-1" },
        manual_override: true,
      };
    },
  });

  const req = {
    params: { id: "approval-1" },
    user: { id: "user-1" },
    body: { confirmSubmit: true, manualOverride: true, decisionNote: "override" },
  };
  const res = createResponseRecorder();

  await controller.executeBrokerPaper(req, res);

  assert.equal(receivedInput?.manualOverride, true);
  assert.equal(receivedInput?.confirmSubmit, true);
});
