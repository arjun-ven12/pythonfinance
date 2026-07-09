const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const createMoomooAdapter = require("../features/broker/adapters/moomoo/moomooAdapter");
const {
  createBrokerAdapterRegistry,
} = require("../features/broker/services/brokerAdapterRegistry.service");

function createBridgeRunner() {
  return async (command, _config, payload) => {
    if (command === "test_connection") {
      return {
        ok: true,
        connected: true,
        opendReachable: true,
        protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
        gatewayRunning: true,
        loggedIn: true,
        marketDataAvailable: true,
        accountLoaded: true,
        accountsFound: 1,
        accountListResult: "OK",
        paperMode: true,
        orderPermission: true,
        selectedAccount: {
          accountId: "12345",
          accountType: "Margin",
          tradeEnv: "SIMULATE",
          market: "US",
          displayName: "Margin · SIMULATE · 12345",
        },
        fundsLoaded: true,
      };
    }

    if (command === "get_accounts") {
      return {
        ok: true,
        protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
        selectedAccountId: "12345",
        accounts: [
          {
            accountId: "12345",
            accountType: "Margin",
            tradeEnv: "SIMULATE",
            market: "US",
            displayName: "Margin · SIMULATE · 12345",
          },
        ],
      };
    }

    if (command === "get_funds") {
      return {
        ok: true,
        protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
        account: {
          accountId: "12345",
          accountType: "Margin",
          tradeEnv: "SIMULATE",
          market: "US",
        },
        funds: {
          cash: 120000,
          power: 300000,
          available_funds: 118500,
          total_assets: 150000,
          initial_margin: 10000,
          currency: "USD",
        },
      };
    }

    if (command === "get_positions") {
      return {
        ok: true,
        protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
        positions: [
          {
            code: "US.AMD",
            position_market: "US",
            qty: 12,
            average_cost: 144.5,
            market_val: 1800,
            nominal_price: 150,
            position_side: "LONG",
            currency: "USD",
            position_id: "pos-1",
          },
        ],
      };
    }

    if (command === "get_open_orders") {
      return {
        ok: true,
        protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
        orders: [
          {
            order_id: "moomoo-1",
            remark: "CID-1",
            code: "US.AMD",
            trd_side: "BUY",
            order_type: "NORMAL",
            order_status: "SUBMITTED",
            qty: 5,
            dealt_qty: 0,
            price: 150,
            dealt_avg_price: 0,
            create_time: "2026-07-02 10:00:00",
            update_time: "2026-07-02 10:00:01",
          },
          {
            order_id: "moomoo-2",
            remark: "CID-2",
            code: "US.AMD",
            trd_side: "BUY",
            order_type: "NORMAL",
            order_status: "CANCELLED_ALL",
            qty: 5,
            dealt_qty: 0,
            price: 151,
            dealt_avg_price: 0,
            create_time: "2026-07-02 10:02:00",
            update_time: "2026-07-02 10:02:05",
          },
        ],
      };
    }

    if (command === "get_orders") {
      return {
        ok: true,
        protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
        orders: [
          {
            order_id: "moomoo-1",
            remark: "CID-1",
            code: "US.AMD",
            trd_side: "BUY",
            order_type: "NORMAL",
            order_status: "SUBMITTED",
            qty: 5,
            dealt_qty: 1,
            price: 150,
            dealt_avg_price: 150,
            create_time: "2026-07-02 10:00:00",
            update_time: "2026-07-02 10:00:01",
          },
          {
            order_id: "moomoo-2",
            remark: "CID-2",
            code: "US.AMD",
            trd_side: "BUY",
            order_type: "NORMAL",
            order_status: "EXPIRED",
            qty: 5,
            dealt_qty: 0,
            price: 151,
            dealt_avg_price: 0,
            create_time: "2026-07-02 10:02:00",
            update_time: "2026-07-02 10:02:05",
          },
        ],
      };
    }

    if (command === "get_quote") {
      return {
        ok: true,
        protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
        record: {
          last_price: 150.5,
          bid_price: 150.4,
          ask_price: 150.6,
          open_price: 149.8,
          high_price: 151.2,
          low_price: 148.9,
          prev_close_price: 149,
          volume: 1000000,
          update_time: "2026-07-02 10:05:00",
          suspension: false,
        },
      };
    }

    throw new Error(`Unexpected command: ${command} for ${payload?.symbol || "n/a"}`);
  };
}

