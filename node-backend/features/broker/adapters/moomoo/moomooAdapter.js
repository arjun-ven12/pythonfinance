const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  createBrokerAccountSummary,
  createBrokerCapabilityMatrix,
  createBrokerHealth,
  createBrokerMarketData,
  createBrokerOrder,
  createBrokerPosition,
} = require("../../models/brokerModels");

function toNumber(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstFiniteValue(...values) {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed != null) {
      return parsed;
    }
  }
  return null;
}

function parsePort(value, fallback = 11111) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("MOOMOO OpenD port must be between 1 and 65535.");
  }
  return parsed;
}

function sanitizeHost(value) {
  const host = String(value || "127.0.0.1").trim();
  if (!host || host.length > 120 || /[^\w.:-]/.test(host)) {
    throw new Error("MOOMOO OpenD host must be a valid hostname or IP address.");
  }
  return host;
}

function normalizeTransport(value, fallback = "python_bridge") {
  const transport = String(value || fallback).trim().toLowerCase();
  if (["python_bridge", "websocket", "auto"].includes(transport)) {
    return transport;
  }
  return fallback;
}

function normalizeTradeEnvironment(value, fallback = "SIMULATE") {
  return String(value || fallback).trim().toUpperCase() === "REAL" ? "REAL" : "SIMULATE";
}

function parseAccountSelection(value, fallbackTradeEnv = "SIMULATE") {
  const raw = String(value || "").trim();
  const [maybeTradeEnv, ...accountParts] = raw.split(":");
  const normalizedMaybeTradeEnv = String(maybeTradeEnv || "").trim().toUpperCase();
  if (
    (normalizedMaybeTradeEnv === "REAL" || normalizedMaybeTradeEnv === "SIMULATE") &&
    accountParts.length > 0
  ) {
    return {
      accountId: accountParts.join(":").trim(),
      tradeEnv: normalizeTradeEnvironment(normalizedMaybeTradeEnv, fallbackTradeEnv),
    };
  }
  return {
    accountId: raw,
    tradeEnv: normalizeTradeEnvironment(fallbackTradeEnv, "SIMULATE"),
  };
}

function accountTypeFromTradeEnv(tradeEnv) {
  return normalizeTradeEnvironment(tradeEnv, "SIMULATE") === "REAL" ? "Live" : "Paper";
}

function normalizeSecurityFirm(value, fallback = "FUTUSECURITIES") {
  const normalized = String(value || fallback).trim().toUpperCase();
  const aliases = {
    MOOMOO: "FUTUSECURITIES",
    FUTU: "FUTUSECURITIES",
    FUTU_SECURITIES: "FUTUSECURITIES",
    FUTUINC: "FUTUINC",
    FUTUSG: "FUTUSG",
    FUTUSECURITIES: "FUTUSECURITIES",
  };
  return aliases[normalized] || fallback;
}

function normalizeMarket(value, fallback = "US") {
  const market = String(value || fallback).trim().toUpperCase();
  return ["US", "SG", "HK", "AU", "JP", "CA", "MY"].includes(market) ? market : fallback;
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function codeToAppSymbol(market, code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode) return "";
  if (market === "US") return normalizedCode;
  if (market === "SG") return `${normalizedCode}.SI`;
  return `${market}.${normalizedCode}`;
}

function symbolToBridgeSymbol(symbol, defaultMarket = "US") {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    throw new Error("A symbol is required.");
  }

  if (normalized.endsWith(".SI")) {
    const code = normalized.slice(0, -3);
    return {
      symbol: `SG.${code}`,
      market: "SG",
      appSymbol: normalized,
    };
  }

  if (/^[A-Z]{2,3}\.[A-Z0-9._-]+$/.test(normalized)) {
    const [market, code] = normalized.split(".", 2);
    return {
      symbol: `${market}.${code}`,
      market,
      appSymbol: codeToAppSymbol(market, code),
    };
  }

  const market = normalizeMarket(defaultMarket, "US");
  return {
    symbol: `${market}.${normalized}`,
    market,
    appSymbol: normalized,
  };
}

