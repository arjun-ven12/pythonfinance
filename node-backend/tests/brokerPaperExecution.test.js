const assert = require("node:assert/strict");
const test = require("node:test");
const createBrokerPaperExecutionService = require("../features/broker/services/brokerPaperExecution.service");

function createRepository(state) {
  return {
    listOrders: async () => state.orders,
    listFills: async () => state.fills,
    getOrderById: async (_userId, id) => state.orders.find((order) => order.id === id) || null,
    findByApprovalId: async (_userId, approvalId) =>
      state.orders.find((order) => order.approvalId === approvalId) || null,
    findByBrokerOrderId: async (_userId, brokerOrderId) =>
      state.orders.find((order) => order.brokerOrderId === brokerOrderId) || null,
    findByClientOrderId: async (_userId, clientOrderId) =>
      state.orders.find((order) => order.clientOrderId === clientOrderId) || null,
    createSubmittedOrder: async (_tx, payload) => {
      const created = { id: `order-${state.orders.length + 1}`, fills: [], events: [], ...payload };
      state.orders.push(created);
      return created;
    },
    appendEvent: async (_tx, _userId, brokerOrderId, eventType, payload) => {
      state.events.push({ brokerOrderId, eventType, payload });
      return state.events.at(-1);
    },
    updateOrder: async (_tx, _userId, id, data) => {
      const index = state.orders.findIndex((order) => order.id === id);
      if (index === -1) throw new Error("Broker order not found for update.");
      state.updateCount = (state.updateCount || 0) + 1;
      state.orders[index] = { ...state.orders[index], ...data };
      return {
        ...state.orders[index],
        fills: state.fills.filter((fill) => fill.brokerOrderId === id),
        events: state.events.filter((event) => event.brokerOrderId === id),
      };
    },
    upsertFill: async (_tx, _userId, payload) => {
      const fill = { id: `fill-${state.fills.length + 1}`, ...payload };
      if (payload.executionId) {
        const existingIndex = state.fills.findIndex((item) => item.executionId === payload.executionId);
        if (existingIndex >= 0) {
          state.fills[existingIndex] = { ...state.fills[existingIndex], ...fill };
          return state.fills[existingIndex];
        }
      }
      state.fills.push(fill);
      return fill;
    },
  };
}

function createPrismaStub() {
  return {
    run: async (operation) =>
      operation({
        $transaction: async (callback) => callback({}),
      }),
  };
}

function createApproval(overrides = {}) {
  return {
    id: "approval-1",
    userId: "user-1",
    status: "APPROVED",
    symbol: "AAPL",
    side: "BUY",
    quantity: 5,
    entryPrice: 100,
    stopLoss: 95,
    takeProfit: 110,
    decisionNote: null,
    ...overrides,
  };
}

function createService(overrides = {}) {
  const state = {
    orders: [],
    fills: [],
    events: [],
    updateCount: 0,
  };
  const approval = overrides.approval || createApproval();
  const persistCalls = [];
  const invalidatedUsers = [];
  const adapter = {
    provider: "MOOMOO",
    getMarketData: async () => ({ marketData: { close: 101 } }),
    previewOrder: async () => ({ preview: { estimatedTotal: 505 } }),
    placeOrder: async () => ({
      order: {
        brokerOrderId: "ibkr-1",
        clientOrderId: "cid-1",
        status: "Submitted",
      },
    }),
    getOrderStatus: async () => ({
      order: {
        brokerOrderId: "ibkr-1",
        clientOrderId: "cid-1",
        status: "Filled",
      },
    }),
    getExecutions: async () => ({
      fills: [
        {
          executionId: "exec-1",
          symbol: "AAPL",
          side: "BUY",
          quantity: 5,
          price: 100,
          commission: 1,
          filledAt: new Date().toISOString(),
        },
      ],
    }),
    cancelOrder: async () => ({ order: { status: "Cancelled" } }),
    ...overrides.adapter,
  };

  const service = createBrokerPaperExecutionService({
    getAdapterForUser: async () => adapter,
    brokerOrdersRepository: createRepository(state),
    getApprovalRequestById: async (id) => (id === approval.id ? approval : null),
    getRequestOrderPayload: (request) => ({
      orderType: "LIMIT",
      limitPrice: request.entryPrice,
    }),
    liveExecutionGuard: {
      assertLiveExecutionAllowed: async () => ({ allowed: true }),
      ...overrides.liveExecutionGuard,
    },
    invalidateBrokerAccountCache: async (userId) => {
      invalidatedUsers.push(userId);
    },
    persistPaperExecutionResult: async (...args) => {
      persistCalls.push(args);
      return {
        paper_execution: args[2],
      };
    },
    prisma: createPrismaStub(),
    runPreTradeAnalysis: async () => ({
      allow_trade: true,
      safety_violations: [],
      upcoming_events: [],
      news_reasoning: {},
    }),
    updateApprovalRequestRecord: async () => approval,
    ...overrides.dependencies,
  });

  return { approval, invalidatedUsers, persistCalls, service, state };
}

