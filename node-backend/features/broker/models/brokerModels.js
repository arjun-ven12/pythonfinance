function toNumber(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  return Boolean(value);
}

function createBrokerHealth(input = {}) {
  return {
    provider: String(input.provider || "UNKNOWN").toUpperCase(),
    connected: normalizeBoolean(input.connected),
    opendReachable: normalizeBoolean(input.opendReachable, normalizeBoolean(input.connected)),
    gatewayRunning: normalizeBoolean(input.gatewayRunning),
    loggedIn: normalizeBoolean(input.loggedIn),
    paperMode: normalizeBoolean(input.paperMode),
    accountLoaded: normalizeBoolean(input.accountLoaded),
    marketDataAvailable: normalizeBoolean(input.marketDataAvailable),
    orderPermission: normalizeBoolean(input.orderPermission),
    lastError: input.lastError || null,
    latencyMs: toNumber(input.latencyMs),
    lastHeartbeat: input.lastHeartbeat || null,
    status: input.status || "DISCONNECTED",
    protocolUsed: input.protocolUsed || null,
    accountsFound: toNumber(input.accountsFound, 0),
    accountListResult: input.accountListResult || null,
    providerWarning: input.providerWarning || null,
    recoveredByRetry: normalizeBoolean(input.recoveredByRetry),
    retryCount: toNumber(input.retryCount, 0),
    failureCategory: input.failureCategory || null,
    config: input.config || null,
  };
}

function createBrokerPosition(input = {}) {
  return {
    symbol: String(input.symbol || "").trim().toUpperCase(),
    quantity: toNumber(input.quantity, 0),
    averageCost: toNumber(input.averageCost, 0),
    marketValue: toNumber(input.marketValue, 0),
    lastPrice: toNumber(input.lastPrice),
    side: input.side || "LONG",
    currency: input.currency || null,
    brokerPositionId: input.brokerPositionId || null,
  };
}

function createBrokerOrder(input = {}) {
  const quantity = toNumber(input.quantity, 0);
  const filledQuantity = toNumber(input.filledQuantity, 0);
  return {
    brokerOrderId: input.brokerOrderId == null ? null : String(input.brokerOrderId),
    clientOrderId: input.clientOrderId == null ? null : String(input.clientOrderId),
    symbol: String(input.symbol || "").trim().toUpperCase(),
    side: input.side || "BUY",
    orderType: input.orderType || "MARKET",
    status: input.status || "UNKNOWN",
    quantity,
    filledQuantity,
    remainingQuantity: toNumber(
      input.remainingQuantity,
      Math.max(quantity - filledQuantity, 0)
    ),
    limitPrice: toNumber(input.limitPrice),
    averageFillPrice: toNumber(input.averageFillPrice),
    createdAt: input.createdAt || null,
    updatedAt: input.updatedAt || null,
    lastSyncedAt: input.lastSyncedAt || null,
    broker: String(input.broker || input.provider || "UNKNOWN").toUpperCase(),
  };
}

function createBrokerFill(input = {}) {
  return {
    executionId: input.executionId == null ? null : String(input.executionId),
    brokerOrderId: input.brokerOrderId == null ? null : String(input.brokerOrderId),
    symbol: String(input.symbol || "").trim().toUpperCase(),
    side: input.side || "BUY",
    quantity: toNumber(input.quantity, 0),
    price: toNumber(input.price, 0),
    commission: toNumber(input.commission, 0),
    filledAt: input.filledAt || null,
  };
}

function createBrokerMarketData(input = {}) {
  return {
    symbol: String(input.symbol || "").trim().toUpperCase(),
    name: input.name || null,
    close: toNumber(input.close),
    last: toNumber(input.last),
    bid: toNumber(input.bid),
    ask: toNumber(input.ask),
    spread: toNumber(input.spread),
    open: toNumber(input.open),
    high: toNumber(input.high),
    low: toNumber(input.low),
    previousClose: toNumber(input.previousClose),
    volume: toNumber(input.volume, 0),
    marketStatus: input.marketStatus || null,
    tradingSession: input.tradingSession || null,
    week52High: toNumber(input.week52High),
    week52Low: toNumber(input.week52Low),
    updatedAt: input.updatedAt || null,
    tradable: normalizeBoolean(input.tradable, true),
  };
}