function buildMoomooConfig(input = {}, existing = {}) {
  const merged = {
    host: process.env.MOOMOO_OPEND_HOST || "127.0.0.1",
    port: process.env.MOOMOO_OPEND_PORT || 11111,
    transport: process.env.MOOMOO_TRANSPORT || "python_bridge",
    securityFirm: process.env.MOOMOO_SECURITY_FIRM || "FUTUSECURITIES",
    defaultTrdEnv: process.env.MOOMOO_DEFAULT_TRD_ENV || "SIMULATE",
    defaultAccId: process.env.MOOMOO_DEFAULT_ACC_ID || "",
    market: process.env.MOOMOO_MARKET || "US",
    websocketSsl:
      String(process.env.MOOMOO_WEBSOCKET_SSL || "false").trim().toLowerCase() === "true",
    websocketKey: process.env.MOOMOO_WEBSOCKET_KEY || "",
    tradingPasswordMd5: process.env.MOOMOO_TRADING_PASSWORD_MD5 || "",
    requestTimeoutMs: process.env.MOOMOO_REQUEST_TIMEOUT_MS || 8000,
    ...existing,
    ...input,
  };
  const parsedAccount = parseAccountSelection(
    merged.accountId || merged.defaultAccId,
    merged.tradeEnv || merged.defaultTrdEnv
  );

  return {
    provider: "MOOMOO",
    host: sanitizeHost(merged.host),
    port: parsePort(merged.port),
    transport: normalizeTransport(merged.transport),
    securityFirm: normalizeSecurityFirm(merged.securityFirm, "FUTUSECURITIES"),
    defaultTrdEnv: parsedAccount.tradeEnv,
    defaultAccId: parsedAccount.accountId,
    market: normalizeMarket(merged.market),
    websocketSsl: Boolean(merged.websocketSsl),
    websocketKey: String(merged.websocketKey || "").trim(),
    tradingPasswordMd5: String(merged.tradingPasswordMd5 || "").trim().toLowerCase(),
    requestTimeoutMs: Math.max(1000, Number.parseInt(merged.requestTimeoutMs, 10) || 8000),
  };
}

function createOperationError(message, details = {}, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function appendOutput(current, chunk) {
  const next = `${current}${chunk.toString()}`;
  return next.length > 16000 ? next.slice(-16000) : next;
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed) {
    throw new Error("Bridge returned no JSON output.");
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const jsonLine = trimmed
      .split(/\r?\n/)
      .reverse()
      .find((line) => line.trim().startsWith("{"));
    if (!jsonLine) {
      throw error;
    }
    return JSON.parse(jsonLine);
  }
}

function mapOrderStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (status.includes("FILLED_ALL") || status === "FILLED") return "FILLED";
  if (status.includes("FILLED_PART")) return "PARTIALLY_FILLED";
  if (status.includes("CANCEL")) return "CANCELLED";
  if (status.includes("EXPIRE")) return "EXPIRED";
  if (status.includes("SUBMIT")) return "SUBMITTED";
  if (status.includes("FAIL") || status.includes("REJECT")) return "REJECTED";
  return "UNKNOWN";
}

function isOpenOrderStatus(value) {
  const mapped = mapOrderStatus(value);
  return !["FILLED", "CANCELLED", "EXPIRED", "REJECTED"].includes(mapped);
}

function mapSide(value) {
  const side = String(value || "BUY").trim().toUpperCase();
  if (side === "SELL" || side === "SHORT" || side === "SELL_SHORT") return "SELL";
  return "BUY";
}

function mapOrderType(value) {
  const orderType = String(value || "MARKET").trim().toUpperCase();
  if (orderType.includes("MARKET")) return "MARKET";
  if (orderType.includes("STOP_LIMIT")) return "STOP_LIMIT";
  if (orderType.includes("STOP")) return "STOP";
  return "LIMIT";
}

function mapTimeInForce(value) {
  const tif = String(value || "DAY").trim().toUpperCase();
  return ["DAY", "GTC", "GTD", "IOC"].includes(tif) ? tif : "DAY";
}

function mapMoomooTimeframe(value) {
  const timeframe = String(value || "1d").trim().toLowerCase();
  const mapping = {
    "1m": "K_1M",
    "5m": "K_5M",
    "15m": "K_15M",
    "30m": "K_30M",
    "1h": "K_60M",
    "4h": "K_240M",
    "1d": "K_DAY",
    "1w": "K_WEEK",
    "1mo": "K_MON",
  };
  return mapping[timeframe] || "K_DAY";
}

