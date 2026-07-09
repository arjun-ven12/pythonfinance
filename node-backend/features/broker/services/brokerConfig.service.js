function normalizeBrokerProvider(value, fallback = "MOOMOO") {
  const normalized = String(value || fallback).trim().toUpperCase();
  return ["MOOMOO", "IBKR", "INTERNAL_PAPER"].includes(normalized)
    ? normalized
    : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function toPort(value, fallback) {
  const parsed = Number.parseInt(value ?? fallback, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function normalizeTradeEnv(value, fallback = "SIMULATE") {
  return String(value || fallback).trim().toUpperCase() === "REAL"
    ? "REAL"
    : "SIMULATE";
}

function parseAccountSelection(value, fallbackTradeEnv = "SIMULATE") {
  const raw = String(value || "").trim();
  const [maybeTradeEnv, ...accountParts] = raw.split(":");
  const normalizedTradeEnv = normalizeTradeEnv(maybeTradeEnv, fallbackTradeEnv);
  if (
    (String(maybeTradeEnv || "").trim().toUpperCase() === "REAL" ||
      String(maybeTradeEnv || "").trim().toUpperCase() === "SIMULATE") &&
    accountParts.length > 0
  ) {
    return {
      accountId: accountParts.join(":").trim() || null,
      tradeEnv: normalizedTradeEnv,
    };
  }
  return {
    accountId: raw || null,
    tradeEnv: normalizeTradeEnv(fallbackTradeEnv, "SIMULATE"),
  };
}

function normalizeMarket(value, fallback = "US") {
  const market = String(value || fallback).trim().toUpperCase();
  return ["US", "SG", "HK", "AU", "JP", "CA", "MY"].includes(market)
    ? market
    : fallback;
}

function normalizeTransport(value, fallback = "python_bridge") {
  const transport = String(value || fallback).trim().toLowerCase();
  return ["python_bridge", "websocket", "auto"].includes(transport)
    ? transport
    : fallback;
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

function sanitizeMoomooConfig(input = {}) {
  const parsedAccount = parseAccountSelection(
    input.accountId || input.defaultAccId,
    input.tradeEnv || input.defaultTrdEnv || "SIMULATE"
  );
  return {
    host: String(input.host || "127.0.0.1").trim() || "127.0.0.1",
    port: toPort(input.port, 11111),
    transport: normalizeTransport(input.transport, "python_bridge"),
    tradeEnv: parsedAccount.tradeEnv,
    securityFirm: normalizeSecurityFirm(input.securityFirm, "FUTUSECURITIES"),
    market: normalizeMarket(input.market, "US"),
    websocketSsl: toBoolean(input.websocketSsl, false),
    accountId: parsedAccount.accountId,
  };
}

function getMoomooEnvDefaults() {
  return sanitizeMoomooConfig({
    host: process.env.MOOMOO_OPEND_HOST,
    port: process.env.MOOMOO_OPEND_PORT,
    transport: process.env.MOOMOO_TRANSPORT,
    tradeEnv: process.env.MOOMOO_DEFAULT_TRD_ENV,
    securityFirm: process.env.MOOMOO_SECURITY_FIRM,
    market: process.env.MOOMOO_MARKET,
    websocketSsl: process.env.MOOMOO_WEBSOCKET_SSL,
    accountId: process.env.MOOMOO_DEFAULT_ACC_ID,
  });
}

function getMoomooHardcodedDefaults() {
  return sanitizeMoomooConfig({
    host: "127.0.0.1",
    port: 11111,
    transport: "python_bridge",
    tradeEnv: "SIMULATE",
    securityFirm: "FUTUSECURITIES",
    market: "US",
    websocketSsl: false,
    accountId: null,
  });
}

function getSafeConfigKeys(provider) {
  if (provider === "MOOMOO") {
    return [
      "host",
      "port",
      "transport",
      "tradeEnv",
      "securityFirm",
      "market",
      "websocketSsl",
      "accountId",
    ];
  }

  if (provider === "IBKR") {
    return ["host", "port", "clientId", "mode"];
  }

  return [];
}

function filterAllowedKeys(input = {}, provider) {
  const allowed = new Set(getSafeConfigKeys(provider));
  return Object.fromEntries(
    Object.entries(input || {}).filter(([key]) => allowed.has(key))
  );
}

function createBrokerConfigService({ prisma }) {
  async function readBrokerConfig(userId) {
    return prisma.run((db) =>
      db.brokerConfig.findUnique({
        where: { userId },
      })
    );
  }

  function getEffectiveConfig(provider, savedConfig = null) {
    const normalizedProvider = normalizeBrokerProvider(provider, "MOOMOO");
    if (normalizedProvider === "MOOMOO") {
      return sanitizeMoomooConfig({
        ...getMoomooHardcodedDefaults(),
        ...getMoomooEnvDefaults(),
        ...(savedConfig || {}),
      });
    }

    return savedConfig || {};
  }

  function getDefaultExecutionMode(provider) {
    if (provider === "MOOMOO") return "PAPER_BROKER";
    if (provider === "INTERNAL_PAPER") return "INTERNAL_PAPER";
    return "READ_ONLY";
  }

  function normalizeExecutionModeForProvider(provider, value = null) {
    const normalized = String(value || "").trim().toUpperCase();
    if (provider === "INTERNAL_PAPER") return "INTERNAL_PAPER";
    if (provider === "MOOMOO") {
      return ["PAPER_BROKER", "LIVE_DRY_RUN", "LIVE_SUPERVISED", "LIVE_LOCKED"].includes(
        normalized
      )
        ? normalized
        : "PAPER_BROKER";
    }
    return ["READ_ONLY", "PAPER_BROKER", "LIVE_DRY_RUN", "LIVE_SUPERVISED", "LIVE_LOCKED"].includes(
      normalized
    )
      ? normalized
      : getDefaultExecutionMode(provider);
  }

  async function readResolvedBrokerConfig(userId, providerOverride = null) {
    const existing = await readBrokerConfig(userId);
    const provider = normalizeBrokerProvider(
      providerOverride,
      existing?.provider || process.env.DEFAULT_BROKER_PROVIDER || "INTERNAL_PAPER"
    );
    const savedConfig = filterAllowedKeys(existing?.config || {}, provider);
    const config = getEffectiveConfig(provider, savedConfig);
    return {
      provider,
      executionMode: normalizeExecutionModeForProvider(provider, existing?.executionMode),
      config,
      savedConfig,
    };
  }

  async function writeBrokerConfig(userId, input = {}) {
    const existing = await readBrokerConfig(userId);
    const provider = normalizeBrokerProvider(
      input.provider,
      existing?.provider || process.env.DEFAULT_BROKER_PROVIDER || "INTERNAL_PAPER"
    );
    const providerChanged = Boolean(existing?.provider && existing.provider !== provider);
    const allowedInput = filterAllowedKeys(input.config || {}, provider);
    const nextSavedConfig =
      provider === "MOOMOO"
        ? sanitizeMoomooConfig({
            ...filterAllowedKeys(existing?.config || {}, provider),
            ...allowedInput,
          })
        : {
            ...filterAllowedKeys(existing?.config || {}, provider),
            ...allowedInput,
          };

    const executionMode =
      normalizeExecutionModeForProvider(
        provider,
        input.executionMode ?? (providerChanged ? null : existing?.executionMode)
      );

    return prisma.run((db) =>
      db.brokerConfig.upsert({
        where: { userId },
        update: {
          provider,
          executionMode,
          config: nextSavedConfig,
        },
        create: {
          userId,
          provider,
          executionMode,
          config: nextSavedConfig,
        },
      })
    );
  }

  return {
    filterAllowedKeys,
    getEffectiveConfig,
    getMoomooEnvDefaults,
    getMoomooHardcodedDefaults,
    normalizeExecutionModeForProvider,
    readBrokerConfig,
    readResolvedBrokerConfig,
    sanitizeMoomooConfig,
    writeBrokerConfig,
  };
}

module.exports = createBrokerConfigService;