test("cannot place IBKR paper order without approved approval", async () => {
  const { service } = createService({
    approval: createApproval({ status: "PENDING" }),
  });

  await assert.rejects(
    () => service.previewApproval("user-1", "approval-1"),
    /must be APPROVED/i
  );
});

test("cannot place IBKR paper order if IBKR account is live", async () => {
  const { service } = createService({
    adapter: {
      previewOrder: async () => {
        throw Object.assign(new Error("Broker reports a non-paper account. Paper broker execution is blocked."), {
          statusCode: 403,
        });
      },
    },
  });

  await assert.rejects(
    () => service.previewApproval("user-1", "approval-1"),
    /non-paper account/i
  );
});

test("duplicate submit blocked", async () => {
  const { service, state } = createService();
  state.orders.push({
    id: "existing-order",
    approvalId: "approval-1",
    clientOrderId: "MOOMOO-USER-APPR-ABCD",
    status: "SUBMITTED",
  });

  await assert.rejects(
    () => service.previewApproval("user-1", "approval-1"),
    /already exists for this approval/i
  );
});

test("filled broker orders also block duplicate execution retries", async () => {
  const { service, state } = createService();
  state.orders.push({
    id: "filled-order",
    approvalId: "approval-1",
    brokerOrderId: "broker-1",
    clientOrderId: "MOOMOO-USER-APPR-FILLED",
    status: "FILLED",
  });

  await assert.rejects(
    () => service.executeApproval("user-1", "approval-1", { confirmSubmit: false }),
    /already exists for this approval/i
  );
});

test("market orders with zero limit price still expose preview reference price for display", async () => {
  const { service, state } = createService();
  state.orders.push({
    id: "market-order-1",
    approvalId: "approval-2",
    brokerOrderId: "broker-market-1",
    clientOrderId: "cid-market-1",
    symbol: "AMD",
    side: "BUY",
    orderType: "MARKET",
    quantity: 1,
    filledQuantity: 0,
    remainingQuantity: 1,
    limitPrice: 0,
    status: "SUBMITTED",
    metadata: {
      preview: {
        referencePrice: 366.46,
      },
    },
  });

  const [order] = await service.listOrders("user-1");
  assert.equal(order.limitPrice, null);
  assert.equal(order.displayLimitPrice, 366.46);
});

test("broker paper execution runs pre-trade analysis in simulation mode", async () => {
  let receivedPayload = null;
  const { service } = createService({
    dependencies: {
      runPreTradeAnalysis: async (_userId, payload) => {
        receivedPayload = payload;
        return {
          allow_trade: true,
          safety_violations: [],
          upcoming_events: [],
          news_reasoning: {},
        };
      },
    },
  });

  await service.previewApproval("user-1", "approval-1");

  assert.equal(receivedPayload?.simulationMode, true);
});

test("broker paper execution exposes override eligibility and block reason", async () => {
  let updatedPayload = null;
  const { service } = createService({
    approval: createApproval({
      raw: {
        strategyVersionId: "strategy-version-1",
        strategy_audit: {
          strategy_name: "Momentum Lab",
        },
      },
      preTradeAnalysisJson: {
        strategyVersionId: "strategy-version-1",
        strategy_name: "Momentum Lab",
      },
    }),
    dependencies: {
      runPreTradeAnalysis: async () => ({
        allow_trade: false,
        explanation: "Signal confidence is below the preferred threshold.",
        safety_violations: ["Signal confidence is below preferred threshold."],
        upcoming_events: [],
        news_reasoning: {},
      }),
      updateApprovalRequestRecord: async (_id, payload) => {
        updatedPayload = payload;
        return { id: "approval-1", ...payload };
      },
    },
  });

  await assert.rejects(
    () => service.previewApproval("user-1", "approval-1"),
    (error) => {
      assert.equal(error.overrideEligible, true);
      assert.equal(error.blockReason, "Signal confidence is below the preferred threshold.");
      assert.equal(updatedPayload?.preTradeAnalysisJson?.strategyVersionId, "strategy-version-1");
      assert.equal(updatedPayload?.preTradeAnalysisJson?.strategy?.versionId, "strategy-version-1");
      return true;
    }
  );
});