test("moomoo adapter uses the python bridge and normalizes account data", async () => {
  const adapter = createMoomooAdapter({
    buildConfig: (input = {}) => ({
      provider: "MOOMOO",
      host: "127.0.0.1",
      port: 11111,
      transport: "websocket",
      securityFirm: "MOOMOO",
      defaultTrdEnv: "SIMULATE",
      defaultAccId: "12345",
      market: "US",
      websocketSsl: false,
      websocketKey: "",
      tradingPasswordMd5: "",
      requestTimeoutMs: 500,
      ...input,
    }),
    bridgeRunner: createBridgeRunner(),
    now: () => new Date("2026-07-02T10:05:00.000Z"),
  });

  const health = await adapter.getHealth("user-1");
  assert.equal(health.provider, "MOOMOO");
  assert.equal(health.connected, true);
  assert.equal(health.paperMode, true);
  assert.equal(health.accountLoaded, true);
  assert.equal(health.marketDataAvailable, true);
  assert.equal(health.protocolUsed, "PYTHON_BRIDGE_TCP_SDK");

  const summary = await adapter.getAccountSummary("user-1");
  assert.equal(summary.available, true);
  assert.equal(summary.cash, 120000);
  assert.equal(summary.buyingPower, 300000);
  assert.equal(summary.availableFunds, 118500);
  assert.equal(summary.accountType, "Paper");
  assert.equal(summary.positions[0].symbol, "AMD");
  assert.equal(summary.openOrders.length, 1);
  assert.equal(summary.openOrders[0].brokerOrderId, "moomoo-1");
  assert.equal(summary.openOrders[0].status, "SUBMITTED");

  const preview = await adapter.previewOrder("user-1", {
    symbol: "AMD",
    side: "BUY",
    orderType: "MARKET",
    quantity: 10,
  });
  assert.equal(preview.preview.mode, "SIMULATE_READY");
  assert.equal(preview.preview.referencePrice, 150.5);

  const orders = await adapter.getOrders("user-1");
  assert.equal(orders.orders.length, 2);
  assert.equal(orders.orders[0].remainingQuantity, 4);
  assert.equal(orders.orders[1].status, "EXPIRED");
});

test("moomoo adapter tolerates SDK stdout noise before bridge JSON", async () => {
  const spawnProcess = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: () => {} };
    child.kill = () => {};

    process.nextTick(() => {
      child.stdout.emit(
        "data",
        Buffer.from(
          [
            "OpenD connection established",
            JSON.stringify({
              ok: true,
              connected: true,
              opendReachable: true,
              protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
              gatewayRunning: true,
              loggedIn: true,
              marketDataAvailable: true,
              accountLoaded: true,
              accountsFound: 1,
              accountListResult: "OK",
              paperMode: true,
              orderPermission: true,
              selectedAccount: "12345",
              fundsLoaded: true,
            }),
          ].join("\n")
        )
      );
      child.emit("close", 0);
    });

    return child;
  };

  const adapter = createMoomooAdapter({
    buildConfig: (input = {}) => ({
      provider: "MOOMOO",
      host: "127.0.0.1",
      port: 11111,
      transport: "python_bridge",
      securityFirm: "MOOMOO",
      defaultTrdEnv: "SIMULATE",
      defaultAccId: "12345",
      market: "US",
      websocketSsl: false,
      websocketKey: "",
      tradingPasswordMd5: "",
      requestTimeoutMs: 500,
      ...input,
    }),
    getPythonPath: () => "python3",
    spawnProcess,
  });

  const health = await adapter.getHealth("user-1");

  assert.equal(health.connected, true);
  assert.equal(health.protocolUsed, "PYTHON_BRIDGE_TCP_SDK");
  assert.equal(health.accountsFound, 1);
});

test("moomoo adapter ignores blank fund fields and falls back to usable values", async () => {
  const adapter = createMoomooAdapter({
    buildConfig: (input = {}) => ({
      provider: "MOOMOO",
      host: "127.0.0.1",
      port: 11111,
      transport: "python_bridge",
      securityFirm: "MOOMOO",
      defaultTrdEnv: "SIMULATE",
      defaultAccId: "12345",
      market: "US",
      websocketSsl: false,
      websocketKey: "",
      tradingPasswordMd5: "",
      requestTimeoutMs: 500,
      ...input,
    }),
    bridgeRunner: async (command) => {
      if (command === "get_accounts") {
        return {
          ok: true,
          protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
          selectedAccountId: "12345",
          accounts: [
            {
              accountId: "12345",
              accountType: "Margin",
              tradeEnv: "SIMULATE",
              market: "US",
              displayName: "Margin · SIMULATE · 12345",
            },
          ],
        };
      }

      if (command === "get_funds") {
        return {
          ok: true,
          protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
          account: {
            accountId: "12345",
            accountType: "Margin",
            tradeEnv: "SIMULATE",
            market: "US",
          },
          funds: {
            cash: "",
            us_cash: 995990.65,
            power: "",
            net_cash_power: "",
            max_power_short: 1991981.3,
            total_assets: "",
            net_assets: 998949.11,
            currency: "USD",
          },
        };
      }

      if (command === "get_positions") {
        return { ok: true, protocolUsed: "PYTHON_BRIDGE_TCP_SDK", positions: [] };
      }

      if (command === "get_open_orders") {
        return { ok: true, protocolUsed: "PYTHON_BRIDGE_TCP_SDK", orders: [] };
      }

      throw new Error(`Unexpected command: ${command}`);
    },
    now: () => new Date("2026-07-05T12:00:00.000Z"),
  });

  const summary = await adapter.getAccountSummary("user-1");
  assert.equal(summary.cash, 995990.65);
  assert.equal(summary.buyingPower, 1991981.3);
  assert.equal(summary.availableFunds, 995990.65);
  assert.equal(summary.equity, 998949.11);
});

