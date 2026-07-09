import { useEffect, useMemo, useRef, useState } from "react";
import AccountSnapshot from "./components/AccountSnapshot";
import BrokerFillsPanel from "./components/BrokerFillsPanel";
import BrokerHealthCard from "./components/BrokerHealthCard";
import CapabilityGrid from "./components/CapabilityGrid";
import ConnectionLogPanel from "./components/ConnectionLogPanel";
import BrokerOrdersPanel from "./components/BrokerOrdersPanel";
import PreflightChecklist from "./components/PreflightChecklist";
import ReconciliationTable from "./components/ReconciliationTable";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import {
  BROKER_METADATA,
  BROKER_PROVIDERS,
  getDefaultBrokerConfig,
  normalizeBrokerProvider,
} from "./brokerMetadata";
import {
  brokerRequest,
  getBrokerAccounts,
  getBrokerConfig,
  importBrokerOrder,
  markBrokerOrderCancelled,
  syncBrokerOrder,
  saveSelectedBrokerConfig,
  saveBrokerSecrets,
} from "./hooks/brokerApi";
import useAutoBrokerLedgerSync from "./hooks/useAutoBrokerLedgerSync";

const SELECTED_BROKER_STORAGE_KEY = "brokerCenterSelectedBroker";
const BROKER_CONFIG_STORAGE_KEY = "brokerCenterDraftConfig";
const FORBIDDEN_SECRET_KEY_PATTERN =
  /(password|secret|token|key|apiKey|privateKey|tradingPassword|tradingPasswordMd5|authorization|cookie|csrf)/i;

function devWarn(message, details = {}) {
  if (import.meta.env.DEV) {
    console.warn(`[Broker Center] ${message}`, details);
  }
}

function isForbiddenSecretKey(key) {
  return FORBIDDEN_SECRET_KEY_PATTERN.test(String(key || ""));
}

export function sanitizeBrokerConfigForStorage(config = {}, context = "broker-config") {
  const sanitized = {};

  Object.entries(config || {}).forEach(([key, value]) => {
    if (isForbiddenSecretKey(key)) {
      devWarn("Removed secret-like key from broker localStorage payload.", {
        context,
        key,
      });
      return;
    }
    sanitized[key] = value;
  });

  return sanitized;
}

function getEmptyDraftConfigs() {
  return {
    [BROKER_PROVIDERS.MOOMOO]: getDefaultBrokerConfig(BROKER_PROVIDERS.MOOMOO),
    [BROKER_PROVIDERS.IBKR]: getDefaultBrokerConfig(BROKER_PROVIDERS.IBKR),
    [BROKER_PROVIDERS.INTERNAL_PAPER]: {},
  };
}

function getEmptySecretDraftInputs() {
  return {
    [BROKER_PROVIDERS.MOOMOO]: {},
    [BROKER_PROVIDERS.IBKR]: {},
    [BROKER_PROVIDERS.INTERNAL_PAPER]: {},
  };
}

function splitStoredBrokerConfigPayload(parsed = {}) {
  const safeDraftConfigs = getEmptyDraftConfigs();
  const secretDraftInputs = getEmptySecretDraftInputs();

  Object.values(BROKER_PROVIDERS).forEach((provider) => {
    const payload = parsed?.[provider] || {};
    safeDraftConfigs[provider] = {
      ...safeDraftConfigs[provider],
      ...sanitizeBrokerConfigForStorage(payload, provider),
    };

    Object.entries(payload).forEach(([key, value]) => {
      if (isForbiddenSecretKey(key)) {
        secretDraftInputs[provider] = {
          ...secretDraftInputs[provider],
          [key]: value,
        };
      }
    });
  });

  return {
    safeDraftConfigs,
    hadForbiddenKeys: Object.values(secretDraftInputs).some(
      (entry) => Object.keys(entry).length > 0
    ),
  };
}

function getStoredSelectedBroker(fallback = BROKER_PROVIDERS.INTERNAL_PAPER) {
  if (typeof window === "undefined") return fallback;
  return normalizeBrokerProvider(
    window.localStorage.getItem(SELECTED_BROKER_STORAGE_KEY),
    fallback
  );
}

function getStoredDraftConfigs() {
  if (typeof window === "undefined") {
    return getEmptyDraftConfigs();
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(BROKER_CONFIG_STORAGE_KEY) || "{}");
    const { safeDraftConfigs, hadForbiddenKeys } = splitStoredBrokerConfigPayload(parsed);

    if (hadForbiddenKeys) {
      window.localStorage.setItem(
        BROKER_CONFIG_STORAGE_KEY,
        JSON.stringify(safeDraftConfigs)
      );
    }

    return safeDraftConfigs;
  } catch {
    return getEmptyDraftConfigs();
  }
}

function normalizeDraftConfig(provider, config = {}) {
  if (provider !== BROKER_PROVIDERS.MOOMOO) {
    return config || {};
  }

  const securityFirmAliases = {
    MOOMOO: "FUTUSECURITIES",
    FUTU: "FUTUSECURITIES",
    FUTU_SECURITIES: "FUTUSECURITIES",
    FUTUSECURITIES: "FUTUSECURITIES",
    FUTUINC: "FUTUINC",
    FUTUSG: "FUTUSG",
  };
  const securityFirm = String(config?.securityFirm || "FUTUSECURITIES")
    .trim()
    .toUpperCase();

  return {
    ...config,
    port: config?.port == null ? "" : String(config.port),
    tradeEnv: config?.tradeEnv || config?.defaultTrdEnv || "SIMULATE",
    securityFirm: securityFirmAliases[securityFirm] || "FUTUSECURITIES",
    websocketSsl:
      typeof config?.websocketSsl === "boolean"
        ? String(config.websocketSsl)
        : String(config?.websocketSsl ?? "false"),
    accountId: config?.accountId || config?.defaultAccId || "",
  };
}