test("broker paper execution allows manual override for analysis blocks", async () => {
  const { persistCalls, service } = createService({
    dependencies: {
      runPreTradeAnalysis: async () => ({
        allow_trade: false,
        explanation: "Sector concentration is elevated.",
        safety_violations: ["Sector concentration is elevated."],
        upcoming_events: [],
        news_reasoning: {},
      }),
    },
  });

  const preview = await service.executeApproval("user-1", "approval-1", {
    confirmSubmit: false,
    manualOverride: true,
  });
  assert.equal(preview.requiresConfirmation, true);

  const submitted = await service.executeApproval("user-1", "approval-1", {
    confirmSubmit: true,
    manualOverride: true,
  });

  assert.equal(persistCalls.length, 1);
  assert.equal(submitted.manualOverride, true);
  assert.equal(submitted.blockReason, "Sector concentration is elevated.");
});

test("fills write paper ledger entries through persistPaperExecutionResult", async () => {
  const { invalidatedUsers, persistCalls, service, state } = createService();

  const preview = await service.executeApproval("user-1", "approval-1", {
    confirmSubmit: false,
  });
  assert.equal(preview.requiresConfirmation, true);

  const submitted = await service.executeApproval("user-1", "approval-1", {
    confirmSubmit: true,
  });

  assert.equal(state.orders.length, 1);
  assert.equal(persistCalls.length, 1);
  assert.equal(submitted.brokerOrder.status, "FILLED");
  assert.deepEqual(invalidatedUsers, ["user-1"]);
});

test("imports broker-only orders into local broker tracking", async () => {
  const { service, state } = createService({
    adapter: {
      getOrderStatus: async () => ({
        order: {
          brokerOrderId: "2964408",
          clientOrderId: null,
          symbol: "MU",
          side: "BUY",
          orderType: "LIMIT",
          status: "SUBMITTED",
          quantity: 10,
          limitPrice: 125.5,
          createdAt: new Date().toISOString(),
        },
      }),
      getExecutions: async () => ({ fills: [] }),
    },
  });

  const result = await service.importExternalOrder("user-1", {
    brokerOrderId: "2964408",
    symbol: "MU",
  });

  assert.equal(result.imported, true);
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].brokerOrderId, "2964408");
  assert.equal(state.orders[0].symbol, "MU");
  assert.match(state.orders[0].clientOrderId, /^IMPORTED-MOOMOO-/);
});

test("broker order synchronization upserts broker status into local tracking", async () => {
  const { invalidatedUsers, service, state } = createService({
    adapter: {
      getOrders: async () => ({
        orders: [
          {
            brokerOrderId: "broker-1",
            clientOrderId: "CID-1",
            symbol: "AMD",
            side: "BUY",
            orderType: "LIMIT",
            status: "CANCELLED",
            quantity: 5,
            filledQuantity: 1,
            remainingQuantity: 0,
            limitPrice: 150,
            createdAt: "2026-07-06T01:00:00.000Z",
            updatedAt: "2026-07-06T01:05:00.000Z",
          },
          {
            brokerOrderId: "broker-2",
            clientOrderId: null,
            symbol: "NVDA",
            side: "SELL",
            orderType: "LIMIT",
            status: "EXPIRED",
            quantity: 2,
            filledQuantity: 0,
            remainingQuantity: 0,
            limitPrice: 160,
            createdAt: "2026-07-06T02:00:00.000Z",
            updatedAt: "2026-07-06T02:05:00.000Z",
          },
        ],
      }),
    },
  });

  state.orders.push({
    id: "order-1",
    userId: "user-1",
    broker: "MOOMOO",
    brokerOrderId: "broker-1",
    clientOrderId: "CID-1",
    mode: "PAPER_BROKER",
    symbol: "AMD",
    side: "BUY",
    orderType: "LIMIT",
    quantity: 5,
    filledQuantity: 0,
    remainingQuantity: 5,
    status: "SUBMITTED",
    submittedAt: new Date("2026-07-06T01:00:00.000Z"),
    lastUpdatedAt: new Date("2026-07-06T01:00:01.000Z"),
    metadata: {},
  });

  const result = await service.synchronizeOrders("user-1", {
    source: "test_sync",
  });

  assert.equal(result.orders.length, 2);
  assert.equal(state.orders.length, 2);
  assert.equal(state.orders[0].status, "CANCELLED");
  assert.equal(state.orders[0].filledQuantity, 1);
  assert.equal(state.orders[0].remainingQuantity, 0);
  assert.equal(state.orders[1].status, "EXPIRED");
  assert.match(state.orders[1].clientOrderId, /^IMPORTED-MOOMOO-/);
  assert.deepEqual(invalidatedUsers, ["user-1"]);
});