test("moomoo adapter normalizes composite account ids and explains missing funds", async () => {
  const bridgeCalls = [];
  const adapter = createMoomooAdapter({
    bridgeRunner: async (command, config) => {
      bridgeCalls.push({ command, config });
      if (command === "get_accounts") {
        return {
          ok: true,
          protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
          accounts: [
            {
              accountId: "1832345",
              accountType: "Margin",
              tradeEnv: "REAL",
              market: "US",
            },
          ],
        };
      }
      if (command === "get_funds") {
        return {
          ok: true,
          protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
          account: {
            accountId: "1832345",
            accountType: "Margin",
            tradeEnv: "REAL",
            market: "US",
          },
          funds: {},
          fundsLoaded: false,
          fundsResult: "No account permission",
        };
      }
      if (command === "get_positions") {
        return { ok: true, protocolUsed: "PYTHON_BRIDGE_TCP_SDK", positions: [] };
      }
      if (command === "get_open_orders") {
        return { ok: true, protocolUsed: "PYTHON_BRIDGE_TCP_SDK", orders: [] };
      }
      throw new Error(`Unexpected command: ${command}`);
    },
  });

  const summary = await adapter.getAccountSummary("user-1", {
    accountId: "REAL:1832345",
  });

  assert.equal(bridgeCalls[0].config.defaultAccId, "1832345");
  assert.equal(bridgeCalls[0].config.defaultTrdEnv, "REAL");
  assert.equal(summary.available, false);
  assert.match(summary.reason, /funds were not returned/i);
  assert.equal(summary.cash, null);
  assert.equal(summary.accountType, "Live");
});

test("moomoo adapter returns a partial account summary when open-order refresh fails", async () => {
  const adapter = createMoomooAdapter({
    bridgeRunner: async (command) => {
      if (command === "get_accounts") {
        return {
          ok: true,
          protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
          accounts: [
            {
              accountId: "12345",
              accountType: "Margin",
              tradeEnv: "SIMULATE",
              market: "US",
            },
          ],
        };
      }
      if (command === "get_funds") {
        return {
          ok: true,
          protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
          account: {
            accountId: "12345",
            accountType: "Margin",
            tradeEnv: "SIMULATE",
            market: "US",
          },
          funds: {
            cash: 995990.65,
            buying_power: 1991981.3,
            total_assets: 998949.11,
            currency: "USD",
          },
        };
      }
      if (command === "get_positions") {
        return {
          ok: true,
          protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
          positions: [
            {
              code: "US.AMD",
              qty: 2,
              average_cost: 150,
              market_val: 305,
              nominal_price: 152.5,
              position_side: "LONG",
              currency: "USD",
            },
          ],
        };
      }
      if (command === "get_open_orders") {
        throw new Error("order_list_query failed due to high frequency");
      }
      throw new Error(`Unexpected command: ${command}`);
    },
  });

  const summary = await adapter.getAccountSummary("user-1");
  assert.equal(summary.available, true);
  assert.equal(summary.cash, 995990.65);
  assert.equal(summary.positions.length, 1);
  assert.equal(summary.openOrders.length, 0);
  assert.match(summary.providerWarning, /Open-order refresh unavailable/i);
});

test("broker adapter registry defaults to MOOMOO and honors stored provider", async () => {
  const registry = createBrokerAdapterRegistry({
    adapters: {
      MOOMOO: {
        provider: "MOOMOO",
        testConnection: async () => ({}),
        getHealth: async () => ({}),
        getAccountSummary: async () => ({}),
        getPositions: async () => [],
        getOpenOrders: async () => [],
        getMarketData: async () => ({}),
        previewOrder: async () => ({}),
        placeOrder: async () => ({}),
        cancelOrder: async () => ({}),
        modifyOrder: async () => ({}),
        getOrderStatus: async () => ({}),
        getExecutions: async () => ({}),
        disconnect: async () => ({}),
      },
      IBKR: {
        provider: "IBKR",
        testConnection: async () => ({}),
        getHealth: async () => ({}),
        getAccountSummary: async () => ({}),
        getPositions: async () => [],
        getOpenOrders: async () => [],
        getMarketData: async () => ({}),
        previewOrder: async () => ({}),
        placeOrder: async () => ({}),
        cancelOrder: async () => ({}),
        modifyOrder: async () => ({}),
        getOrderStatus: async () => ({}),
        getExecutions: async () => ({}),
        disconnect: async () => ({}),
      },
    },
    prisma: {
      run: async (operation) =>
        operation({
          brokerConfig: {
            findUnique: async () => ({ provider: "IBKR" }),
          },
        }),
    },
  });

  const fallback = await registry.getAdapter();
  assert.equal(fallback.provider, "MOOMOO");

  const stored = await registry.getAdapter("user-1");
  assert.equal(stored.provider, "IBKR");
});