function normalizeOrderBridgePayload(raw = {}, fallbackSymbol = "") {
  const code = String(raw.code || "").trim().toUpperCase();
  const market = code.includes(".") ? code.split(".", 1)[0] : null;
  const symbolCode = code.includes(".") ? code.split(".", 2)[1] : code;
  const symbol = symbolCode
    ? codeToAppSymbol(market || "US", symbolCode)
    : String(fallbackSymbol || "").trim().toUpperCase();
  const orderType = mapOrderType(raw.orderType || raw.order_type);
  const limitPrice = toNumber(raw.price);
  const quantity = toNumber(raw.qty, 0);
  const filledQuantity = toNumber(raw.dealtQty ?? raw.dealt_qty, 0);
  const averageFillPrice = toNumber(raw.dealtAvgPrice ?? raw.dealt_avg_price);
  const remainingQuantity = Math.max(
    toNumber(raw.remainingQty ?? raw.remaining_qty, quantity - filledQuantity),
    0
  );

  return createBrokerOrder({
    provider: "MOOMOO",
    brokerOrderId: raw.orderId || raw.order_id || null,
    clientOrderId: raw.remark || raw.clientOrderId || null,
    symbol,
    side: mapSide(raw.side || raw.trd_side),
    orderType,
    status: mapOrderStatus(raw.status || raw.order_status),
    quantity,
    filledQuantity,
    remainingQuantity,
    limitPrice: orderType === "MARKET" && (!limitPrice || limitPrice <= 0) ? null : limitPrice,
    averageFillPrice:
      filledQuantity > 0 && averageFillPrice != null && averageFillPrice > 0
        ? averageFillPrice
        : null,
    createdAt: raw.createTime || raw.create_time || null,
    updatedAt: raw.updateTime || raw.update_time || raw.updated_time || null,
    lastSyncedAt: new Date().toISOString(),
  });
}

function normalizeBridgeFill(fill = {}) {
  return {
    executionId: fill.executionId || null,
    brokerOrderId: fill.brokerOrderId || null,
    symbol: String(fill.symbol || "").trim().toUpperCase(),
    side: mapSide(fill.side),
    quantity: toNumber(fill.quantity, 0),
    price: toNumber(fill.price, 0),
    commission: toNumber(fill.commission, 0),
    filledAt: fill.filledAt || null,
  };
}

function getDefaultPythonPath() {
  const repoRoot = path.resolve(__dirname, "../../../../../");
  const candidates = [
    process.env.PYTHON_ENGINE_PYTHON,
    path.join(repoRoot, "python-engine", ".venv", "bin", "python"),
    path.join(repoRoot, "python-engine", "venv", "bin", "python"),
    "python3",
  ].filter(Boolean);
  return candidates[0];
}