function makeAccountSelectionValue(tradeEnv, accountId) {
  const normalizedAccountId = String(accountId || "").trim();
  if (!normalizedAccountId) return "";
  const normalizedTradeEnv =
    String(tradeEnv || "SIMULATE").trim().toUpperCase() === "REAL"
      ? "REAL"
      : "SIMULATE";
  return `${normalizedTradeEnv}:${normalizedAccountId}`;
}

function getAccountSelectionValue(account) {
  return account?.selectionKey || makeAccountSelectionValue(account?.tradeEnv, account?.accountId);
}

function parseAccountSelectionValue(value, fallbackTradeEnv = "SIMULATE") {
  const raw = String(value || "").trim();
  if (!raw) {
    return { accountId: "", tradeEnv: fallbackTradeEnv };
  }
  const [maybeTradeEnv, ...accountParts] = raw.split(":");
  const normalizedMaybeTradeEnv = String(maybeTradeEnv || "").trim().toUpperCase();
  if ((normalizedMaybeTradeEnv === "REAL" || normalizedMaybeTradeEnv === "SIMULATE") && accountParts.length > 0) {
    return {
      accountId: accountParts.join(":"),
      tradeEnv: normalizedMaybeTradeEnv,
    };
  }
  return {
    accountId: raw,
    tradeEnv: fallbackTradeEnv,
  };
}

function formatProviderLabel(provider) {
  return BROKER_METADATA[normalizeBrokerProvider(provider)]?.label || "Broker";
}

function emitTradingSessionChanged(provider) {
  window.dispatchEvent(
    new CustomEvent("trading-dashboard:trading-session-changed", {
      detail: { provider },
    })
  );
}

function getExecutionModeForProvider(provider) {
  if (provider === BROKER_PROVIDERS.MOOMOO) return "PAPER_BROKER";
  if (provider === BROKER_PROVIDERS.INTERNAL_PAPER) return "INTERNAL_PAPER";
  return "READ_ONLY";
}

function formatStatus(value, positive = "Connected", negative = "Disconnected") {
  return value ? positive : negative;
}

function capabilityStateFromSupport(support, fallback = false) {
  if (!support?.supported) return "blocked";
  return support.mode === "PARTIAL" || support.mode === "DERIVED_OR_DIRECT" || support.mode === "LIVE_ONLY"
    ? "partial"
    : fallback
      ? "available"
      : "available";
}

function buildHealthItems(provider, health) {
  if (provider === BROKER_PROVIDERS.INTERNAL_PAPER) {
    return [
      { label: "Engine", value: "Built in" },
      { label: "Connected", value: true, render: (value) => formatStatus(value) },
      { label: "Paper / Live", value: "Paper" },
      { label: "Execution", value: "Ready" },
      { label: "Ledger", value: "Primary source" },
      { label: "Last Error", value: health?.lastError || "-" },
    ];
  }

  if (provider === BROKER_PROVIDERS.MOOMOO) {
    return [
      { label: "Recovery", value: health?.recoveredByRetry ? `Recovered after ${health?.retryCount || 0} retr${health?.retryCount === 1 ? "y" : "ies"}` : "Not needed" },
      { label: "OpenD Running", value: health?.gatewayRunning, render: (value) => formatStatus(value, "Running", "Offline") },
      { label: "OpenD Reachable", value: health?.opendReachable, render: (value) => formatStatus(value, "Reachable", "Unreachable") },
      { label: "Connected", value: health?.connected, render: (value) => formatStatus(value) },
      { label: "Protocol Used", value: health?.protocolUsed || "-" },
      { label: "Logged In", value: health?.loggedIn, render: (value) => formatStatus(value, "Logged in", "Login required") },
      { label: "Account Loaded", value: health?.accountLoaded, render: (value) => formatStatus(value, "Loaded", "Not loaded") },
      { label: "Account List", value: health?.accountListResult || "-" },
      { label: "Accounts Found", value: health?.accountsFound ?? 0 },
      { label: "Quote Permission", value: health?.marketDataAvailable, render: (value) => formatStatus(value, "Available", "Unavailable") },
      { label: "Trading Permission", value: health?.orderPermission, render: (value) => formatStatus(value, "Available", "Locked") },
      { label: "Paper / Live", value: health?.paperMode ? "Paper" : "Live" },
      { label: "Failure Category", value: health?.failureCategory || "-" },
      { label: "Provider Warning", value: health?.providerWarning || "-" },
      { label: "Last Error", value: health?.lastError || "-" },
    ];
  }

  return [
    { label: "Connected", value: health?.connected, render: (value) => formatStatus(value) },
    { label: "Gateway", value: health?.gatewayRunning, render: (value) => formatStatus(value, "Running", "Offline") },
    { label: "Account Loaded", value: health?.accountLoaded, render: (value) => formatStatus(value, "Loaded", "Unavailable") },
    { label: "Market Data", value: health?.marketDataAvailable, render: (value) => formatStatus(value, "Available", "Unavailable") },
    { label: "Trading Permission", value: health?.orderPermission, render: (value) => formatStatus(value, "Available", "Locked") },
    { label: "Paper / Live", value: health?.paperMode ? "Paper" : "Live" },
    { label: "Last Error", value: health?.lastError || "-" },
    { label: "Heartbeat", value: health?.lastHeartbeat ? new Date(health.lastHeartbeat).toLocaleString() : "Never" },
  ];
}