test("broker order synchronization falls back to direct broker status for missing active orders", async () => {
  const { service, state } = createService({
    adapter: {
      getOrders: async () => ({ orders: [] }),
      getOrderStatus: async () => ({
        order: {
          brokerOrderId: "broker-1",
          clientOrderId: "CID-1",
          symbol: "AAPL",
          side: "BUY",
          orderType: "LIMIT",
          status: "FILLED",
          quantity: 5,
          filledQuantity: 5,
          remainingQuantity: 0,
          limitPrice: 100,
          createdAt: "2026-07-06T03:00:00.000Z",
          updatedAt: "2026-07-06T03:05:00.000Z",
        },
      }),
    },
  });

  state.orders.push({
    id: "order-1",
    userId: "user-1",
    broker: "MOOMOO",
    brokerOrderId: "broker-1",
    clientOrderId: "CID-1",
    mode: "PAPER_BROKER",
    symbol: "AAPL",
    side: "BUY",
    orderType: "LIMIT",
    quantity: 5,
    filledQuantity: 0,
    remainingQuantity: 5,
    status: "SUBMITTED",
    submittedAt: new Date("2026-07-06T03:00:00.000Z"),
    lastUpdatedAt: new Date("2026-07-06T03:00:01.000Z"),
    metadata: {},
  });

  await service.synchronizeOrders("user-1", {
    source: "test_direct_status",
  });

  assert.equal(state.orders[0].status, "FILLED");
  assert.equal(state.orders[0].filledQuantity, 5);
  assert.equal(state.orders[0].remainingQuantity, 0);
  assert.ok(state.orders[0].lastSyncedAt);
});

test("broker order synchronization avoids duplicate writes and cache invalidation when nothing changed", async () => {
  const { invalidatedUsers, service, state } = createService({
    adapter: {
      getOrders: async () => ({
        orders: [
          {
            brokerOrderId: "broker-1",
            clientOrderId: "CID-1",
            symbol: "AAPL",
            side: "BUY",
            orderType: "LIMIT",
            status: "SUBMITTED",
            quantity: 5,
            filledQuantity: 0,
            remainingQuantity: 5,
            limitPrice: 100,
            createdAt: "2026-07-06T03:00:00.000Z",
            updatedAt: "2026-07-06T03:05:00.000Z",
          },
        ],
      }),
      getOrderStatus: async () => null,
    },
  });

  state.orders.push({
    id: "order-1",
    userId: "user-1",
    broker: "MOOMOO",
    brokerOrderId: "broker-1",
    clientOrderId: "CID-1",
    mode: "PAPER_BROKER",
    symbol: "AAPL",
    side: "BUY",
    orderType: "LIMIT",
    quantity: 5,
    filledQuantity: 0,
    remainingQuantity: 5,
    limitPrice: 100,
    status: "SUBMITTED",
    submittedAt: new Date("2026-07-06T03:00:00.000Z"),
    lastUpdatedAt: new Date("2026-07-06T03:05:00.000Z"),
    metadata: {
      latestStatus: {
        brokerOrderId: "broker-1",
        clientOrderId: "CID-1",
        symbol: "AAPL",
        side: "BUY",
        orderType: "LIMIT",
        status: "SUBMITTED",
        quantity: 5,
        filledQuantity: 0,
        remainingQuantity: 5,
        limitPrice: 100,
        createdAt: "2026-07-06T03:00:00.000Z",
        updatedAt: "2026-07-06T03:05:00.000Z",
      },
      synchronizedFromBroker: true,
    },
  });

  const result = await service.synchronizeOrders("user-1", {
    source: "test_noop_sync",
  });

  assert.equal(result.stats.created, 0);
  assert.equal(result.stats.updated, 0);
  assert.equal(result.stats.unchanged, 1);
  assert.equal(state.updateCount, 0);
  assert.equal(state.events.length, 0);
  assert.deepEqual(invalidatedUsers, []);
});

