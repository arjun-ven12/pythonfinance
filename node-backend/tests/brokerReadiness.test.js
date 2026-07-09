const assert = require("node:assert/strict");
const test = require("node:test");
const createIbkrAdapter = require("../features/broker/adapters/ibkrAdapter");
const createBrokerService = require("../features/broker/services/broker/broker.service");

function createAdapter(configOverrides = {}) {
  const config = {
    host: "127.0.0.1",
    port: configOverrides.mode === "live" ? 7496 : 7497,
    clientId: 11,
    mode: "paper",
    last_checked_at: null,
    last_error: null,
    last_connected: false,
    account_summary_available: false,
    ...configOverrides,
  };
  return createIbkrAdapter({
    buildIbkrConfig: (input = {}, existing = {}) => ({ ...config, ...existing, ...input }),
    getIbkrStatus: (nextConfig) => ({
      status: nextConfig.last_connected ? "CONNECTED" : nextConfig.last_error ? "ERROR" : "CONFIGURED",
      mode: nextConfig.mode,
      last_checked_at: nextConfig.last_checked_at,
      account_summary_available: nextConfig.account_summary_available,
      error: nextConfig.last_error,
    }),
    readUserIbkrConfig: async () => config,
    runIbkrBrokerAction: async () => ({
      success: true,
      available: true,
      paperConfirmed: config.mode !== "live",
      accountMode: config.mode === "live" ? "live" : "paper",
      cash: 100000,
      buyingPower: 100000,
      equity: 100000,
      currency: "USD",
      positions: [],
      openOrders: [],
      margin: null,
      managedAccounts: [config.mode === "live" ? "U1234567" : "DU1234567"],
      lastUpdated: new Date().toISOString(),
      order: { status: "Submitted" },
      fills: [],
      marketData: { close: 100 },
    }),
    runIbkrConnectionTest: async () => ({ connected: false, error: "socket unavailable" }),
  });
}

function createService(adapter, riskDashboard = {}, overrides = {}) {
  const logs = [];
  return {
    logs,
    service: createBrokerService({
      getAdapterForUser: async () => adapter,
      getProviderForUser: async () => adapter.provider || "IBKR",
      brokerOrdersRepository: overrides.brokerOrdersRepository,
      brokerConnectionLogRepository: {
        create: async (_userId, entry) => logs.push(entry),
        list: async () => logs,
      },
      buildRiskDashboardFromDatabase: async () => ({
        cashBalance: 100000,
        totalPortfolioEquity: 100000,
        openPositions: [],
        safetyViolations: [],
        ...riskDashboard,
      }),
      liveExecutionGuard: overrides.liveExecutionGuard,
    }),
  };
}

test("IBKR adapter reports connection failure as disconnected health", async () => {
  const adapter = createAdapter({ last_error: "socket unavailable" });
  const health = await adapter.getHealth("user-a");
  assert.equal(health.connected, false);
  assert.equal(health.gatewayRunning, false);
  assert.equal(health.lastError, "socket unavailable");
});

test("IBKR adapter detects paper and live mode while keeping order permissions disabled", async () => {
  const paper = await createAdapter({ mode: "paper", last_connected: true }).getHealth("user-a");
  const live = await createAdapter({ mode: "live", last_connected: true }).getHealth("user-a");
  assert.equal(paper.paperMode, true);
  assert.equal(live.paperMode, false);
  assert.equal(paper.orderPermission, false);
  assert.equal(live.orderPermission, false);
});

test("broker service classifies recovering and degraded health consistently", async () => {
  const adapter = createAdapter({ last_connected: true, account_summary_available: true });
  const { service } = createService(adapter);

  adapter.getHealth = async () => ({
    connected: false,
    opendReachable: true,
    gatewayRunning: true,
    loggedIn: false,
    accountLoaded: false,
    orderPermission: false,
    lastError: "Timed out connecting to OpenD",
  });

  const recovering = await service.getHealth("user-a");
  assert.equal(recovering.healthStatus, "Recovering");
  assert.equal(recovering.failureCategory, "TIMEOUT");

  adapter.getHealth = async () => ({
    connected: true,
    opendReachable: true,
    gatewayRunning: true,
    loggedIn: true,
    accountLoaded: true,
    orderPermission: false,
    lastError: "Trade permission is locked",
  });

  const degraded = await service.getHealth("user-a");
  assert.equal(degraded.healthStatus, "Degraded");
  assert.equal(degraded.failureCategory, "PERMISSION_OR_ACCOUNT");
});

test("broker capabilities keep market data and orders unavailable until adapter supports read-only data", async () => {
  const capabilities = await createAdapter({ last_connected: true }).getCapabilities("user-a");
  assert.equal(capabilities.canConnect, true);
  assert.equal(capabilities.canReadMarketData, true);
  assert.equal(capabilities.canPlaceOrders, false);
  assert.equal(capabilities.liveExecutionEnabled, false);
});