function buildCapabilityItems(provider, capabilities) {
  if (provider === BROKER_PROVIDERS.INTERNAL_PAPER) {
    return [
      { label: "Execute paper", state: "available", detail: "Simulated execution is built directly into the platform." },
      { label: "Ledger", state: "available", detail: "Paper fills and balances update the internal ledger." },
      { label: "Scanner", state: "available", detail: "Scanner workflows can feed approvals without touching a live broker." },
      { label: "Broker gateway", state: "blocked", detail: "No external broker bridge is required." },
      { label: "Quotes", state: "partial", detail: "Use platform data surfaces instead of an external quote entitlement." },
      { label: "Live execution", state: "blocked", detail: "Live trading remains disabled." },
    ];
  }

  return [
    {
      label: "Account",
      state: capabilities?.canReadAccount ? "available" : "blocked",
      detail: capabilities?.canReadAccount ? "Account summary is readable." : "Account summary is not available yet.",
    },
    {
      label: "Positions",
      state: capabilities?.canReadPositions ? "available" : "blocked",
      detail: capabilities?.canReadPositions ? "Position sync is supported." : "Positions are not readable.",
    },
    {
      label: "Orders",
      state: capabilities?.canReadOpenOrders ? "available" : "blocked",
      detail: capabilities?.canReadOpenOrders ? "Open orders are readable." : "Order sync is unavailable.",
    },
    {
      label: "Quotes",
      state: capabilityStateFromSupport(capabilities?.supports?.marketSnapshot),
      detail: capabilities?.supports?.marketSnapshot?.supported
        ? `Market snapshot support: ${capabilities.supports.marketSnapshot.mode}.`
        : "Quotes are not available from this adapter.",
    },
    {
      label: "Preview",
      state: capabilityStateFromSupport(capabilities?.supports?.previewOrder),
      detail: capabilities?.supports?.previewOrder?.supported
        ? `Preview support: ${capabilities.supports.previewOrder.mode}.`
        : "Order preview is not supported.",
    },
    {
      label: "Paper Orders",
      state: capabilities?.canPlaceOrders ? "available" : "blocked",
      detail: capabilities?.canPlaceOrders
        ? "Paper-routed broker orders are available behind approval and safety gates."
        : "Broker-routed paper orders remain locked.",
    },
    {
      label: "Live Disabled",
      state: capabilities?.liveExecutionEnabled ? "available" : "blocked",
      detail: capabilities?.liveExecutionEnabled
        ? "Live execution is enabled."
        : "Live execution is disabled by app policy.",
    },
  ];
}

function buildWizardProgress(provider, health, config) {
  if (provider === BROKER_PROVIDERS.INTERNAL_PAPER) {
    return 5;
  }

  if (provider === BROKER_PROVIDERS.MOOMOO) {
    let completed = 0;
    if (health?.gatewayRunning) completed += 1;
    if (health?.connected) completed += 1;
    if (config?.host && config?.port) completed += 1;
    if (health?.accountLoaded) completed += 1;
    if (health?.orderPermission || health?.marketDataAvailable) completed += 1;
    return completed;
  }

  let completed = 0;
  if (config?.host) completed += 1;
  if (config?.port) completed += 1;
  if (config?.clientId) completed += 1;
  if (health?.connected) completed += 1;
  if (health?.accountLoaded) completed += 1;
  return completed;
}

function BrokerStatusHero({ brokerMeta, capabilityItems, health, providerMismatch }) {
  const statusText = health?.connected
    ? health.paperMode
      ? "Connected · Paper"
      : "Connected · Live"
    : brokerMeta.tag;

  return (
    <article className="ibkr-card broker-hero-card">
      <div className="broker-card-header">
        <div>
          <p className="eyebrow">Selected Broker</p>
          <h3>{brokerMeta.label}</h3>
        </div>
        <span className={`ibkr-status ${String(health?.status || brokerMeta.tag).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`}>
          {statusText}
        </span>
      </div>
      <p className="broker-hero-copy">{brokerMeta.description}</p>
      <div className="broker-hero-meta">
        <div>
          <span>Capabilities</span>
          <strong>{brokerMeta.heroCapabilities.join(" · ")}</strong>
        </div>
        <div>
          <span>Version</span>
          <strong>{brokerMeta.version}</strong>
        </div>
        <div>
          <span>Mode</span>
          <strong>{health?.paperMode ? "Paper" : "Live"}</strong>
        </div>
      </div>
      <div className="broker-chip-row">
        {capabilityItems.slice(0, 4).map((item) => (
          <span className={`broker-capability-chip capability-${item.state}`} key={item.label}>
            {item.label}
          </span>
        ))}
      </div>
      {providerMismatch ? (
        <p className="ibkr-note">
          Backend adapter currently active: {providerMismatch}. This view still updates the setup guide,
          health layout, and readiness explanation for the broker you selected.
        </p>
      ) : null}
    </article>
  );
}

