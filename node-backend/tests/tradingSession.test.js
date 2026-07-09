const assert = require("node:assert/strict");
const test = require("node:test");
const createTradingSessionService = require("../features/trading/services/tradingSession.service");

function createService(overrides = {}) {
  return createTradingSessionService({
    brokerConfigService: {
      readResolvedBrokerConfig: async () => ({
        provider: "INTERNAL_PAPER",
        executionMode: "INTERNAL_PAPER",
        config: {},
      }),
    },
    brokerPaperExecutionService: {},
    brokerService: {},
    getPortfolioForUser: async () => ({
      ledgerState: {
        cash: 99000,
        equity: 100500,
        currency: "USD",
        positions: {
          AAPL: { symbol: "AAPL", quantity: 3, avg_price: 190 },
        },
        equity_history: [{ timestamp: "2026-07-06T00:00:00.000Z", equity: 100500 }],
        fees_paid: 1.25,
      },
    }),
    tradeRepository: {
      list: async () => [
        {
          symbol: "AAPL",
          quantity: 1,
          fill_price: 190,
          fee: 1.25,
          filled_at: "2026-07-06T00:00:00.000Z",
        },
      ],
    },
    ...overrides,
  });
}

test("trading session returns Internal Paper as the selected provider", async () => {
  const service = createService();

  const session = await service.getTradingSession("user-a");

  assert.equal(session.provider, "INTERNAL_PAPER");
  assert.equal(session.source, "INTERNAL_PAPER");
  assert.equal(session.balances.cash, 99000);
  assert.equal(session.balances.equity, 100500);
  assert.equal(session.positions.length, 1);
  assert.equal(session.account.provider, "INTERNAL_PAPER");
  assert.equal(session.performance.feesPaid, 1.25);
});

test("trading session returns broker-backed account data without triggering synchronization", async () => {
  let synchronized = false;
  const brokerCalls = [];
  const service = createService({
    brokerConfigService: {
      readResolvedBrokerConfig: async () => ({
        provider: "MOOMOO",
        executionMode: "PAPER_BROKER",
        config: { accountId: "paper-1", tradeEnv: "SIMULATE" },
      }),
    },
    brokerPaperExecutionService: {
      synchronizeOrders: async (_userId, options) => {
        synchronized = options.forceRefresh === true && options.source === "trading_session";
      },
      listOrders: async (_userId, options) => {
        brokerCalls.push({ type: "orders", options });
        return [
          { brokerOrderId: "open-1", symbol: "AAPL", status: "SUBMITTED" },
          { brokerOrderId: "done-1", symbol: "MSFT", status: "CANCELLED_ALL" },
        ];
      },
      listFills: async (_userId, options) => {
        brokerCalls.push({ type: "fills", options });
        return [
          {
            symbol: "AAPL",
            quantity: 2,
            price: 191,
            commission: 0.5,
            filledAt: "2026-07-06T01:00:00.000Z",
          },
        ];
      },
    },
    brokerService: {
      getAccountSummary: async () => ({
        provider: "MOOMOO",
        cash: 50000,
        buyingPower: 100000,
        availableFunds: 48000,
        equity: 75000,
        currency: "USD",
        positions: [{ symbol: "AAPL", quantity: 2, lastPrice: 191 }],
        openOrders: [],
      }),
    },
  });

  const session = await service.getTradingSession("user-a", { forceRefresh: true });

  assert.equal(synchronized, false);
  assert.equal(session.provider, "MOOMOO");
  assert.equal(session.source, "BROKER");
  assert.equal(session.balances.buyingPower, 100000);
  assert.equal(session.openOrders.length, 1);
  assert.equal(session.inactiveOrders.length, 1);
  assert.equal(session.trades[0].fill_price, 191);
  assert.equal(session.performance.feesPaid, 0.5);
  assert.deepEqual(brokerCalls, [
    {
      type: "orders",
      options: { limit: 500, broker: "MOOMOO" },
    },
    {
      type: "fills",
      options: { limit: 500, broker: "MOOMOO" },
    },
  ]);
});