test("broker reconciliation calculates cash and position drift without mutating portfolio", async () => {
  const adapter = createAdapter({ last_connected: true, account_summary_available: true });
  adapter.getAccountSummary = async () => ({
    available: true,
    cash: 95000,
    equity: 100000,
    positions: [{ symbol: "AAPL", quantity: 8, averageCost: 190 }],
    openOrders: [],
  });
  const { service } = createService(adapter, {
    cashBalance: 100000,
    openPositions: [{ symbol: "AAPL", quantity: 10, averageCost: 185 }],
  });
  const reconciliation = await service.getReconciliation("user-a");
  assert.equal(reconciliation.cashDifference, -5000);
  assert.equal(reconciliation.positionDifferences[0].quantityDifference, -2);
  assert.equal(reconciliation.positionDifferences[0].averageCostDifference, 5);
  assert.notEqual(reconciliation.status, "CLEAN");
  assert.ok(reconciliation.syncScore < 100);
});

test("broker reconciliation reads paper positions and cash from risk dashboard portfolio fields", async () => {
  const adapter = createAdapter({ last_connected: true, account_summary_available: true });
  adapter.getAccountSummary = async () => ({
    available: true,
    cash: 995990.65,
    equity: 996769.97,
    positions: [
      { symbol: "AAPL", quantity: 2, averageCost: 298.01 },
      { symbol: "NVDA", quantity: 2, averageCost: 193.05 },
    ],
    openOrders: [],
  });
  const { service } = createService(adapter, {
    cashBalance: undefined,
    openPositions: undefined,
    portfolio: {
      cash: 995990.65,
      equity: 996769.97,
    },
    open_positions_risk: [
      { symbol: "AAPL", quantity: 2, avg_price: 298.01 },
      { symbol: "NVDA", quantity: 2, avg_price: 193.05 },
    ],
  });

  const reconciliation = await service.getReconciliation("user-a");
  assert.equal(reconciliation.cashDifference, 0);
  assert.equal(reconciliation.positionDifferences.length, 0);
  assert.equal(reconciliation.status, "CLEAN");
});

test("open-order drift does not reduce ledger sync score when cash and positions match", async () => {
  const adapter = createAdapter({ last_connected: true, account_summary_available: true });
  adapter.getAccountSummary = async () => ({
    available: true,
    cash: 100000,
    equity: 100000,
    positions: [{ symbol: "AAPL", quantity: 1, averageCost: 100 }],
    openOrders: [],
  });
  const { service } = createService(
    adapter,
    {
      cashBalance: 100000,
      openPositions: [{ symbol: "AAPL", quantity: 1, averageCost: 100 }],
    },
    {
      brokerOrdersRepository: {
        listOrders: async () => [
          {
            id: "order-1",
            clientOrderId: "order-1",
            brokerOrderId: "broker-1",
            symbol: "AAPL",
            status: "SUBMITTED",
          },
        ],
      },
    }
  );

  const reconciliation = await service.getReconciliation("user-a");
  assert.equal(reconciliation.cashDifference, 0);
  assert.equal(reconciliation.positionDifferences.length, 0);
  assert.equal(reconciliation.syncScore, 100);
  assert.equal(reconciliation.status, "CLEAN");
  assert.equal(reconciliation.openOrderDifferences.length, 1);
  assert.equal(reconciliation.openOrderDifferences[0].localOrderId, "order-1");
});

test("broker reconciliation scopes persisted open orders to the active provider", async () => {
  const adapter = createAdapter({ last_connected: true, account_summary_available: true });
  const repositoryCalls = [];
  adapter.getAccountSummary = async () => ({
    provider: "MOOMOO",
    available: true,
    cash: 100000,
    equity: 100000,
    positions: [{ symbol: "AAPL", quantity: 1, averageCost: 100 }],
    openOrders: [],
  });
  const { service } = createService(
    adapter,
    {
      cashBalance: 100000,
      openPositions: [{ symbol: "AAPL", quantity: 1, averageCost: 100 }],
    },
    {
      brokerOrdersRepository: {
        listOrders: async (_userId, options) => {
          repositoryCalls.push(options);
          return [];
        },
      },
    }
  );

  const reconciliation = await service.getReconciliation("user-a");
  assert.equal(reconciliation.status, "CLEAN");
  assert.deepEqual(repositoryCalls, [{ limit: 200, broker: "IBKR" }]);
});