function SetupGuideCard({ brokerMeta }) {
  return (
    <article className="ibkr-card">
      <div>
        <p className="eyebrow">Setup Guide</p>
        <h3>{brokerMeta.label} connection guide</h3>
      </div>
      <ol className="ibkr-instructions">
        {brokerMeta.setupGuide.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </article>
  );
}

function SetupWizardCard({ brokerMeta, completedSteps }) {
  return (
    <article className="ibkr-card">
      <div className="broker-card-header">
        <div>
          <p className="eyebrow">Setup Wizard</p>
          <h3>{brokerMeta.label} setup flow</h3>
        </div>
        <span className="ibkr-status limited">
          {Math.min(completedSteps, brokerMeta.wizard.length)} / {brokerMeta.wizard.length}
        </span>
      </div>
      <div className="broker-wizard-steps">
        {brokerMeta.wizard.map((step, index) => (
          <div className={`broker-wizard-step${index < completedSteps ? " is-complete" : ""}`} key={step.title}>
            <span className="broker-wizard-step__index">{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function BrokerPage({
  account,
  capabilities,
  config,
  error,
  fills,
  health,
  isSaving,
  isTesting,
  logs,
  onChange,
  onRefresh,
  onSave,
  onTest,
  orders,
  preflight,
  reconciliation,
}) {
  const actualProvider = useMemo(
    () =>
      normalizeBrokerProvider(
        health?.provider || account?.provider || capabilities?.provider || BROKER_PROVIDERS.MOOMOO,
        BROKER_PROVIDERS.MOOMOO
      ),
    [account?.provider, capabilities?.provider, health?.provider]
  );
  const [selectedBroker, setSelectedBroker] = useState(() =>
    getStoredSelectedBroker(actualProvider)
  );
  const [safeDraftConfigs, setSafeDraftConfigs] = useState(getStoredDraftConfigs);
  const [secretDraftInputs, setSecretDraftInputs] = useState(getEmptySecretDraftInputs);
  const [secretStatus, setSecretStatus] = useState(null);
  const [configMeta, setConfigMeta] = useState(null);
  const [accountOptions, setAccountOptions] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [localError, setLocalError] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [isTestingSelectedBroker, setIsTestingSelectedBroker] = useState(false);
  const [isSavingDraftConfig, setIsSavingDraftConfig] = useState(false);
  const [isRefreshingAccounts, setIsRefreshingAccounts] = useState(false);
  const [isSyncingLedger, setIsSyncingLedger] = useState(false);
  const [reconciliationOverride, setReconciliationOverride] = useState(null);
  const [preflightOverride, setPreflightOverride] = useState(null);
  const [ledgerConfirmDialogOpen, setLedgerConfirmDialogOpen] = useState(false);
  const ledgerConfirmResolverRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem(SELECTED_BROKER_STORAGE_KEY, selectedBroker);
  }, [selectedBroker]);

  useEffect(() => {
    const sanitizedPayload = Object.fromEntries(
      Object.entries(safeDraftConfigs).map(([provider, config]) => [
        provider,
        sanitizeBrokerConfigForStorage(config, provider),
      ])
    );
    window.localStorage.setItem(BROKER_CONFIG_STORAGE_KEY, JSON.stringify(sanitizedPayload));
  }, [safeDraftConfigs]);

  useEffect(() => {
    setSafeDraftConfigs((current) => ({
      ...current,
      [BROKER_PROVIDERS.IBKR]: {
        ...current[BROKER_PROVIDERS.IBKR],
        ...getDefaultBrokerConfig(BROKER_PROVIDERS.IBKR),
        ...(config || {}),
      },
    }));
  }, [config]);

  useEffect(() => {
    let cancelled = false;

    getBrokerConfig(selectedBroker)
      .then((payload) => {
        if (cancelled) return;
        setConfigMeta(payload);
        setSecretStatus(payload?.secretStatus || null);
        const nextConfig = normalizeDraftConfig(
          selectedBroker,
          Object.keys(payload?.config || {}).length > 0
            ? payload.config
            : payload?.effectiveConfig || {}
        );
        setSafeDraftConfigs((current) => ({
          ...current,
          [selectedBroker]: {
            ...current[selectedBroker],
            ...nextConfig,
          },
        }));
        if (selectedBroker === BROKER_PROVIDERS.MOOMOO) {
          const resolvedAccountId =
            nextConfig.accountId ||
            payload?.config?.accountId ||
            payload?.effectiveConfig?.accountId ||
            "";
          const resolvedTradeEnv =
            nextConfig.tradeEnv ||
            payload?.config?.tradeEnv ||
            payload?.effectiveConfig?.tradeEnv ||
            "SIMULATE";
          setSelectedAccountId(makeAccountSelectionValue(resolvedTradeEnv, resolvedAccountId));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLocalError((current) => current || error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBroker]);

  useEffect(() => {
    if (selectedBroker !== BROKER_PROVIDERS.MOOMOO) {
      setAccountOptions([]);
      setSelectedAccountId("");
    }
  }, [selectedBroker]);

  useEffect(() => {
    const clearSecrets = () => {
      setSecretDraftInputs(getEmptySecretDraftInputs());
    };

    window.addEventListener("trading-dashboard:logout", clearSecrets);
    return () => {
      window.removeEventListener("trading-dashboard:logout", clearSecrets);
    };
  }, []);

  useEffect(() => {
    if (
      reconciliationOverride &&
      reconciliation &&
      reconciliation.status === reconciliationOverride.status &&
      reconciliation.syncScore === reconciliationOverride.syncScore
    ) {
      setReconciliationOverride(null);
    }
  }, [reconciliation, reconciliationOverride]);

  useEffect(() => {
    if (
      preflightOverride &&
      preflight &&
      preflight.overall === preflightOverride.overall
    ) {
      setPreflightOverride(null);
    }
  }, [preflight, preflightOverride]);

  const brokerMeta = BROKER_METADATA[selectedBroker];
  const selectedConfig = safeDraftConfigs[selectedBroker] || {};
  const selectedSecretInputs = secretDraftInputs[selectedBroker] || {};
  const selectedSecretFields = brokerMeta.secretFields || [];
  const isConfiguredProvider =
    selectedBroker === actualProvider && selectedBroker !== BROKER_PROVIDERS.INTERNAL_PAPER;

  const {
    isSyncing: isBackgroundSyncingLedger,
    requestLedgerSync,
    syncState: ledgerSyncState,
  } = useAutoBrokerLedgerSync({
    enabled: isConfiguredProvider,
    provider: actualProvider,
    reconciliation,
    triggerKey: reconciliation?.lastChecked || reconciliation?.syncScore || "",
    onSynced: async (result) => {
      if (result?.reconciliation) {
        setReconciliationOverride(result.reconciliation);
      }
      if (result?.preflight) {
        setPreflightOverride(result.preflight);
      }
      await onRefresh?.();
    },
  });

  useEffect(() => {
    if (
      selectedBroker === BROKER_PROVIDERS.MOOMOO &&
      (selectedAccountId || selectedConfig.accountId)
    ) {
      refreshAccounts();
    }
  // intentionally key off persisted selection so the account option list repopulates on remount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBroker, selectedAccountId, selectedConfig.accountId]);

  const effectiveHealth =
    selectedBroker === BROKER_PROVIDERS.INTERNAL_PAPER
      ? BROKER_METADATA[BROKER_PROVIDERS.INTERNAL_PAPER].staticHealth
      : isConfiguredProvider
        ? health
        : {
            provider: selectedBroker,
            connected: false,
            gatewayRunning: false,
            paperMode: selectedBroker !== BROKER_PROVIDERS.MOOMOO || selectedConfig.tradeEnv !== "REAL",
            accountLoaded: false,
            marketDataAvailable: false,
            orderPermission: false,
            status: selectedBroker === BROKER_PROVIDERS.IBKR ? "COMING_SOON" : "NOT_ACTIVE",
            lastError: null,
            config: selectedConfig,
          };

  const effectiveAccount =
    selectedBroker === BROKER_PROVIDERS.INTERNAL_PAPER
      ? BROKER_METADATA[BROKER_PROVIDERS.INTERNAL_PAPER].staticAccount
      : isConfiguredProvider
        ? account
        : {
            provider: selectedBroker,
            available: false,
            reason:
              selectedBroker === BROKER_PROVIDERS.IBKR
                ? "IBKR remains a future or read-only surface here."
                : `Backend adapter is currently ${formatProviderLabel(actualProvider)}.`,
            cash: null,
            buyingPower: null,
            equity: null,
            currency: "USD",
            positions: [],
            openOrders: [],
            margin: null,
            accountType: selectedBroker === BROKER_PROVIDERS.MOOMOO ? "Paper / Live via OpenD" : "Read-only",
          };

  const effectivePreflight =
    selectedBroker === BROKER_PROVIDERS.INTERNAL_PAPER
      ? BROKER_METADATA[BROKER_PROVIDERS.INTERNAL_PAPER].staticPreflight
      : isConfiguredProvider
        ? preflightOverride || preflight
        : {
            overall: selectedBroker === BROKER_PROVIDERS.IBKR ? "WARNING" : "BLOCKED",
            executionLocked: true,
            checks:
              selectedBroker === BROKER_PROVIDERS.IBKR
                ? [
                    { key: "adapter", label: "Adapter state", status: "WARNING", detail: "IBKR remains read-only or future-facing on this page." },
                    { key: "execution", label: "Execution", status: "BLOCKED", detail: "Execution stays disabled for this broker selection." },
                  ]
                : [
                    { key: "opend", label: "OpenD", status: "BLOCKED", detail: "Broker health is unavailable until the backend is using Moomoo." },
                    { key: "approval", label: "Approval workflow", status: "PASS", detail: "Approvals remain required regardless of broker." },
                    { key: "safety", label: "Safety", status: "PASS", detail: "Safety checks stay in control before execution." },
                    { key: "reconciliation", label: "Reconciliation", status: "WARNING", detail: "Broker comparison updates when the selected adapter is active." },
                  ],
          };

  const effectiveReconciliation =
    selectedBroker === BROKER_PROVIDERS.INTERNAL_PAPER
      ? BROKER_METADATA[BROKER_PROVIDERS.INTERNAL_PAPER].staticReconciliation
      : isConfiguredProvider
        ? reconciliationOverride || reconciliation
        : {
            status: "WARNING",
            syncScore: 0,
            cashDifference: null,
            missingPositions: [],
            extraPositions: [],
            positionDifferences: [],
            brokerReason:
              selectedBroker === BROKER_PROVIDERS.IBKR
                ? "Broker comparison will become available when the IBKR adapter is active."
                : `Broker comparison updates when ${brokerMeta.label} is the active backend adapter.`,
          };

  const capabilityItems = useMemo(
    () => buildCapabilityItems(selectedBroker, isConfiguredProvider ? capabilities : null),
    [capabilities, isConfiguredProvider, selectedBroker]
  );
  const healthItems = useMemo(
    () => buildHealthItems(selectedBroker, effectiveHealth),
    [effectiveHealth, selectedBroker]
  );
  const wizardProgress = useMemo(
    () => buildWizardProgress(selectedBroker, effectiveHealth, selectedConfig),
    [effectiveHealth, selectedBroker, selectedConfig]
  );

  const effectiveNotes =
    selectedBroker === BROKER_PROVIDERS.INTERNAL_PAPER
      ? ["Internal Paper is built into the platform and never exposes an external broker session."]
      : isConfiguredProvider
        ? capabilities?.notes || []
        : selectedBroker === BROKER_PROVIDERS.IBKR
          ? ["IBKR remains in the product for future or read-only use. Broker execution stays disabled here."]
          : ["OpenD is required for every Moomoo connection. Switch the backend adapter to Moomoo to see live diagnostics on this page."];

  async function handleBrokerSelectionChange(event) {
    const nextProvider = normalizeBrokerProvider(
      event.target.value,
      BROKER_PROVIDERS.INTERNAL_PAPER
    );
    setLocalError("");
    setLocalMessage("");
    setSelectedBroker(nextProvider);
    setIsSavingDraftConfig(true);
    try {
      await saveSelectedBrokerConfig(
        nextProvider,
        nextProvider === BROKER_PROVIDERS.INTERNAL_PAPER
          ? {}
          : safeDraftConfigs[nextProvider] || {},
        getExecutionModeForProvider(nextProvider)
      );
      await onRefresh?.();
      emitTradingSessionChanged(nextProvider);
      setLocalMessage(`${formatProviderLabel(nextProvider)} is now the active trading provider.`);
    } catch (error) {
      setLocalError(error.message);
    } finally {
      setIsSavingDraftConfig(false);
    }
  }

  function handleConfigChange(field, value) {
    setSafeDraftConfigs((current) => ({
      ...current,
      [selectedBroker]: {
        ...sanitizeBrokerConfigForStorage(current[selectedBroker], selectedBroker),
        [field]: value,
      },
    }));
    if (field === "accountId") {
      setSelectedAccountId(makeAccountSelectionValue(selectedConfig.tradeEnv, value));
    }
    if (field === "tradeEnv" && selectedConfig.accountId) {
      setSelectedAccountId(makeAccountSelectionValue(value, selectedConfig.accountId));
    }
    if (selectedBroker === BROKER_PROVIDERS.IBKR && actualProvider === BROKER_PROVIDERS.IBKR) {
      onChange(field, value);
    }
  }

  function handleSecretChange(field, value) {
    setSecretDraftInputs((current) => ({
      ...current,
      [selectedBroker]: {
        ...current[selectedBroker],
        [field]: value,
      },
    }));
  }

  function clearSelectedSecretInputs() {
    setSecretDraftInputs((current) => ({
      ...current,
      [selectedBroker]: {},
    }));
  }

  function buildSecretPayload() {
    return Object.fromEntries(
      Object.entries(selectedSecretInputs).filter(([, value]) => String(value || "").trim() !== "")
    );
  }

  async function refreshSelectedBrokerConfig() {
    const payload = await getBrokerConfig(selectedBroker);
    setConfigMeta(payload);
    setSecretStatus(payload?.secretStatus || null);
    return payload;
  }

  async function refreshAccounts() {
    if (selectedBroker !== BROKER_PROVIDERS.MOOMOO) return;
    setIsRefreshingAccounts(true);
    setLocalError("");
    try {
      const result = await getBrokerAccounts(selectedBroker);
      const savedSelection = selectedAccountId || makeAccountSelectionValue(
        selectedConfig.tradeEnv || configMeta?.effectiveConfig?.tradeEnv,
        selectedConfig.accountId || configMeta?.effectiveConfig?.accountId
      );
      const savedAccount = parseAccountSelectionValue(
        savedSelection,
        selectedConfig.tradeEnv || configMeta?.effectiveConfig?.tradeEnv || "SIMULATE"
      );
      const savedAccountId = savedAccount.accountId;
      const savedTradeEnv = savedAccount.tradeEnv;
      const mergedAccounts = [...(result?.accounts || [])];
      if (
        savedAccountId &&
        !mergedAccounts.some((account) => getAccountSelectionValue(account) === makeAccountSelectionValue(savedTradeEnv, savedAccountId))
      ) {
        mergedAccounts.unshift({
          accountId: savedAccountId,
          accountType: "Saved",
          tradeEnv: savedTradeEnv,
          market: selectedConfig.market || configMeta?.effectiveConfig?.market || "US",
          selectionKey: makeAccountSelectionValue(savedTradeEnv, savedAccountId),
          displayName: `Saved account · ${savedTradeEnv} · ${savedAccountId}`,
        });
      }
      setAccountOptions(mergedAccounts);
      setLocalMessage(
        mergedAccounts.length
          ? `Loaded ${mergedAccounts.length} account${mergedAccounts.length === 1 ? "" : "s"}.`
          : "No accounts were returned from OpenD."
      );
    } catch (error) {
      setLocalError(error.message);
    } finally {
      setIsRefreshingAccounts(false);
    }
  }

  async function handleSelectAccount() {
    if (!selectedAccountId) return;
    const selectedAccount = parseAccountSelectionValue(
      selectedAccountId,
      selectedConfig.tradeEnv || "SIMULATE"
    );
    setIsSavingDraftConfig(true);
    setLocalError("");
    setLocalMessage("");
    try {
      await saveSelectedBrokerConfig(
        selectedBroker,
        {
          ...selectedConfig,
          accountId: selectedAccount.accountId,
          tradeEnv: selectedAccount.tradeEnv,
        },
        getExecutionModeForProvider(selectedBroker)
      );
      setSafeDraftConfigs((current) => ({
        ...current,
        [selectedBroker]: {
          ...current[selectedBroker],
          accountId: selectedAccount.accountId,
          tradeEnv: selectedAccount.tradeEnv,
        },
      }));
      await refreshSelectedBrokerConfig();
      await onRefresh?.();
      emitTradingSessionChanged(selectedBroker);
      setLocalMessage("Account selection saved.");
    } catch (error) {
      setLocalError(error.message);
    } finally {
      setIsSavingDraftConfig(false);
    }
  }

  async function handleSaveConfig() {
    setLocalError("");
    setLocalMessage("");
    const secrets = buildSecretPayload();

    if (selectedBroker === BROKER_PROVIDERS.INTERNAL_PAPER) {
      setIsSavingDraftConfig(true);
      try {
        await saveSelectedBrokerConfig(
          BROKER_PROVIDERS.INTERNAL_PAPER,
          {},
          "INTERNAL_PAPER"
        );
        await refreshSelectedBrokerConfig();
        await onRefresh?.();
        emitTradingSessionChanged(BROKER_PROVIDERS.INTERNAL_PAPER);
        setLocalMessage("Internal Paper is now the active trading provider.");
      } finally {
        setIsSavingDraftConfig(false);
      }
      return;
    }

    if (selectedBroker === BROKER_PROVIDERS.IBKR && actualProvider === BROKER_PROVIDERS.IBKR) {
      if (Object.keys(secrets).length > 0) {
        const status = await saveBrokerSecrets(selectedBroker, secrets);
        setSecretStatus(status);
        clearSelectedSecretInputs();
      }
      await onSave();
      emitTradingSessionChanged(selectedBroker);
      return;
    }

    setIsSavingDraftConfig(true);
    try {
      if (Object.keys(secrets).length > 0) {
        const status = await saveBrokerSecrets(selectedBroker, secrets);
        setSecretStatus(status);
        clearSelectedSecretInputs();
      }
      await saveSelectedBrokerConfig(
        selectedBroker,
        selectedConfig,
        getExecutionModeForProvider(selectedBroker)
      );
      await refreshSelectedBrokerConfig();
      await onRefresh?.();
      emitTradingSessionChanged(selectedBroker);
      setLocalMessage(`${brokerMeta.label} settings saved and backend adapter updated.`);
    } finally {
      setIsSavingDraftConfig(false);
    }
  }

  async function handleTestConnection() {
    setLocalError("");
    setLocalMessage("");

    if (selectedBroker === BROKER_PROVIDERS.INTERNAL_PAPER) {
      setLocalMessage("Internal Paper is always ready. No external connection test is required.");
      return;
    }

    setIsTestingSelectedBroker(true);
    try {
      const result = await brokerRequest("/api/broker/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selectedConfig,
          secrets: buildSecretPayload(),
          provider: selectedBroker,
        }),
      });
      if (result?.secretStatus) {
        setSecretStatus(result.secretStatus);
        clearSelectedSecretInputs();
      }
      await refreshSelectedBrokerConfig();
      await onRefresh?.();
      emitTradingSessionChanged(selectedBroker);
      setLocalMessage(
        result?.result?.connected
          ? `${brokerMeta.label} connection test passed.`
          : result?.result?.error || `${brokerMeta.label} connection test finished with warnings.`
      );
    } catch (testError) {
      setLocalError(testError.message);
    } finally {
      setIsTestingSelectedBroker(false);
    }
  }

  async function handleSyncLedger() {
    if (!isConfiguredProvider || selectedBroker === BROKER_PROVIDERS.INTERNAL_PAPER) {
      return;
    }

    const shouldContinue = await new Promise((resolve) => {
      ledgerConfirmResolverRef.current = resolve;
      setLedgerConfirmDialogOpen(true);
    });
    if (!shouldContinue) {
      return;
    }

    setIsSyncingLedger(true);
    setLocalError("");
    setLocalMessage("");
    try {
      const result = await requestLedgerSync({
        force: true,
        reason: "manual ledger sync",
      });
      if (result?.reconciliation) {
        setReconciliationOverride(result.reconciliation);
      }
      if (result?.preflight) {
        setPreflightOverride(result.preflight);
      }
      await onRefresh?.();
      emitTradingSessionChanged(selectedBroker);
      const positionsTouched = result?.syncSummary?.positionsTouched || 0;
      const cashAdjustment = Number(result?.syncSummary?.cashAdjustment || 0);
      setLocalMessage(
        positionsTouched || Math.abs(cashAdjustment) > 0.01
          ? `Ledger synced from ${brokerMeta.label}: ${positionsTouched} position${
              positionsTouched === 1 ? "" : "s"
            } mirrored and cash adjusted by ${cashAdjustment.toFixed(2)}.`
          : `Ledger already matched ${brokerMeta.label}. Reconciliation was refreshed.`
      );
    } catch (syncError) {
      setLocalError(syncError.message);
    } finally {
      setIsSyncingLedger(false);
    }
  }

  async function handleImportBrokerOrder(row) {
    setLocalError("");
    setLocalMessage("");
    const result = await importBrokerOrder({
      brokerOrderId: row?.brokerOrderId || null,
      symbol: row?.symbol || null,
    });
    await onRefresh?.();
    emitTradingSessionChanged(selectedBroker);
    setLocalMessage(
      result?.alreadyTracked
        ? "Broker order was already tracked in Quant's Trade."
        : `Imported broker order ${row?.brokerOrderId || ""} into Quant's Trade.`
    );
  }

  async function handleSyncMismatchOrder(row) {
    if (!row?.localOrderId) return;
    setLocalError("");
    setLocalMessage("");
    await syncBrokerOrder(row.localOrderId);
    await onRefresh?.();
    emitTradingSessionChanged(selectedBroker);
    setLocalMessage(
      row?.brokerOrderId
        ? `Refreshed broker status for order ${row.brokerOrderId}.`
        : "Refreshed broker status for the tracked order."
    );
  }

  async function handleMarkMismatchCancelled(row) {
    if (!row?.localOrderId) return;
    setLocalError("");
    setLocalMessage("");
    await markBrokerOrderCancelled(row.localOrderId, {
      reason:
        "Marked cancelled from reconciliation because this order no longer appears in broker open orders.",
    });
    await onRefresh?.();
    emitTradingSessionChanged(selectedBroker);
    setLocalMessage(
      row?.clientOrderId
        ? `Marked tracked order ${row.clientOrderId} as cancelled in Quant's Trade.`
        : "Marked the tracked order as cancelled in Quant's Trade."
    );
  }

  const combinedError = localError || error;
  const providerMismatch =
    !isConfiguredProvider && selectedBroker !== BROKER_PROVIDERS.INTERNAL_PAPER
      ? formatProviderLabel(actualProvider)
      : "";

  function handleLedgerDialogClose(confirmed) {
    const resolver = ledgerConfirmResolverRef.current;
    ledgerConfirmResolverRef.current = null;
    setLedgerConfirmDialogOpen(false);
    resolver?.(confirmed);
  }

  return (
    <section className="ibkr-panel broker-readiness-panel">
      <ConfirmDialog
        cancelLabel="Cancel"
        confirmLabel="Sync ledger"
        message={`Mirror the current ${brokerMeta.label} broker account into the cockpit ledger?\n\nThis keeps the ledger append-only and adds reconciliation adjustment events instead of rewriting history.`}
        onCancel={() => handleLedgerDialogClose(false)}
        onConfirm={() => handleLedgerDialogClose(true)}
        open={ledgerConfirmDialogOpen}
        title="Sync broker account into ledger"
        tone="warning"
      />
      <div className="alerts-panel-header broker-page-header broker-center-header">
        <div>
          <p className="eyebrow">Broker Center</p>
          <h2>Broker Connection Center</h2>
          <span>
            Connect a broker, monitor account health, reconcile positions, and manage execution
            readiness.
          </span>
        </div>
        <label className="broker-selector">
          <span>Broker</span>
          <select value={selectedBroker} onChange={handleBrokerSelectionChange}>
            <option value={BROKER_PROVIDERS.INTERNAL_PAPER}>Internal Paper</option>
            <option value={BROKER_PROVIDERS.MOOMOO}>Moomoo</option>
            <option value={BROKER_PROVIDERS.IBKR}>IBKR (Coming Soon)</option>
          </select>
        </label>
      </div>

      <div className="broker-section-nav" aria-label="Broker Center sections">
        {["Overview", "Setup Guide", "Broker Health", "Account Snapshot", "Capability Matrix", "Preflight", "Reconciliation", "Connection Logs"].map((section) => (
          <span key={section}>{section}</span>
        ))}
      </div>

      {localMessage ? <div className="broker-inline-banner">{localMessage}</div> : null}

      <BrokerStatusHero
        brokerMeta={brokerMeta}
        capabilityItems={capabilityItems}
        health={effectiveHealth}
        providerMismatch={providerMismatch}
      />

      <div className="ibkr-grid broker-overview-grid broker-wizard-grid">
        <SetupWizardCard brokerMeta={brokerMeta} completedSteps={wizardProgress} />
        <SetupGuideCard brokerMeta={brokerMeta} />
      </div>

      <div className="ibkr-grid broker-overview-grid">
        <BrokerHealthCard
          brokerMeta={brokerMeta}
          config={selectedConfig}
          configMeta={configMeta}
          accountOptions={accountOptions}
          selectedAccountId={
            selectedAccountId ||
            makeAccountSelectionValue(selectedConfig.tradeEnv, selectedConfig.accountId)
          }
          configFields={brokerMeta.configFields}
          secretFields={selectedSecretFields}
          secretInputs={selectedSecretInputs}
          secretStatus={secretStatus}
          error={combinedError}
          health={effectiveHealth}
          healthItems={healthItems}
          isConfiguredProvider={isConfiguredProvider}
          isSaving={selectedBroker === BROKER_PROVIDERS.IBKR ? isSaving : isSavingDraftConfig}
          isTesting={selectedBroker === BROKER_PROVIDERS.IBKR ? isTesting : isTestingSelectedBroker}
          isRefreshingAccounts={isRefreshingAccounts}
          onChange={handleConfigChange}
          onSecretChange={handleSecretChange}
          onAccountSelect={setSelectedAccountId}
          onSave={handleSaveConfig}
          onTest={handleTestConnection}
          onRefreshAccounts={refreshAccounts}
          onSelectAccount={handleSelectAccount}
          saveLabel="Save Config"
          testLabel="Test Connection"
        />
        <AccountSnapshot account={effectiveAccount} />
      </div>

      <div className="ibkr-grid broker-overview-grid">
        <CapabilityGrid items={capabilityItems} notes={effectiveNotes} />
        <PreflightChecklist
          preflight={effectivePreflight}
          summary={
            selectedBroker === BROKER_PROVIDERS.INTERNAL_PAPER
              ? "Internal Paper is always ready, but approvals and safety still stay in control."
              : `${brokerMeta.label} only unlocks behind approval, safety, and reconciliation checks.`
          }
        />
      </div>

      <ReconciliationTable
        reconciliation={effectiveReconciliation}
        canSync={isConfiguredProvider}
        isSyncing={isSyncingLedger || isBackgroundSyncingLedger}
        syncState={ledgerSyncState}
        onImportOrder={handleImportBrokerOrder}
        onMarkOrderCancelled={handleMarkMismatchCancelled}
        onSyncOrder={handleSyncMismatchOrder}
        onSync={handleSyncLedger}
      />
      <div className="ibkr-grid broker-overview-grid">
        <BrokerOrdersPanel
          orders={isConfiguredProvider ? orders : []}
          onRefresh={onRefresh}
        />
        <BrokerFillsPanel fills={isConfiguredProvider ? fills : []} />
      </div>
      <ConnectionLogPanel logs={isConfiguredProvider ? logs : []} />
    </section>
  );
}
