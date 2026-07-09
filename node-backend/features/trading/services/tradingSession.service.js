const { requireUserId } = require("../../../repositories/ownership");

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeStatus(value) {
  return String(value || "UNKNOWN").trim().toUpperCase().replace(/\s+/g, "_");
}

function isActiveOrder(order = {}) {
  const status = normalizeStatus(order.status);
  return !(
    status === "FILLED" ||
    status.includes("CANCEL") ||
    status.includes("EXPIRE") ||
    status.includes("REJECT") ||
    status.includes("FAIL")
  );
}

function normalizePaperPositions(positions = {}) {
  if (Array.isArray(positions)) return positions;
  return Object.values(positions || {});
}

function buildPerformance(portfolio = {}) {
  return {
    equityHistory: Array.isArray(portfolio.equity_history) ? portfolio.equity_history : [],
    realizedPnl: toNumber(portfolio.realized_pnl, 0),
    feesPaid: toNumber(portfolio.fees_paid, 0),
  };
}

function normalizeTrade(fill = {}) {
  const quantity = toNumber(fill.quantity ?? fill.filledQuantity, 0);
  const price = toNumber(fill.price ?? fill.fill_price ?? fill.averagePrice, 0);
  const commission = toNumber(fill.commission ?? fill.fee, 0);
  return {
    ...fill,
    status: normalizeStatus(fill.status || "FILLED"),
    quantity,
    price,
    fill_price: price,
    filled_at: fill.filled_at || fill.filledAt || fill.updatedAt || fill.createdAt || null,
    fee: commission,
    commission,
  };
}

function createTradingSessionService({
  brokerConfigService,
  brokerPaperExecutionService,
  brokerService,
  getPortfolioForUser,
  tradeRepository,
}) {
  async function getInternalPaperSession(userId, resolved = {}) {
    const { ledgerState } = await getPortfolioForUser(userId);
    const trades = (await tradeRepository.list(userId, {
      source: { startsWith: "paper-approval:" },
    })).map(normalizeTrade);
    const positions = normalizePaperPositions(ledgerState.positions);
    const orders = [];

    return {
      provider: "INTERNAL_PAPER",
      executionMode: resolved.executionMode || "INTERNAL_PAPER",
      tradeEnv: "SIMULATE",
      marketDataProvider: "PLATFORM",
      source: "INTERNAL_PAPER",
      account: {
        provider: "INTERNAL_PAPER",
        executionMode: resolved.executionMode || "INTERNAL_PAPER",
        available: true,
        cash: toNumber(ledgerState.cash, 0),
        buyingPower: toNumber(ledgerState.cash, 0),
        availableFunds: toNumber(ledgerState.cash, 0),
        equity: toNumber(ledgerState.equity, 0),
        currency: ledgerState.currency || "USD",
        positions,
        openOrders: orders,
      },
      balances: {
        cash: toNumber(ledgerState.cash, 0),
        buyingPower: toNumber(ledgerState.cash, 0),
        availableFunds: toNumber(ledgerState.cash, 0),
        equity: toNumber(ledgerState.equity, 0),
        currency: ledgerState.currency || "USD",
      },
      portfolio: ledgerState,
      positions,
      orders,
      openOrders: orders,
      inactiveOrders: [],
      trades,
      performance: buildPerformance(ledgerState),
    };
  }

  async function getBrokerSession(userId, resolved = {}, options = {}) {
    const activeBroker = resolved.provider || null;
    const [account, orders, fills] = await Promise.all([
      brokerService.getAccountSummary(userId, {
        forceRefresh: Boolean(options.forceRefresh),
      }),
      brokerPaperExecutionService?.listOrders
        ? brokerPaperExecutionService.listOrders(userId, {
            limit: 500,
            broker: activeBroker,
          })
        : Promise.resolve([]),
      brokerPaperExecutionService?.listFills
        ? brokerPaperExecutionService.listFills(userId, {
            limit: 500,
            broker: activeBroker,
          })
        : Promise.resolve([]),
    ]);

    const normalizedOrders = Array.isArray(orders) ? orders : [];
    const openOrders = normalizedOrders.filter(isActiveOrder);
    const inactiveOrders = normalizedOrders.filter((order) => !isActiveOrder(order));
    const positions = Array.isArray(account.positions) ? account.positions : [];
    const trades = (Array.isArray(fills) ? fills : []).map(normalizeTrade);
    const feesPaid = trades.reduce(
      (total, fill) => total + Math.abs(toNumber(fill.commission, 0)),
      0
    );

    return {
      provider: resolved.provider,
      executionMode: resolved.executionMode,
      tradeEnv: resolved.config?.tradeEnv || account.tradeEnv || null,
      accountId: resolved.config?.accountId || account.brokerAccountId || null,
      marketDataProvider: resolved.provider,
      source: "BROKER",
      account: {
        ...account,
        provider: resolved.provider,
        executionMode: resolved.executionMode,
        openOrders,
      },
      balances: {
        cash: account.cash,
        buyingPower: account.buyingPower,
        availableFunds: account.availableFunds,
        equity: account.equity,
        margin: account.margin,
        currency: account.currency || "USD",
      },
      portfolio: {
        cash: account.cash,
        equity: account.equity,
        positions,
        equity_history: [],
        fees_paid: feesPaid,
      },
      positions,
      orders: normalizedOrders,
      openOrders,
      inactiveOrders,
      trades,
      performance: {
        equityHistory: [],
        realizedPnl: null,
        feesPaid,
      },
    };
  }

  async function getTradingSession(userId, options = {}) {
    const ownerId = requireUserId(userId);
    const resolved = brokerConfigService
      ? await brokerConfigService.readResolvedBrokerConfig(ownerId)
      : { provider: "INTERNAL_PAPER", executionMode: "INTERNAL_PAPER", config: {} };

    if (resolved.provider === "INTERNAL_PAPER") {
      return getInternalPaperSession(ownerId, resolved);
    }

    return getBrokerSession(ownerId, resolved, options);
  }

  return {
    getTradingSession,
  };
}

module.exports = createTradingSessionService;