test("expired and cancelled broker-order history is excluded from open-order drift", async () => {
  const adapter = createAdapter({ last_connected: true, account_summary_available: true });
  adapter.getAccountSummary = async () => ({
    available: true,
    cash: 100000,
    equity: 100000,
    positions: [],
    openOrders: [],
  });
  const { service } = createService(
    adapter,
    {
      cashBalance: 100000,
      openPositions: [],
    },
    {
      brokerOrdersRepository: {
        listOrders: async () => [
          {
            clientOrderId: "order-expired",
            brokerOrderId: "broker-expired",
            symbol: "GOOG",
            status: "EXPIRED",
          },
          {
            clientOrderId: "order-cancelled",
            brokerOrderId: "broker-cancelled",
            symbol: "GOOGL",
            status: "CANCELLED_ALL",
          },
        ],
      },
    }
  );

  const reconciliation = await service.getReconciliation("user-a");
  assert.equal(reconciliation.syncScore, 100);
  assert.equal(reconciliation.status, "CLEAN");
  assert.equal(reconciliation.openOrderDifferences.length, 0);
});

test("imported broker orders match live broker orders by brokerOrderId", async () => {
  const adapter = createAdapter({ last_connected: true, account_summary_available: true });
  adapter.getAccountSummary = async () => ({
    available: true,
    cash: 100000,
    equity: 100000,
    positions: [],
    openOrders: [
      {
        brokerOrderId: "2964408",
        clientOrderId: null,
        symbol: "MU",
        status: "SUBMITTED",
      },
    ],
  });
  const { service } = createService(
    adapter,
    {
      cashBalance: 100000,
      openPositions: [],
    },
    {
      brokerOrdersRepository: {
        listOrders: async () => [
          {
            clientOrderId: "IMPORTED-MOOMOO-2964408",
            brokerOrderId: "2964408",
            symbol: "MU",
            status: "SUBMITTED",
          },
        ],
      },
    }
  );

  const reconciliation = await service.getReconciliation("user-a");
  assert.equal(reconciliation.openOrderDifferences.length, 0);
});

test("preflight blocks live mode and safety violations", async () => {
  const adapter = createAdapter({ mode: "live", last_connected: true });
  const { service } = createService(adapter, {
    safetyViolations: [{ rule: "kill_switch" }],
  });
  const preflight = await service.getPreflight("user-a");
  assert.equal(preflight.overall, "BLOCKED");
  assert.equal(preflight.executionLocked, true);
  assert.ok(preflight.checks.some((check) => check.key === "paperMode" && check.status === "BLOCKED"));
});

test("broker service logs connection diagnostics and adapter refuses paper order placement", async () => {
  const adapter = createAdapter();
  const { logs, service } = createService(adapter);
  await service.testConnection("user-a", {});
  assert.equal(logs[0].action, "TEST_CONNECTION");
  assert.equal(logs[0].success, true);
  await assert.rejects(() => adapter.placePaperOrder("user-a", {}), /disabled/);
});

test("broker service retries transient account summary read failures once and preserves the successful result", async () => {
  const adapter = createAdapter({ last_connected: true, account_summary_available: true });
  const { logs, service } = createService(adapter);
  let attempts = 0;
  adapter.getAccountSummary = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("Timed out connecting to OpenD websocket");
    }
    return {
      available: true,
      cash: 100000,
      buyingPower: 200000,
      equity: 101000,
      positions: [],
      openOrders: [],
    };
  };

  const summary = await service.getAccountSummary("user-a", { forceRefresh: true });
  assert.equal(attempts, 2);
  assert.equal(summary.available, true);
  assert.equal(summary.recoveredByRetry, true);
  assert.equal(summary.retryCount, 1);
  assert.ok(
    logs.some((entry) => entry.action === "GET_ACCOUNT_SUMMARY_RETRY")
  );
});

test("placePaperOrder attaches fresh preflight details when execution guard blocks", async () => {
  const adapter = createAdapter({ last_connected: true, account_summary_available: true });
  adapter.provider = "MOOMOO";
  adapter.getHealth = async () => ({
    connected: true,
    paperMode: true,
    gatewayRunning: true,
    accountLoaded: true,
    marketDataAvailable: true,
    orderPermission: true,
    lastHeartbeat: new Date().toISOString(),
  });
  adapter.getCapabilities = async () => ({
    canConnect: true,
    canReadAccount: true,
    canReadMarketData: true,
    canPlaceOrders: true,
  });
  adapter.getAccountSummary = async () => ({
    available: true,
    cash: 100000,
    equity: 100000,
    positions: [],
    openOrders: [],
  });

  const blockedError = new Error("Paper broker execution blocked: broker is not connected.");
  blockedError.statusCode = 403;
  blockedError.details = {
    health: {
      connected: false,
    },
  };

  const { service } = createService(adapter, {
    safetyViolations: [],
  }, {
    liveExecutionGuard: {
      assertLiveExecutionAllowed: async () => {
        throw blockedError;
      },
    },
  });

  await assert.rejects(
    () =>
      service.placePaperOrder("user-a", {
        symbol: "AMD",
        side: "BUY",
        quantity: 1,
        brokerExecutionMode: "PAPER_BROKER",
      }),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.message, blockedError.message);
      assert.ok(error.preflight);
      assert.equal(error.preflight.overall, "PASS");
      assert.equal(error.preflight.executionLocked, false);
      return true;
    }
  );
});
