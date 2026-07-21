const assert = require("node:assert/strict");
const test = require("node:test");

const createAutonomousPaperTradingService = require("../features/automation/services/autonomousPaperTrading.service");
const { shouldCreateApproval } = require("../services/scanPersistenceService");

function candidate(overrides = {}) {
  return {
    id: "approval-1",
    userId: "user-1",
    symbol: "AAPL",
    side: "BUY",
    quantity: 2,
    entryPrice: 100,
    stopLoss: 95,
    takeProfit: 110,
    status: "PENDING",
    approvalMode: "FULL_AUTOMATION",
    decisionNote: null,
    raw: {
      auto_execute_eligible: true,
      order: { execution_route: { route: "READY_FOR_AUTO_EXECUTION" } },
    },
    ...overrides,
  };
}

function createHarness({ settings = {}, approvals = [candidate()], analysis = null } = {}) {
  const calls = { transitions: [], executions: [], persisted: [], updates: [], queries: [] };
  const prisma = {
    run: async (operation) => operation({
      paperTrade: { count: async () => 0 },
      approvalRequest: {
        findFirst: async () => ({ raw: approvals[0]?.raw || {} }),
        findMany: async (query) => {
          calls.queries.push(query);
          return approvals;
        },
        updateMany: async (query) => {
          calls.updates.push(query);
          return { count: 1 };
        },
      },
    }),
  };
  const service = createAutonomousPaperTradingService({
    getDefaultExecutionSettings: () => ({
      execution_mode: "MANUAL_APPROVAL",
      max_auto_trades_per_cycle: 5,
      max_auto_trades_per_day: 20,
    }),
    getRequestOrderPayload: (approval) => ({ symbol: approval.symbol, approvalId: approval.id }),
    persistPaperExecutionResult: async (...args) => {
      calls.persisted.push(args);
      return { status: "EXECUTED" };
    },
    prisma,
    readUserSetting: async () => ({
      execution_mode: "FULL_AUTOMATION",
      max_auto_trades_per_cycle: 5,
      max_auto_trades_per_day: 20,
      ...settings,
    }),
    runPaperOrder: async (order) => {
      calls.executions.push(order);
      return { filled: true, trade: { symbol: order.symbol } };
    },
    runPreTradeAnalysis: async () => analysis || ({
      allow_trade: true,
      recommendation: "EXECUTE",
      safety_violations: [],
    }),
    transitionApprovalRequest: async (input) => {
      calls.transitions.push(input);
      return { ...approvals[0], status: input.toStatus, decisionNote: input.decisionNote };
    },
  });
  return { calls, service };
}

test("full automation revalidates, policy-approves, and persists an internal paper fill", async () => {
  const { calls, service } = createHarness();
  const result = await service.processEligibleApprovals({ userId: "user-1" });

  assert.deepEqual(
    { attempted: result.attempted, executed: result.executed, failed: result.failed },
    { attempted: 1, executed: 1, failed: 0 }
  );
  assert.equal(calls.transitions[0].toStatus, "APPROVED");
  assert.equal(calls.executions.length, 1);
  assert.equal(calls.persisted.length, 1);
  assert.deepEqual(calls.queries[0].where.raw, {
    path: ["auto_execute_eligible"],
    equals: true,
  });
});

test("fresh pre-trade rejection blocks execution without a manual override", async () => {
  const { calls, service } = createHarness({
    analysis: {
      allow_trade: false,
      recommendation: "REJECT",
      explanation: "Kill switch active",
      safety_violations: ["KILL_SWITCH"],
    },
  });
  const result = await service.processEligibleApprovals({ userId: "user-1" });

  assert.equal(result.blocked, 1);
  assert.equal(calls.transitions[0].toStatus, "REJECTED");
  assert.match(calls.transitions[0].decisionNote, /Kill switch active/);
  assert.equal(calls.executions.length, 0);
  assert.equal(calls.persisted.length, 0);
});

test("an already-approved recovery candidate is executed without duplicate approval", async () => {
  const { calls, service } = createHarness({ approvals: [candidate({ status: "APPROVED" })] });
  const result = await service.processEligibleApprovals({ userId: "user-1" });

  assert.equal(result.executed, 1);
  assert.equal(calls.transitions.length, 0);
  assert.equal(calls.persisted.length, 1);
});

test("non-full-automation settings produce no autonomous side effects", async () => {
  const { calls, service } = createHarness({ settings: { execution_mode: "SEMI_AUTOMATED" } });
  const result = await service.processEligibleApprovals({ userId: "user-1" });

  assert.equal(result.attempted, 0);
  assert.equal(calls.executions.length, 0);
  assert.equal(calls.queries.length, 0);
});

test("full automation persists only auto-ready or blocked routes for audit", () => {
  assert.equal(
    shouldCreateApproval(
      { execution_route: { route: "READY_FOR_AUTO_EXECUTION" } },
      "FULL_AUTOMATION"
    ),
    true
  );
  assert.equal(
    shouldCreateApproval(
      { execution_route: { route: "BLOCKED" } },
      "FULL_AUTOMATION"
    ),
    true
  );
  assert.equal(
    shouldCreateApproval(
      { execution_route: { route: "REQUEST_APPROVAL" } },
      "FULL_AUTOMATION"
    ),
    false
  );
});