function createBrokerAccountSummary(input = {}) {
  return {
    provider: String(input.provider || "UNKNOWN").toUpperCase(),
    available: normalizeBoolean(input.available),
    reason: input.reason || null,
    cash: toNumber(input.cash),
    buyingPower: toNumber(input.buyingPower),
    availableFunds: toNumber(input.availableFunds),
    equity: toNumber(input.equity),
    currency: input.currency || null,
    positions: Array.isArray(input.positions) ? input.positions.map(createBrokerPosition) : [],
    openOrders: Array.isArray(input.openOrders) ? input.openOrders.map(createBrokerOrder) : [],
    margin: toNumber(input.margin),
    accountType: input.accountType || "Unknown",
    accountMode: input.accountMode || "unknown",
    lastUpdated: input.lastUpdated || null,
    managedAccounts: Array.isArray(input.managedAccounts) ? input.managedAccounts : [],
    paperConfirmed: normalizeBoolean(input.paperConfirmed),
    brokerAccountId: input.brokerAccountId == null ? null : String(input.brokerAccountId),
    providerWarning: input.providerWarning || null,
    staleBecauseRateLimited: normalizeBoolean(input.staleBecauseRateLimited),
    staleBecauseBrokerReadFailed: normalizeBoolean(input.staleBecauseBrokerReadFailed),
    staleReadCategory: input.staleReadCategory || null,
    recoveredByRetry: normalizeBoolean(input.recoveredByRetry),
    retryCount: toNumber(input.retryCount, 0),
  };
}

function createBrokerCapabilityMatrix(input = {}) {
  const readOnly = normalizeBoolean(input.readOnly, true);
  const canPlaceOrders = normalizeBoolean(input.canPlaceOrders, false);

  return {
    provider: String(input.provider || "UNKNOWN").toUpperCase(),
    canConnect: normalizeBoolean(input.canConnect, false),
    canReadAccount: normalizeBoolean(input.canReadAccount, false),
    canReadPositions: normalizeBoolean(input.canReadPositions, false),
    canReadOpenOrders: normalizeBoolean(input.canReadOpenOrders, false),
    canReadMarketData: normalizeBoolean(input.canReadMarketData, false),
    canPreviewOrders: normalizeBoolean(input.canPreviewOrders, false),
    canPlaceOrders,
    canCancelOrders: normalizeBoolean(input.canCancelOrders, canPlaceOrders),
    canModifyOrders: normalizeBoolean(input.canModifyOrders, canPlaceOrders),
    canReadExecutions: normalizeBoolean(input.canReadExecutions, false),
    liveExecutionEnabled: normalizeBoolean(input.liveExecutionEnabled, false),
    readOnly,
    supports: {
      accountSummary: input.supports?.accountSummary || { supported: false, mode: "UNSUPPORTED" },
      positions: input.supports?.positions || { supported: false, mode: "UNSUPPORTED" },
      openOrders: input.supports?.openOrders || { supported: false, mode: "UNSUPPORTED" },
      marketSnapshot: input.supports?.marketSnapshot || { supported: false, mode: "UNSUPPORTED" },
      previewOrder: input.supports?.previewOrder || { supported: false, mode: "UNSUPPORTED" },
      executions: input.supports?.executions || { supported: false, mode: "UNSUPPORTED" },
      feeQuery: input.supports?.feeQuery || { supported: false, mode: "UNSUPPORTED" },
    },
    notes: Array.isArray(input.notes) ? input.notes : [],
  };
}

module.exports = {
  createBrokerAccountSummary,
  createBrokerCapabilityMatrix,
  createBrokerFill,
  createBrokerHealth,
  createBrokerMarketData,
  createBrokerOrder,
  createBrokerPosition,
};
