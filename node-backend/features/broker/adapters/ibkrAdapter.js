const {
  createBrokerAccountSummary,
  createBrokerCapabilityMatrix,
  createBrokerHealth,
  createBrokerMarketData,
  createBrokerOrder,
} = require("../models/brokerModels");

function createIbkrAdapter({
  buildIbkrConfig,
  getIbkrStatus,
  readUserIbkrConfig,
  runIbkrBrokerAction,
  runIbkrConnectionTest,
}) {
  async function getConfig(userId) {
    return readUserIbkrConfig(userId);
  }

  async function runAction(userId, action, payload = {}) {
    const config = await readUserIbkrConfig(userId);
    const result = await runIbkrBrokerAction(config, action, payload);
    if (!result?.success) {
      const error = new Error(result?.error || `IBKR action failed: ${action}`);
      error.statusCode = 400;
      error.details = result;
      throw error;
    }
    return result;
  }

  async function testConnection(userId, input = {}) {
    const config = buildIbkrConfig(input, await readUserIbkrConfig(userId));
    const result = await runIbkrConnectionTest(config);
    return { config, result };
  }

  async function getHealth(userId) {
    const config = await readUserIbkrConfig(userId);
    const status = getIbkrStatus(config);
    let account = null;

    if (status.status === "CONNECTED") {
      try {
        account = await runAction(userId, "account-summary");
      } catch (error) {
        account = null;
      }
    }

    return createBrokerHealth({
      provider: "IBKR",
      connected: status.status === "CONNECTED",
      gatewayRunning: status.status === "CONNECTED",
      paperMode: config.mode !== "live",
      marketDataAvailable: Boolean(account?.available),
      accountLoaded: Boolean(config.account_summary_available || account?.available),
      orderPermission: Boolean(account?.paperConfirmed && config.executionMode === "PAPER_BROKER"),
      lastHeartbeat: config.last_checked_at || null,
      latencyMs: null,
      lastError: config.last_error || null,
      status: status.status,
      config: {
        host: config.host,
        port: config.port,
        clientId: config.clientId,
        mode: config.mode,
        executionMode: config.executionMode,
      },
    });
  }

  async function getAccountSummary(userId) {
    const health = await getHealth(userId);
    if (!health.connected) {
      return createBrokerAccountSummary({
        provider: "IBKR",
        available: false,
        reason: "IBKR is not connected. Open TWS or IB Gateway and run Test Connection.",
        cash: null,
        buyingPower: null,
        availableFunds: null,
        equity: null,
        currency: health.config.mode === "paper" ? "USD" : null,
        positions: [],
        openOrders: [],
        margin: null,
        accountType: health.config.mode === "paper" ? "Paper" : "Live",
        lastUpdated: health.lastHeartbeat,
        managedAccounts: [],
        paperConfirmed: false,
      });
    }
    const account = await runAction(userId, "account-summary");
    return createBrokerAccountSummary({
      provider: "IBKR",
      available: Boolean(account.available),
      reason: account.available ? null : "Account snapshot unavailable.",
      cash: account.cash ?? null,
      buyingPower: account.buyingPower ?? null,
      availableFunds: account.availableFunds ?? account.buyingPower ?? account.cash ?? null,
      equity: account.equity ?? null,
      currency: account.currency || "USD",
      positions: account.positions || [],
      openOrders: account.openOrders || [],
      margin: account.margin ?? null,
      accountType: account.accountMode === "paper" ? "Paper" : account.accountMode === "live" ? "Live" : "Unknown",
      lastUpdated: account.lastUpdated || health.lastHeartbeat,
      managedAccounts: account.managedAccounts || [],
      paperConfirmed: Boolean(account.paperConfirmed),
      accountMode: account.accountMode || "unknown",
    });
  }

  async function getOpenOrders(userId) {
    const account = await getAccountSummary(userId);
    return account.openOrders || [];
  }

  async function getPositions(userId) {
    const account = await getAccountSummary(userId);
    return account.positions || [];
  }

  async function getCapabilities(userId) {
    const health = await getHealth(userId);
    const config = await getConfig(userId);
    return createBrokerCapabilityMatrix({
      provider: "IBKR",
      canConnect: health.connected,
      canReadAccount: health.accountLoaded && health.connected,
      canReadPositions: health.accountLoaded && health.connected,
      canReadOpenOrders: health.accountLoaded && health.connected,
      canReadMarketData: health.connected,
      canPreviewOrders: Boolean(health.paperMode && config.executionMode === "PAPER_BROKER"),
      canPlaceOrders: Boolean(health.paperMode && config.executionMode === "PAPER_BROKER"),
      canCancelOrders: Boolean(health.paperMode && config.executionMode === "PAPER_BROKER"),
      canModifyOrders: false,
      canReadExecutions: health.accountLoaded && health.connected,
      liveExecutionEnabled: false,
      readOnly: config.executionMode !== "PAPER_BROKER",
      supports: {
        accountSummary: { supported: true, mode: "FULL" },
        positions: { supported: true, mode: "FULL" },
        openOrders: { supported: true, mode: "FULL" },
        marketSnapshot: { supported: true, mode: "FULL" },
        previewOrder: { supported: true, mode: "FULL" },
        executions: { supported: true, mode: "FULL" },
        feeQuery: { supported: false, mode: "UNSUPPORTED" },
      },
      notes: [
        health.paperMode ? "Paper mode selected." : "Live mode selected; execution remains locked.",
        config.executionMode === "PAPER_BROKER"
          ? "IBKR paper execution is enabled behind approval and preflight gates."
          : "Broker remains read-only until PAPER_BROKER mode is enabled.",
      ],
    });
  }

  async function getMarketData(userId, symbol) {
    const result = await runAction(userId, "market-data", { symbol });
    return {
      marketData: createBrokerMarketData({
        symbol,
        close: result?.marketData?.close ?? result?.close,
        last: result?.marketData?.last ?? result?.last,
        bid: result?.marketData?.bid ?? result?.bid,
        ask: result?.marketData?.ask ?? result?.ask,
        open: result?.marketData?.open ?? result?.open,
        high: result?.marketData?.high ?? result?.high,
        low: result?.marketData?.low ?? result?.low,
        previousClose: result?.marketData?.previousClose ?? result?.previousClose,
        volume: result?.marketData?.volume ?? result?.volume,
        updatedAt: result?.marketData?.updatedAt ?? result?.updatedAt ?? new Date().toISOString(),
      }),
    };
  }

  async function previewOrder(userId, order) {
    const config = await getConfig(userId);
    if (config.executionMode !== "PAPER_BROKER") {
      const error = new Error("Broker preview is locked until PAPER_BROKER mode is enabled.");
      error.statusCode = 403;
      throw error;
    }
    const account = await getAccountSummary(userId);
    if (!account.paperConfirmed) {
      const error = new Error("IBKR account is not confirmed paper. Preview is blocked.");
      error.statusCode = 403;
      throw error;
    }
    return runAction(userId, "preview-order", order);
  }

  async function placeOrder(userId, order) {
    const config = await getConfig(userId);
    if (config.executionMode !== "PAPER_BROKER") {
      const error = new Error("Broker order placement is disabled until PAPER_BROKER mode is enabled.");
      error.statusCode = 403;
      throw error;
    }
    const account = await getAccountSummary(userId);
    if (!account.paperConfirmed || account.accountMode === "live") {
      const error = new Error("IBKR reports a non-paper account. Paper broker execution is blocked.");
      error.statusCode = 403;
      throw error;
    }
    return runAction(userId, "place-paper-order", order);
  }

  async function cancelOrder(userId, brokerOrderId) {
    return runAction(userId, "cancel-order", { brokerOrderId });
  }

  async function modifyOrder() {
    const error = new Error("IBKR modifyOrder is not implemented in this adapter yet.");
    error.statusCode = 501;
    throw error;
  }

  async function getOrderStatus(userId, payload) {
    const result = await runAction(userId, "order-status", payload);
    return {
      order: createBrokerOrder({
        broker: "IBKR",
        brokerOrderId: result?.order?.brokerOrderId ?? payload?.brokerOrderId ?? null,
        clientOrderId: result?.order?.clientOrderId ?? payload?.clientOrderId ?? null,
        symbol: result?.order?.symbol ?? payload?.symbol ?? "",
        side: result?.order?.side ?? "BUY",
        orderType: result?.order?.orderType ?? "MARKET",
        status: result?.order?.status ?? "UNKNOWN",
        quantity: result?.order?.quantity ?? 0,
        filledQuantity: result?.order?.filledQuantity ?? result?.order?.filled ?? 0,
        limitPrice: result?.order?.limitPrice ?? null,
        averageFillPrice: result?.order?.averageFillPrice ?? result?.order?.fill_price ?? null,
        createdAt: result?.order?.createdAt ?? null,
        updatedAt: result?.order?.updatedAt ?? null,
      }),
    };
  }

  async function getExecutions(userId, payload = {}) {
    return runAction(userId, "fills", payload);
  }

  async function disconnect() {
    return { disconnected: true, note: "IBKR adapter uses short-lived diagnostics only; no persistent socket is held." };
  }

  return {
    provider: "IBKR",
    testConnection,
    getHealth,
    getAccountSummary,
    getPositions,
    getOpenOrders,
    getMarketData,
    getCapabilities,
    previewOrder,
    placeOrder,
    cancelOrder,
    modifyOrder,
    getOrderStatus,
    getExecutions,
    disconnect,
    getConfig,
    placePaperOrder: placeOrder,
    cancelPaperOrder: cancelOrder,
    getFills: getExecutions,
  };
}

module.exports = createIbkrAdapter;