function createMoomooAdapter({
  buildConfig = buildMoomooConfig,
  now = () => new Date(),
  bridgeRunner = null,
  getPythonPath = getDefaultPythonPath,
  spawnProcess = spawn,
} = {}) {
  const repoRoot = path.resolve(__dirname, "../../../../../");
  const pythonEngineDir = path.join(repoRoot, "python-engine");
  const bridgePath = path.join(pythonEngineDir, "moomoo_broker_bridge.py");

  async function runBridge(command, config, payload = {}) {
    if (bridgeRunner) {
      return bridgeRunner(command, config, payload);
    }

    return new Promise((resolve, reject) => {
      const pythonPath = getPythonPath();
      const child = spawnProcess(pythonPath, [bridgePath, "--command", command], {
        cwd: pythonEngineDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timeout = setTimeout(() => {
        settled = true;
        child.kill("SIGTERM");
        reject(
          createOperationError(
            `MOOMOO bridge timed out for ${command}. Confirm OpenD is running on ${config.host}:${config.port}.`,
            {
              command,
              protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
              pythonPath,
              stderr,
              stdout,
            },
            504
          )
        );
      }, config.requestTimeoutMs);

      const finish = (callback) => (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback(value);
      };

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr = appendOutput(stderr, chunk);
      });

      child.on("error", finish((error) => {
        reject(
          createOperationError(
            `Unable to start MOOMOO Python bridge: ${error.message}`,
            {
              command,
              protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
              pythonPath,
            },
            502
          )
        );
      }));

      child.on("close", finish((code) => {
        let parsed;
        try {
          parsed = parseJsonOutput(stdout);
        } catch (error) {
          reject(
            createOperationError(
              `MOOMOO bridge did not return valid JSON for ${command}: ${error.message}`,
              {
                command,
                code,
                protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
                pythonPath,
                stderr,
                stdout,
              },
              502
            )
          );
          return;
        }

        if (!parsed?.ok || code !== 0) {
          reject(
            createOperationError(
              parsed?.error || `MOOMOO bridge failed for ${command}.`,
              {
                command,
                code,
                protocolUsed: parsed?.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
                pythonPath,
                stderr,
                stdout,
                bridge: parsed,
              },
              502
            )
          );
          return;
        }

        resolve(parsed);
      }));

      child.stdin.end(
        JSON.stringify({
          host: config.host,
          port: config.port,
          tradeEnv: config.defaultTrdEnv,
          accountId: config.defaultAccId || null,
          market: config.market,
          securityFirm: config.securityFirm,
          transport: config.transport,
          websocketSsl: config.websocketSsl,
          websocketKey: config.websocketKey || null,
          tradingPasswordMd5: config.tradingPasswordMd5 || null,
          ...payload,
        })
      );
    });
  }

  function getProtocolSummary(config) {
    return {
      requestedTransport: config.transport,
      protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
      providerWarning:
        config.transport === "websocket"
          ? `Configured transport "${config.transport}" was not used against OpenD API port ${config.port}; the adapter used the official Python SDK bridge instead.`
          : "Broker Center is using the official Python SDK bridge against the OpenD API port.",
    };
  }

  function normalizeAccount(account, config) {
    const accountId = String(account?.accountId || "");
    const tradeEnv = normalizeTradeEnvironment(account?.tradeEnv, config.defaultTrdEnv);
    const accountType = accountTypeFromTradeEnv(tradeEnv);
    return {
      accountId,
      accountType,
      tradeEnv,
      market: normalizeMarket(account?.market, config.market),
      selectionKey: `${tradeEnv}:${accountId}`,
      displayName:
        account?.displayName ||
        `${accountType} · ${tradeEnv} · ${accountId}`,
    };
  }

  async function testConnection(_userId, input = {}) {
    const config = buildConfig(input);
    const startedAt = Date.now();
    const protocolSummary = getProtocolSummary(config);
    const bridge = await runBridge("test_connection", config);

    return {
      config,
      result: {
        provider: "MOOMOO",
        host: config.host,
        port: config.port,
        transport: config.transport,
        tradeEnv: config.defaultTrdEnv,
        connected: Boolean(bridge.connected),
        opendReachable: Boolean(bridge.opendReachable),
        gatewayRunning: Boolean(bridge.gatewayRunning),
        loggedIn: Boolean(bridge.loggedIn),
        account_summary_available: Boolean(bridge.fundsLoaded),
        account_loaded: Boolean(bridge.accountLoaded),
        accountsFound: bridge.accountsFound ?? 0,
        accountListResult: bridge.accountListResult || "UNKNOWN",
        paper_mode: Boolean(bridge.paperMode),
        marketDataAvailable: Boolean(bridge.marketDataAvailable),
        orderPermission: Boolean(bridge.orderPermission),
        latencyMs: Date.now() - startedAt,
        error: bridge.error || bridge.fundsError || null,
        protocolUsed: bridge.protocolUsed || protocolSummary.protocolUsed,
        providerWarning: bridge.providerWarning || protocolSummary.providerWarning,
        selectedAccount: bridge.selectedAccount || null,
      },
    };
  }

  async function getHealth(_userId, input = {}) {
    const config = buildConfig(input);
    try {
      const { result } = await testConnection(null, input);
      const status = result.connected
        ? result.account_loaded
          ? result.orderPermission
            ? "CONNECTED"
            : "DEGRADED"
          : "ACCOUNT_NOT_FOUND"
        : result.opendReachable || result.gatewayRunning
          ? "RECOVERING"
          : "DISCONNECTED";
      return createBrokerHealth({
        provider: "MOOMOO",
        connected: result.connected,
        opendReachable: result.opendReachable,
        gatewayRunning: result.gatewayRunning,
        loggedIn: result.loggedIn,
        paperMode: result.paper_mode,
        accountLoaded: result.account_loaded,
        marketDataAvailable: result.marketDataAvailable,
        orderPermission: result.orderPermission,
        lastError: result.error,
        latencyMs: result.latencyMs,
        lastHeartbeat: now().toISOString(),
        status,
        protocolUsed: result.protocolUsed,
        accountsFound: result.accountsFound,
        accountListResult: result.accountListResult,
        providerWarning: result.providerWarning,
        config: {
          host: config.host,
          port: config.port,
          transport: config.transport,
          market: config.market,
          defaultTrdEnv: config.defaultTrdEnv,
          defaultAccId: config.defaultAccId || null,
        },
      });
    } catch (error) {
      const protocolSummary = getProtocolSummary(config);
      return createBrokerHealth({
        provider: "MOOMOO",
        connected: false,
        opendReachable: false,
        gatewayRunning: false,
        loggedIn: false,
        paperMode: config.defaultTrdEnv !== "REAL",
        accountLoaded: false,
        marketDataAvailable: false,
        orderPermission: false,
        lastError: error.message,
        latencyMs: null,
        lastHeartbeat: null,
        status: "DISCONNECTED",
        protocolUsed: protocolSummary.protocolUsed,
        accountsFound: 0,
        accountListResult: "ERROR",
        providerWarning: protocolSummary.providerWarning,
        config: {
          host: config.host,
          port: config.port,
          transport: config.transport,
          market: config.market,
          defaultTrdEnv: config.defaultTrdEnv,
          defaultAccId: config.defaultAccId || null,
        },
      });
    }
  }

  async function getAccounts(_userId, input = {}) {
    const config = buildConfig(input);
    const bridge = await runBridge("get_accounts", config, {
      includeTradeEnvVariants: true,
    });
    return {
      protocolUsed: bridge.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
      accounts: (bridge.accounts || []).map((account) => normalizeAccount(account, config)),
      selectedAccountId: bridge.selectedAccountId || null,
    };
  }

  async function getAccountSummary(_userId, input = {}) {
    const config = buildConfig(input);

    try {
      const [accountsResult, fundsResult, positionsResult, ordersResult] = await Promise.allSettled([
        runBridge("get_accounts", config),
        runBridge("get_funds", config),
        runBridge("get_positions", config),
        runBridge("get_open_orders", config),
      ]);

      const providerWarnings = [];
      const bridgeErrors = [];
      const accountsBridge = accountsResult.status === "fulfilled" ? accountsResult.value : null;
      const fundsBridge = fundsResult.status === "fulfilled" ? fundsResult.value : null;
      const positionsBridge = positionsResult.status === "fulfilled" ? positionsResult.value : null;
      const ordersBridge = ordersResult.status === "fulfilled" ? ordersResult.value : null;

      if (accountsResult.status === "rejected") {
        bridgeErrors.push(accountsResult.reason);
        providerWarnings.push(`Account list refresh unavailable: ${accountsResult.reason.message}`);
      }
      if (fundsResult.status === "rejected") {
        bridgeErrors.push(fundsResult.reason);
        providerWarnings.push(`Funds refresh unavailable: ${fundsResult.reason.message}`);
      }
      if (positionsResult.status === "rejected") {
        bridgeErrors.push(positionsResult.reason);
        providerWarnings.push(`Position refresh unavailable: ${positionsResult.reason.message}`);
      }
      if (ordersResult.status === "rejected") {
        bridgeErrors.push(ordersResult.reason);
        providerWarnings.push(`Open-order refresh unavailable: ${ordersResult.reason.message}`);
      }

      if (!accountsBridge && !fundsBridge && !positionsBridge && !ordersBridge) {
        throw bridgeErrors[0] || new Error("MOOMOO account summary is unavailable.");
      }

      const selectedAccount = normalizeAccount(
        fundsBridge?.account || accountsBridge?.accounts?.[0] || {},
        config
      );
      const funds = fundsBridge?.funds || {};
      const fundsLoaded = Boolean(
        fundsBridge &&
          fundsBridge.fundsLoaded !== false &&
          Object.keys(funds).length > 0
      );
      const fundsReason = fundsLoaded
        ? null
        : fundsBridge?.fundsResult && fundsBridge.fundsResult !== "OK"
          ? `Account is reachable, but funds were not returned by OpenD: ${fundsBridge.fundsResult}`
          : fundsResult.status === "rejected"
            ? `Account is reachable, but funds refresh failed: ${fundsResult.reason.message}`
            : "Account is reachable, but OpenD did not return fund values for this account/environment.";
      const resolvedCash = firstFiniteValue(
        funds.cash,
        funds.us_cash,
        funds.net_cash,
        funds.available_cash,
        funds.avl_withdrawal_cash,
        funds.withdraw_cash,
        funds.cash_and_cash_equivalents
      );
      const resolvedBuyingPower = firstFiniteValue(
        funds.power,
        funds.buying_power,
        funds.net_cash_power,
        funds.max_power_short,
        funds.max_power_long,
        funds.available_funds,
        funds.available_power,
        resolvedCash
      );
      const resolvedAvailableFunds = firstFiniteValue(
        funds.available_funds,
        funds.available_cash,
        funds.available_power,
        funds.avl_withdrawal_cash,
        funds.withdraw_cash,
        funds.net_cash_power,
        resolvedCash
      );
      const resolvedEquity = firstFiniteValue(
        funds.total_assets,
        funds.net_assets,
        funds.total_asset,
        funds.assets,
        funds.market_val,
        resolvedCash
      );
      const positions = ((positionsBridge && positionsBridge.positions) || []).map((position) =>
        createBrokerPosition({
          symbol: codeToAppSymbol(
            normalizeMarket(position.position_market, config.market),
            String(position.code || "").replace(/^[A-Z]{2,3}\./, "")
          ),
          quantity: position.qty,
          averageCost: position.average_cost ?? position.cost_price ?? position.diluted_cost,
          marketValue: position.market_val,
          lastPrice: position.nominal_price,
          side: String(position.position_side || "LONG").toUpperCase(),
          currency: position.currency || null,
          brokerPositionId: position.position_id,
        })
      );
      const openOrders = (((ordersBridge && ordersBridge.orders) || []))
        .filter((order) => isOpenOrderStatus(order.order_status))
        .map((order) => {
          const orderType = mapOrderType(order.order_type);
          const limitPrice = toNumber(order.price);
          const filledQuantity = toNumber(order.dealt_qty ?? order.fill_qty, 0);
          const averageFillPrice = toNumber(order.dealt_avg_price ?? order.fill_avg_price);
          return createBrokerOrder({
            provider: "MOOMOO",
            brokerOrderId: order.order_id || null,
            clientOrderId: order.remark || null,
            symbol: codeToAppSymbol(
              normalizeMarket(order.order_market || order.trd_market || config.market, config.market),
              String(order.code || "").replace(/^[A-Z]{2,3}\./, "")
            ),
            side: mapSide(order.trd_side),
            orderType,
            status: mapOrderStatus(order.order_status),
            quantity: order.qty,
            filledQuantity,
            limitPrice:
              orderType === "MARKET" && (!limitPrice || limitPrice <= 0)
                ? null
                : order.price,
            averageFillPrice:
              filledQuantity > 0 && averageFillPrice != null && averageFillPrice > 0
                ? averageFillPrice
                : null,
            createdAt: order.create_time || null,
            updatedAt: order.updated_time || order.update_time || null,
          });
        });

      return createBrokerAccountSummary({
        provider: "MOOMOO",
        available: fundsLoaded || positions.length > 0 || openOrders.length > 0,
        reason: [fundsReason, ...providerWarnings].filter(Boolean).join(" ") || null,
        cash: resolvedCash,
        buyingPower: resolvedBuyingPower,
        availableFunds: resolvedAvailableFunds,
        equity: resolvedEquity,
        currency: funds.currency && funds.currency !== "N/A" ? funds.currency : "USD",
        positions,
        openOrders,
        margin: firstFiniteValue(
          funds.initial_margin,
          funds.maintenance_margin,
          funds.margin
        ),
        accountType: selectedAccount.accountType,
        accountMode: selectedAccount.tradeEnv === "REAL" ? "live" : "paper",
        lastUpdated: now().toISOString(),
        managedAccounts: (((accountsBridge && accountsBridge.accounts) || [])).map((account) => ({
          accId: account.accountId,
          trdEnv: account.tradeEnv,
          marketAuth: account.market ? [account.market] : [],
        })),
        paperConfirmed: selectedAccount.tradeEnv !== "REAL",
        brokerAccountId: selectedAccount.accountId || null,
        providerWarning: providerWarnings.length ? providerWarnings.join(" ") : null,
      });
    } catch (error) {
      return createBrokerAccountSummary({
        provider: "MOOMOO",
        available: false,
        reason: error.message || "MOOMOO account summary is unavailable.",
        accountType: config.defaultTrdEnv === "REAL" ? "Live" : "Paper",
        accountMode: config.defaultTrdEnv === "REAL" ? "live" : "paper",
        paperConfirmed: config.defaultTrdEnv !== "REAL",
      });
    }
  }

  async function getPositions(userId, input = {}) {
    const account = await getAccountSummary(userId, input);
    return account.positions || [];
  }

  async function getOpenOrders(userId, input = {}) {
    const account = await getAccountSummary(userId, input);
    return account.openOrders || [];
  }

  async function getOrders(_userId, input = {}) {
    const config = buildConfig(input);
    const bridge = await runBridge("get_orders", config, {
      historyDays: input.historyDays || 90,
    });
    return {
      orders: (bridge.orders || []).map((order) =>
        normalizeOrderBridgePayload(order)
      ),
      protocolUsed: bridge.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
    };
  }

  async function getHistoricalBars(_userId, symbol, timeframe = "1d", input = {}) {
    const config = buildConfig(input);
    const security = symbolToBridgeSymbol(symbol, config.market);
    const bridge = await runBridge("get_history", config, {
      symbol: security.symbol,
      market: security.market,
      ktype: mapMoomooTimeframe(timeframe),
      timeframe,
      range: input.range || "1M",
      maxCount: input.maxCount || 500,
    });
    return {
      symbol: security.appSymbol,
      market: security.market,
      points: bridge.points || [],
      protocolUsed: bridge.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
    };
  }

  async function getMarketData(_userId, symbol, input = {}) {
    const config = buildConfig(input);
    const security = symbolToBridgeSymbol(symbol, config.market);
    const bridge = await runBridge("get_quote", config, {
      symbol: security.symbol,
      market: security.market,
    });
    const snapshot = bridge.record || {};
    return {
      marketData: createBrokerMarketData({
        symbol: security.appSymbol,
        name: snapshot.name || null,
        close: snapshot.last_price ?? null,
        last: snapshot.last_price ?? null,
        bid: snapshot.bid_price ?? null,
        ask: snapshot.ask_price ?? null,
        spread:
          snapshot.ask_price != null && snapshot.bid_price != null
            ? Number((Number(snapshot.ask_price) - Number(snapshot.bid_price)).toFixed(4))
            : null,
        open: snapshot.open_price ?? null,
        high: snapshot.high_price ?? null,
        low: snapshot.low_price ?? null,
        previousClose: snapshot.prev_close_price ?? null,
        volume: snapshot.volume ?? 0,
        marketStatus: snapshot.sec_status || null,
        tradingSession:
          Number(snapshot.after_volume || 0) > 0
            ? "AFTER_HOURS"
            : Number(snapshot.pre_volume || 0) > 0
              ? "PREMARKET"
              : "REGULAR",
        week52High: snapshot.highest52weeks_price ?? null,
        week52Low: snapshot.lowest52weeks_price ?? null,
        updatedAt: snapshot.update_time || now().toISOString(),
        tradable: snapshot.suspension !== true,
      }),
      raw: snapshot,
      protocolUsed: bridge.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
    };
  }

  async function previewOrder(userId, order = {}, input = {}) {
    const [marketData, accountSummary] = await Promise.all([
      getMarketData(userId, order.symbol, input),
      getAccountSummary(userId, input),
    ]);
    const referencePrice =
      toNumber(order.limitPrice) ||
      toNumber(marketData.marketData?.last) ||
      toNumber(marketData.marketData?.close) ||
      0;
    const estimatedNotional = toNumber(order.quantity, 0) * toNumber(referencePrice, 0);
    const spread = toNumber(marketData.marketData?.spread, 0) || 0;
    const commissionEstimate = Number((estimatedNotional * 0.0005).toFixed(2));
    const buyingPower = toNumber(accountSummary?.buyingPower, 0);
    const slippageEstimate = Number((spread * Math.max(1, Number(order.quantity || 0))).toFixed(2));

    return {
      preview: {
        broker: "MOOMOO",
        mode: "SIMULATE_READY",
        referencePrice,
        estimatedNotional,
        maxBuyQuantity:
          referencePrice > 0 && buyingPower > 0 ? Math.floor(buyingPower / referencePrice) : null,
        maxSellQuantity: null,
        buyingPowerRemaining: Math.max(0, Number((buyingPower - estimatedNotional).toFixed(2))),
        commissionEstimate,
        slippageEstimate,
        validation: {
          marketDataAvailable: Boolean(marketData.marketData?.last),
          tradable: Boolean(marketData.marketData?.tradable),
          paperMode: input?.tradeEnv
            ? normalizeTradeEnvironment(input.tradeEnv) !== "REAL"
            : buildConfig(input).defaultTrdEnv !== "REAL",
        },
        notes: [
          "Broker Center is using the official MOOMOO Python SDK bridge for connectivity.",
          "Preview values are best-effort estimates for simulated routing through OpenD.",
        ],
      },
      marketData: marketData.marketData,
      accountSummary: {
        buyingPower: accountSummary.buyingPower,
        cash: accountSummary.cash,
        equity: accountSummary.equity,
      },
    };
  }

  async function placeOrder(_userId, order = {}, input = {}) {
    const config = buildConfig(input);
    if (config.defaultTrdEnv === "REAL") {
      throw createOperationError(
        "MOOMOO live order placement remains disabled by app policy.",
        { protocolUsed: "PYTHON_BRIDGE_TCP_SDK" },
        403
      );
    }

    const security = symbolToBridgeSymbol(order.symbol, config.market);
    const bridge = await runBridge("place_order", config, {
      symbol: security.symbol,
      market: security.market,
      side: order.side,
      quantity: order.quantity,
      orderType: order.orderType,
      limitPrice: order.limitPrice ?? order.entryPrice ?? null,
      stopPrice: order.stopPrice ?? null,
      clientOrderId: order.clientOrderId || null,
      timeInForce: mapTimeInForce(order.timeInForce),
    });
    return {
      order: normalizeOrderBridgePayload(bridge.order, security.appSymbol),
      protocolUsed: bridge.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
    };
  }

  async function cancelOrder(_userId, brokerOrderId, input = {}) {
    const config = buildConfig(input);
    const bridge = await runBridge("cancel_order", config, {
      brokerOrderId,
    });
    let order = normalizeOrderBridgePayload(bridge.order);
    if (!order.brokerOrderId) {
      const status = await runBridge("get_order_status", config, {
        brokerOrderId,
      });
      order = normalizeOrderBridgePayload(status.order);
    }
    return {
      order,
      protocolUsed: bridge.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
    };
  }

  async function modifyOrder(_userId, order = {}, input = {}) {
    const config = buildConfig(input);
    const bridge = await runBridge("modify_order", config, {
      brokerOrderId: order.brokerOrderId || order.orderId,
      quantity: order.quantity,
      limitPrice: order.limitPrice ?? order.price ?? 0,
      stopPrice: order.stopPrice ?? null,
    });
    return {
      order: normalizeOrderBridgePayload(bridge.order, order.symbol),
      protocolUsed: bridge.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
    };
  }

  async function getOrderStatus(_userId, params = {}, input = {}) {
    const config = buildConfig(input);
    const bridge = await runBridge("get_order_status", config, {
      brokerOrderId: params?.brokerOrderId || params?.orderId,
      historyDays: params?.historyDays || input?.historyDays || 90,
    });
    return {
      order: normalizeOrderBridgePayload(bridge.order, params?.symbol),
      protocolUsed: bridge.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
    };
  }

  async function getExecutions(_userId, params = {}, input = {}) {
    const config = buildConfig(input);
    let bridge;
    try {
      bridge = await runBridge("get_executions", config, {
        brokerOrderId: params?.brokerOrderId || params?.orderId,
        symbol: params?.symbol || null,
        market: params?.market || config.market,
      });
    } catch (error) {
      if ((error.message || "").includes("does not support deal data")) {
        return {
          fills: [],
          protocolUsed: "PYTHON_BRIDGE_TCP_SDK",
          providerWarning: "OpenD paper trading does not expose deal data for this environment.",
        };
      }
      throw error;
    }
    return {
      fills: (bridge.fills || []).map(normalizeBridgeFill),
      protocolUsed: bridge.protocolUsed || "PYTHON_BRIDGE_TCP_SDK",
    };
  }

  async function disconnect() {
    return {
      disconnected: true,
      note: "MOOMOO adapter uses short-lived Python bridge sessions per request.",
    };
  }

  async function getCapabilities(_userId, input = {}) {
    const config = buildConfig(input);
    const paperMode = config.defaultTrdEnv !== "REAL";
    return createBrokerCapabilityMatrix({
      provider: "MOOMOO",
      canConnect: true,
      canReadAccount: true,
      canReadPositions: true,
      canReadOpenOrders: true,
      canReadMarketData: true,
      canPreviewOrders: true,
      canPlaceOrders: paperMode,
      canCancelOrders: paperMode,
      canModifyOrders: paperMode,
      canReadExecutions: true,
      liveExecutionEnabled: false,
      readOnly: !paperMode,
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
        paperMode
          ? "MOOMOO is configured for SIMULATE mode through the official Python SDK bridge."
          : "MOOMOO is configured for REAL mode, but live execution remains disabled in the app.",
        "OpenD API port connectivity uses the maintained TCP SDK path through Python, not the JavaScript websocket transport.",
      ],
    });
  }

  return {
    provider: "MOOMOO",
    testConnection,
    getHealth,
    getAccountSummary,
    getPositions,
    getOpenOrders,
    getOrders,
    getMarketData,
    getHistoricalBars,
    getCapabilities,
    previewOrder,
    placeOrder,
    cancelOrder,
    modifyOrder,
    getOrderStatus,
    getExecutions,
    getAccounts,
    disconnect,
  };
}

module.exports = createMoomooAdapter;
