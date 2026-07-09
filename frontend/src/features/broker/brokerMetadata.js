export const BROKER_PROVIDERS = Object.freeze({
  INTERNAL_PAPER: "INTERNAL_PAPER",
  MOOMOO: "MOOMOO",
  IBKR: "IBKR",
});

export function normalizeBrokerProvider(value, fallback = BROKER_PROVIDERS.MOOMOO) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(BROKER_PROVIDERS).includes(normalized) ? normalized : fallback;
}

export const BROKER_METADATA = Object.freeze({
  [BROKER_PROVIDERS.INTERNAL_PAPER]: {
    label: "Internal Paper",
    shortLabel: "Paper",
    tag: "Built In",
    subtitle: "This broker is built into the platform.",
    description:
      "Use the internal paper engine to preview approvals, update the ledger, and rehearse the trading loop without any external gateway.",
    version: "Built-in engine",
    heroCapabilities: ["Paper Execution", "Ledger", "Scanner"],
    configFields: [],
    secretFields: [],
    setupGuide: [
      "No install is required.",
      "Approvals stay in control of order release.",
      "Safety and reconciliation still run before paper execution.",
      "Ledger updates remain internal to the platform.",
    ],
    wizard: [
      { title: "Engine ready", detail: "The platform ships with the internal paper engine enabled." },
      { title: "Review approvals", detail: "Paper actions still require approval and safety gates." },
      { title: "Preview execution", detail: "Inspect simulated fills before relying on them." },
      { title: "Reconcile ledger", detail: "Use the ledger as the source of truth for paper activity." },
      { title: "Done", detail: "The paper broker center is always available." },
    ],
    staticHealth: {
      provider: "INTERNAL_PAPER",
      connected: true,
      gatewayRunning: true,
      paperMode: true,
      accountLoaded: true,
      marketDataAvailable: true,
      orderPermission: true,
      status: "READY",
      lastError: null,
      lastHeartbeat: null,
      latencyMs: 0,
      config: {},
    },
    staticAccount: {
      provider: "INTERNAL_PAPER",
      available: true,
      reason: "The internal paper engine uses platform-managed sample ledger state.",
      cash: null,
      buyingPower: null,
      equity: null,
      currency: "USD",
      margin: null,
      accountType: "Paper",
      accountMode: "paper",
      positions: [],
      openOrders: [],
    },
    staticPreflight: {
      overall: "PASS",
      executionLocked: false,
      checks: [
        { key: "paperMode", label: "Paper engine", status: "PASS", detail: "Internal paper execution is always paper-only." },
        { key: "safety", label: "Safety", status: "PASS", detail: "Safety checks still gate approvals before paper actions." },
        { key: "approvals", label: "Approval workflow", status: "PASS", detail: "Human review remains in control of release." },
        { key: "reconciliation", label: "Ledger state", status: "PASS", detail: "The platform ledger is the primary record for internal paper." },
      ],
    },
    staticReconciliation: {
      status: "CLEAN",
      syncScore: 100,
      cashDifference: 0,
      missingPositions: [],
      extraPositions: [],
      positionDifferences: [],
      brokerReason: "Internal Paper uses the platform ledger as its source of truth.",
    },
  },
  [BROKER_PROVIDERS.MOOMOO]: {
    label: "Moomoo",
    shortLabel: "Moomoo",
    tag: "Execution Ready",
    subtitle: "Connect OpenD, monitor account health, and keep paper trading controlled.",
    description:
      "Moomoo uses OpenD as the local bridge for account sync, quotes, and paper-order routing.",
    version: "OpenD 10.x",
    heroCapabilities: ["Account Sync", "Quotes", "Paper Orders"],
    configFields: [
      { key: "host", label: "Host", type: "text", placeholder: "127.0.0.1" },
      {
        key: "port",
        label: "Port",
        type: "number",
        placeholder: "11111",
      },
      {
        key: "tradeEnv",
        label: "Trade Environment",
        type: "select",
        options: [
          { value: "SIMULATE", label: "SIMULATE" },
          { value: "REAL", label: "REAL" },
        ],
      },
      {
        key: "securityFirm",
        label: "Security Firm",
        type: "select",
        options: [
          { value: "FUTUSECURITIES", label: "Futu Securities / Moomoo" },
          { value: "FUTUINC", label: "Futu Inc" },
          { value: "FUTUSG", label: "Futu SG" },
        ],
      },
      {
        key: "market",
        label: "Market",
        type: "select",
        options: [
          { value: "US", label: "US" },
          { value: "SG", label: "SG" },
          { value: "HK", label: "HK" },
          { value: "AU", label: "AU" },
          { value: "JP", label: "JP" },
          { value: "CA", label: "CA" },
          { value: "MY", label: "MY" },
        ],
      },
      {
        key: "transport",
        label: "Transport",
        type: "select",
        options: [
          { value: "python_bridge", label: "Python bridge (official SDK)" },
          { value: "websocket", label: "WebSocket (legacy)" },
        ],
      },
      {
        key: "websocketSsl",
        label: "WebSocket SSL",
        type: "select",
        options: [
          { value: "false", label: "Disabled" },
          { value: "true", label: "Enabled" },
        ],
      },
      {
        key: "accountId",
        label: "Account ID",
        type: "text",
        placeholder: "Optional",
      },
    ],
    secretFields: [
      {
        key: "tradingPasswordMd5",
        label: "Trading password MD5",
        type: "password",
        placeholder: "Optional for live unlock",
      },
      {
        key: "websocketKey",
        label: "OpenD auth key",
        type: "password",
        placeholder: "Optional websocket key",
      },
    ],
    setupGuide: [
      "Install OpenD on the machine running the cockpit.",
      "Log in with your Moomoo account inside OpenD.",
      "Start OpenD and confirm the API port is available on the local machine.",
      "Enter the OpenD host and API port you configured in OpenD, choose the trade environment, then test the connection.",
      "Keep paper mode selected unless live trading is intentionally enabled elsewhere.",
    ],
    wizard: [
      { title: "Install OpenD", detail: "OpenD is the local bridge that exposes account and quote APIs." },
      { title: "Log in", detail: "Authenticate your Moomoo session inside OpenD first." },
      { title: "Configure host", detail: "Set Host, Port, Transport, and Trade Environment." },
      { title: "Test", detail: "Run a broker test to confirm account, quote, and trading permissions." },
      { title: "Done", detail: "You are ready for paper-routed broker workflows." },
    ],
  },
  [BROKER_PROVIDERS.IBKR]: {
    label: "IBKR",
    shortLabel: "IBKR",
    tag: "Coming Soon",
    subtitle: "Future read-only adapter for diagnostics and migration work.",
    description:
      "IBKR remains in the codebase for future or read-only use, but it is not the primary execution path.",
    version: "Read-only / future",
    heroCapabilities: ["Read-only Diagnostics", "Account Snapshot", "Future Adapter"],
    configFields: [
      { key: "host", label: "Host", type: "text", placeholder: "127.0.0.1" },
      { key: "port", label: "Port", type: "number", placeholder: "7497" },
      { key: "clientId", label: "Client ID", type: "number", placeholder: "11" },
    ],
    secretFields: [],
    setupGuide: [
      "IBKR support remains read-only or future-facing in this product surface.",
      "Use Broker Center to inspect the expected configuration shape.",
      "Execution readiness should be handled through Internal Paper or Moomoo instead.",
    ],
    wizard: [
      { title: "Configuration shape", detail: "Host, Port, and Client ID are preserved for future use." },
      { title: "Read-only diagnostics", detail: "This adapter is not the primary execution path." },
      { title: "Migration planning", detail: "Use this when mapping account or order workflows later." },
      { title: "Execution locked", detail: "Live and paper execution stay disabled here." },
      { title: "Coming soon", detail: "Broker Center keeps the surface ready without exposing it as active." },
    ],
  },
});

export function getDefaultBrokerConfig(provider) {
  switch (normalizeBrokerProvider(provider)) {
    case BROKER_PROVIDERS.INTERNAL_PAPER:
      return {};
    case BROKER_PROVIDERS.IBKR:
      return {
        host: "127.0.0.1",
        port: "7497",
        clientId: "11",
        mode: "paper",
      };
    case BROKER_PROVIDERS.MOOMOO:
    default:
      return {
        host: "127.0.0.1",
        port: "11111",
        tradeEnv: "SIMULATE",
        securityFirm: "FUTUSECURITIES",
        market: "US",
        transport: "python_bridge",
        websocketSsl: "false",
        accountId: "",
      };
  }
}