test("broker order sync uses resolved runtime account config for adapter status calls", async () => {
  const statusConfigs = [];
  const executionConfigs = [];
  const { service, state } = createService({
    adapter: {
      getOrders: async () => ({ orders: [] }),
      getOrderStatus: async (_userId, _payload, input = {}) => {
        statusConfigs.push(input);
        return {
          order: {
            brokerOrderId: "broker-1",
            clientOrderId: "CID-1",
            symbol: "AAPL",
            side: "BUY",
            orderType: "LIMIT",
            status: "SUBMITTED",
            quantity: 5,
            filledQuantity: 0,
            remainingQuantity: 5,
            limitPrice: 100,
            createdAt: "2026-07-06T03:00:00.000Z",
            updatedAt: "2026-07-06T03:05:00.000Z",
          },
        };
      },
      getExecutions: async (_userId, _payload, input = {}) => {
        executionConfigs.push(input);
        return { fills: [] };
      },
    },
    dependencies: {
      readResolvedBrokerConfigForUser: async () => ({
        provider: "MOOMOO",
        executionMode: "PAPER_BROKER",
        config: {
          host: "127.0.0.1",
          port: 11111,
          tradeEnv: "SIMULATE",
          accountId: "1832345",
        },
      }),
    },
  });

  state.orders.push({
    id: "order-1",
    userId: "user-1",
    broker: "MOOMOO",
    brokerOrderId: "broker-1",
    clientOrderId: "CID-1",
    mode: "PAPER_BROKER",
    symbol: "AAPL",
    side: "BUY",
    orderType: "LIMIT",
    quantity: 5,
    filledQuantity: 0,
    remainingQuantity: 5,
    status: "SUBMITTED",
    submittedAt: new Date("2026-07-06T03:00:00.000Z"),
    lastUpdatedAt: new Date("2026-07-06T03:00:01.000Z"),
    metadata: {},
  });

  await service.syncOrder("user-1", "order-1");

  assert.equal(statusConfigs[0]?.accountId, "1832345");
  assert.equal(statusConfigs[0]?.tradeEnv, "SIMULATE");
  assert.equal(executionConfigs[0]?.accountId, "1832345");
  assert.equal(executionConfigs[0]?.tradeEnv, "SIMULATE");
});

test("manual broker order sync promotes missing active orders into terminal synced statuses", async () => {
  const { service, state } = createService({
    adapter: {
      getOrders: async () => ({
        orders: [
          {
            brokerOrderId: "broker-1",
            clientOrderId: "CID-1",
            symbol: "AAPL",
            status: "CANCELLED",
            quantity: 5,
            filledQuantity: 0,
            remainingQuantity: 0,
            updatedAt: new Date("2026-07-06T03:05:00.000Z").toISOString(),
          },
        ],
      }),
      getOrderStatus: async () => ({
        order: {
          brokerOrderId: "broker-1",
          clientOrderId: "CID-1",
          symbol: "AAPL",
          status: "SUBMITTED",
        },
      }),
      getExecutions: async () => ({ fills: [] }),
    },
  });

  state.orders.push({
    id: "order-1",
    userId: "user-1",
    broker: "MOOMOO",
    brokerOrderId: "broker-1",
    clientOrderId: "CID-1",
    mode: "PAPER_BROKER",
    symbol: "AAPL",
    side: "BUY",
    orderType: "LIMIT",
    quantity: 5,
    filledQuantity: 0,
    remainingQuantity: 5,
    status: "SUBMITTED",
    submittedAt: new Date("2026-07-06T03:00:00.000Z"),
    lastUpdatedAt: new Date("2026-07-06T03:00:01.000Z"),
    metadata: {},
  });

  const result = await service.syncOrder("user-1", "order-1");

  assert.equal(result.brokerOrder.status, "CANCELLED");
  assert.equal(state.orders[0].status, "CANCELLED");
  assert.equal(state.orders[0].remainingQuantity, 0);
});

test("manual reconciliation can mark a tracked missing broker order as cancelled", async () => {
  const { service, state } = createService();

  state.orders.push({
    id: "order-1",
    userId: "user-1",
    broker: "MOOMOO",
    brokerOrderId: "broker-1",
    clientOrderId: "CID-1",
    mode: "PAPER_BROKER",
    symbol: "AAPL",
    side: "BUY",
    orderType: "LIMIT",
    quantity: 5,
    filledQuantity: 0,
    remainingQuantity: 5,
    status: "SUBMITTED",
    submittedAt: new Date("2026-07-06T03:00:00.000Z"),
    lastUpdatedAt: new Date("2026-07-06T03:00:01.000Z"),
    metadata: {},
  });

  const result = await service.markOrderCancelled("user-1", "order-1", {
    source: "broker_reconciliation_manual_cancel",
    reason: "No longer open in broker.",
  });

  assert.equal(result.status, "CANCELLED");
  assert.equal(state.orders[0].status, "CANCELLED");
  assert.equal(state.orders[0].remainingQuantity, 0);
  assert.equal(
    state.events.some((event) => event.eventType === "MARKED_CANCELLED_MANUALLY"),
    true
  );
});
