function toFiniteNumber(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = toFiniteNumber(value);
    if (parsed != null) {
      return parsed;
    }
  }
  return null;
}

function isOpenBrokerOrder(order) {
  return ["SUBMITTED", "PARTIALLY_FILLED", "PENDING", "WORKING", "OPEN"].includes(
    String(order?.status || "").trim().toUpperCase()
  );
}

export function resolveBrokerState({
  activeBrokerAccount = null,
  activeTradingSession = null,
} = {}) {
  const provider = String(
    activeTradingSession?.provider || activeBrokerAccount?.provider || "INTERNAL_PAPER"
  );
  const isInternalPaperMode = provider === "INTERNAL_PAPER";
  const isBrokerProvider = !isInternalPaperMode;
  const sessionAccount = activeTradingSession?.account || {};
  const brokerAccount = activeBrokerAccount || {};
  const sessionBalances = activeTradingSession?.balances || {};

  const account = isBrokerProvider
    ? {
        ...brokerAccount,
        ...sessionAccount,
        cash: firstFiniteNumber(sessionAccount?.cash, brokerAccount?.cash),
        buyingPower: firstFiniteNumber(sessionAccount?.buyingPower, brokerAccount?.buyingPower),
        availableFunds: firstFiniteNumber(
          sessionAccount?.availableFunds,
          brokerAccount?.availableFunds
        ),
        equity: firstFiniteNumber(sessionAccount?.equity, brokerAccount?.equity),
        margin: firstFiniteNumber(sessionAccount?.margin, brokerAccount?.margin),
        currency: sessionAccount?.currency || brokerAccount?.currency || "USD",
        accountType: sessionAccount?.accountType || brokerAccount?.accountType || null,
      }
    : sessionAccount || brokerAccount || {};

  const balances = isBrokerProvider
    ? {
        ...sessionBalances,
        cash: firstFiniteNumber(sessionBalances.cash, account?.cash),
        buyingPower: firstFiniteNumber(sessionBalances.buyingPower, account?.buyingPower),
        availableFunds: firstFiniteNumber(
          sessionBalances.availableFunds,
          account?.availableFunds
        ),
        equity: firstFiniteNumber(sessionBalances.equity, account?.equity),
        margin: firstFiniteNumber(sessionBalances.margin, account?.margin),
        currency: sessionBalances.currency || account?.currency || "USD",
      }
    : sessionBalances;

  const positions = Array.isArray(activeTradingSession?.positions)
    ? activeTradingSession.positions
    : Array.isArray(account?.positions)
      ? account.positions
      : [];

  const orders = Array.isArray(activeTradingSession?.orders)
    ? activeTradingSession.orders
    : Array.isArray(account?.openOrders)
      ? account.openOrders
      : [];

  const openOrders = Array.isArray(activeTradingSession?.openOrders)
    ? activeTradingSession.openOrders
    : orders.filter(isOpenBrokerOrder);

  const inactiveOrders = Array.isArray(activeTradingSession?.inactiveOrders)
    ? activeTradingSession.inactiveOrders
    : orders.filter((order) => !openOrders.includes(order));

  return {
    account,
    balances,
    inactiveOrders,
    isBrokerProvider,
    isInternalPaperMode,
    openOrders,
    orders,
    positions,
    provider,
    rawBrokerAccount: brokerAccount,
    rawSessionAccount: sessionAccount,
    session: activeTradingSession,
    usesBrokerHeadline: isBrokerProvider,
  };
}

export { firstFiniteNumber, toFiniteNumber };
