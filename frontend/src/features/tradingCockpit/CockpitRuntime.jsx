import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import AppShell from "../../components/Layout/AppShell";
import ChartPanel from "../../components/common/ChartPanel";
import ScanProgressPanel from "../../components/scanner/ScanProgressPanel";
import formatJsonSummary from "../../utils/formatJsonSummary";
import LoginRegisterScreen from "../auth/LoginRegisterScreen";
import LoadingTerminalScreen from "../auth/LoadingTerminalScreen";
import AccessDeniedPage from "../auth/AccessDeniedPage";
import AdminDashboardPage from "../admin/AdminDashboardPage";
import {
  canAccessTab,
  getFirstAccessibleRoute,
  getVisibleTabSections,
  TAB_TO_PAGE_KEY,
  TAB_TO_ROUTE,
} from "../auth/accessControl";
import OpportunityHeatmap from "../dashboard/components/OpportunityHeatmap";
import StockDetailDrawer from "../../components/scanner/StockDetailDrawer";
import BrokerPage from "../broker/BrokerPage";
import useBroker from "../broker/hooks/useBroker";
import AlertsFeaturePage from "../alerts/AlertsPage";
import useAlerts from "../alerts/hooks/useAlerts";
import DashboardFeaturePage from "../dashboard/DashboardPage";
import useDashboard from "../dashboard/hooks/useDashboard";
import ApprovalsFeaturePage from "../approvals/ApprovalsPage";
import useApprovals from "../approvals/hooks/useApprovals";
import usePreTradeAnalysis from "../approvals/hooks/usePreTradeAnalysis";
import useProposedOrders from "../approvals/hooks/useProposedOrders";
import PlaybookPage from "../playbook/PlaybookPage";
import PortfolioFeaturePage from "../portfolio/PortfolioPage";
import usePortfolio from "../portfolio/hooks/usePortfolio";
import ScannerFeaturePage from "../scanner/ScannerPage";
import useScanJobs from "../scanner/hooks/useScanJobs";
import useScanner from "../scanner/hooks/useScanner";
import SettingsFeaturePage from "../settings/SettingsPage";
import useSettings from "../settings/hooks/useSettings";
import useActiveStrategy from "../strategyLab/hooks/useActiveStrategy";
import TradesFeaturePage from "../trades/TradesPage";
import useTrades from "../trades/hooks/useTrades";
import ValidationPage from "../validation/ValidationPage";
import useValidation from "../validation/hooks/useValidation";
import WatchlistFeaturePage from "../watchlist/WatchlistPage";
import useWatchlist from "../watchlist/hooks/useWatchlist";
import useAuth from "../../hooks/useAuth";
import usePortfolioData from "../../hooks/usePortfolioData";
import useRuntimeRefresh from "../../hooks/useRuntimeRefresh";
import useScanData from "../../hooks/useScanData";
import {
  API_BASE_URL,
  apiFetch as fetch,
} from "../../services/apiClient";

const LandingPage = lazy(() => import("../../landing/LandingPage"));
const StrategyLabFeaturePage = lazy(() => import("../strategyLab/StrategyLabPage"));

const ACTIVE_STRATEGY_STORAGE_KEY = "tradingDashboardActiveStrategyExperimentId";
const THEME_STORAGE_KEY = "tradingDashboardTheme";

function getUserStorageKey(key) {
  return key;
}

const FILTERS = ["ALL", "BUY", "HOLD", "SELL"];
const MARKET_FILTERS = ["ALL", "US", "Singapore"];
const EXCHANGE_FILTERS = ["ALL", "NYSE", "NASDAQ", "AMEX", "SGX"];
const CURRENCY_FILTERS = ["ALL", "USD", "SGD"];
const ENGINE_INTERVALS = ["5min", "15min", "30min", "1h"];
const EXECUTION_MODES = {
  MANUAL_APPROVAL: "Manual Approval",
  SEMI_AUTOMATED: "Semi-Automated",
  FULL_AUTOMATION: "Full Automation",
};
const TRADING_HORIZONS = ["INTRADAY", "SWING", "POSITION", "LONG_TERM"];
const HORIZON_SETTINGS = {
  INTRADAY: {
    label: "Intraday",
    interval: "5min",
    marketHoursOnly: true,
    signalThreshold: "55",
    riskHint: "Tighter stops, faster scans, high event sensitivity",
  },
  SWING: {
    label: "Swing",
    interval: "15min",
    marketHoursOnly: true,
    signalThreshold: "60",
    riskHint: "Balanced technical and regime focus",
  },
  POSITION: {
    label: "Position",
    interval: "30min",
    marketHoursOnly: true,
    signalThreshold: "65",
    riskHint: "Wider stops, stronger regime and macro weighting",
  },
  LONG_TERM: {
    label: "Long-Term",
    interval: "1h",
    marketHoursOnly: false,
    signalThreshold: "70",
    riskHint: "Lower frequency with macro/news emphasis",
  },
};
const TABS = [
  "Dashboard",
  "Scanner",
  "Watchlist",
  "Strategy Lab",
  "Playbook",
  "Validation",
  "IBKR",
  "Alerts",
  "Trades",
  "Approvals",
  "Portfolio",
  "Settings",
  "Admin Dashboard",
];
const ADMIN_TABS = new Set(["Playbook", "Validation", "IBKR", "Admin Dashboard"]);
const ROUTE_TO_TAB = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/scanner": "Scanner",
  "/watchlist": "Watchlist",
  "/approvals": "Approvals",
  "/trades": "Trades",
  "/portfolio": "Portfolio",
  "/alerts": "Alerts",
  "/strategy-lab": "Strategy Lab",
  "/playbook": "Playbook",
  "/validation": "Validation",
  "/ibkr": "IBKR",
  "/broker": "IBKR",
  "/settings": "Settings",
  "/admin": "Admin Dashboard",
};

function getInitialTheme() {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

function getInitialTab() {
  if (typeof window === "undefined") {
    return "Dashboard";
  }

  return ROUTE_TO_TAB[window.location.pathname.toLowerCase()] || "Dashboard";
}
const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SNOOZED", "EXECUTED"];
const SIGNAL_COLORS = {
  BUY: "#4cc38a",
  HOLD: "#f4b740",
  SELL: "#ff6b6b",
};

async function runSequentially(tasks) {
  for (const task of tasks) {
    await task();
  }
}

function getFreshnessClass(health) {
  if (!health || health.error) {
    return "critical";
  }

  return health.stale_level || (health.is_stale ? "warning" : "fresh");
}

function formatScanAge(minutes) {
  const value = Number(minutes);

  if (!Number.isFinite(value)) {
    return "No scan age";
  }

  if (value < 1) {
    return "Just now";
  }

  if (value >= 60) {
    return `${(value / 60).toFixed(1)}h old`;
  }

  return `${value.toFixed(1)}m old`;
}

const SORT_OPTIONS = [
  { key: "opportunity_score", label: "Opportunity Score" },
  { key: "confidence", label: "Confidence" },
  { key: "backtest_return", label: "Backtest Return" },
  { key: "drawdown", label: "Drawdown" },
  { key: "win_rate", label: "Win Rate" },
];

const QUICK_FILTERS = [
  { key: "buyOnly", label: "BUY only" },
  { key: "scoreAbove60", label: "Score > threshold" },
  { key: "drawdownBelow10", label: "Drawdown < threshold" },
  { key: "beatsBuyHold", label: "Beat buy-and-hold" },
];

const DEFAULT_SETTINGS = {
  scanLimit: "50",
  riskMultiplier: "1",
  tradingHorizon: "SWING",
  engineInterval: "15min",
  marketHoursOnly: true,
  signalThreshold: "0",
  scoreThreshold: "60",
  alertThreshold: "60",
  drawdownThreshold: "10",
  dailyLossLimit: "3",
  weeklyLossLimit: "6",
  scanWatchlistOnly: false,
  executionMode: "MANUAL_APPROVAL",
  autoExecuteConfidenceThreshold: "85",
  allowTradingNearEarnings: false,
  maxTradeSizeForAutoExecution: "5000",
  allowOvernightPositions: true,
  pauseAutomationDuringMajorMacroEvents: true,
  universeMode: "S_AND_P_500",
  minMarketCap: "10000000000",
  maxMarketCap: "",
  minAverageVolume: "1000000",
  excludePennyStocks: true,
  includeNonSp500: false,
  highRiskMode: false,
  primaryMarket: "US",
  exchangeFilter: "ALL",
  currencyDisplay: "AUTO",
  includeSgx: false,
};

const TAB_HEADER_TITLES = {
  Dashboard: "Trading Opportunity Dashboard",
  Scanner: "Scanner",
  Watchlist: "Watchlist",
  Approvals: "Approvals",
  Trades: "Trades",
  Portfolio: "Portfolio",
  Alerts: "Alerts",
  "Strategy Lab": "Strategy Lab",
  Playbook: "Playbook",
  Validation: "Validation",
  IBKR: "Broker Center",
  Settings: "Settings",
};

function loadSettings() {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(
        localStorage.getItem(getUserStorageKey("tradingDashboardSettings")) ||
          "{}"
      ),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function formatSafetyPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  return `${(numericValue * 100).toFixed(2)}%`;
}

function App({ authOverride, initialTab }) {
  const savedSettings = loadSettings();
  const [showAuthScreen, setShowAuthScreen] = useState(() =>
    typeof window === "undefined"
      ? false
      : ["/login", "/register"].includes(window.location.pathname.toLowerCase())
  );
  const [theme, setTheme] = useState(getInitialTheme);
  const {
    error: authError,
    form: authForm,
    isAuthenticating,
    isChecked: authChecked,
    logout,
    mode: authMode,
    refreshUser: refreshCurrentUser,
    setMode: setAuthMode,
    submit: handleAuthSubmit,
    updateForm: handleAuthFormChange,
    user: authUser,
  } = useAuth(API_BASE_URL, {
    skipInitialSessionCheck: Boolean(authOverride),
  });
  const currentAuthChecked = authOverride?.isChecked ?? authChecked;
  const refreshUser = authOverride?.refreshUser ?? refreshCurrentUser;
  const currentUser = authOverride?.user ?? authUser;
  const [adminToast, setAdminToast] = useState("");
  const [activeTab, setActiveTab] = useState(() => initialTab || getInitialTab());

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.location.pathname.toLowerCase() === "/register"
    ) {
      setAuthMode("register");
    }
  }, [setAuthMode]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(ROUTE_TO_TAB[window.location.pathname.toLowerCase()] || "Dashboard");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setActiveTab]);

  const {
    applyScanData,
    data,
    dataHealth,
    dataHealthError,
    degradedDataSources,
    error,
    fetchDataHealth,
    fetchScanResults,
    fetchSystemDataHealth,
    isRefreshing,
    mergeScanData,
    systemDataHealth,
    updateScanData,
  } = useScanData();
  const [, setScanHistoryData] = useState({ scans: [] });
  const [signalChangesData, setSignalChangesData] = useState({ changes: [] });
  const [playbookData, setPlaybookData] = useState(null);
  const [playbookError, setPlaybookError] = useState("");
  const [playbookExportError, setPlaybookExportError] = useState("");
  const [isGeneratingPlaybookAi, setIsGeneratingPlaybookAi] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [detailSymbol, setDetailSymbol] = useState("");
  const [selectedHistorySymbol, setSelectedHistorySymbol] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const showAdminModeRequired = useCallback(() => {
    setAdminToast("Admin Mode required.");
    window.setTimeout(() => setAdminToast(""), 2800);
  }, []);

  const forceDashboard = useCallback(() => {
    const fallbackRoute = getFirstAccessibleRoute(currentUser);
    const fallbackTab = ROUTE_TO_TAB[fallbackRoute] || "Dashboard";
    setActiveTab(fallbackTab);
    window.history.replaceState({}, "", fallbackRoute);
  }, [currentUser, setActiveTab]);

  const scannerDisplayedRef = useRef([]);

  const portfolioData = usePortfolioData({
    enabled: Boolean(currentUser),
  });
  const {
    activeBrokerAccount,
    resolvedBrokerState,
    activeTradingSession,
    brokerLedgerSyncState,
    fetchPaperPortfolio,
    fetchPaperTrades,
    fetchPortfolioConstruction,
    fetchRiskDashboard,
    handleRebuildPortfolio,
    isAutoSyncingBrokerLedger,
    isLoadingPaperPortfolio,
    isRebuildingPortfolio,
    paperError,
    paperPortfolio,
    paperTradesData,
    portfolioConstructionData,
    portfolioConstructionError,
    portfolioReconciliation,
    portfolioReconciliationError,
    requestBrokerLedgerSync,
    riskDashboardData,
    riskDashboardError,
    setPortfolioConstructionError,
    setRiskDashboardError,
  } = portfolioData;

  const settings = useSettings({
    activeTab,
    adminTabs: ADMIN_TABS,
    currentUser,
    displayedRef: scannerDisplayedRef,
    getUserStorageKey,
    horizonSettings: HORIZON_SETTINGS,
    onAdminModeRequired: showAdminModeRequired,
    onForceDashboard: forceDashboard,
    refreshUser,
    savedSettings,
    setPortfolioConstructionError,
    setRiskDashboardError,
  });

  const {
    adminMode,
    alertThreshold,
    allowOvernightPositions,
    allowTradingNearEarnings,
    autoExecuteConfidenceThreshold,
    buildExecutionSettingsPayload,
    buildMarketUniverseSettingsPayload,
    currencyDisplay,
    dailyLossLimit,
    drawdownThreshold,
    engineInterval,
    engineStatus,
    exchangeFilter,
    excludePennyStocks,
    executionMode,
    fetchEngineStatus,
    fetchSafetyStatus,
    fetchStockUniverses,
    handleAddStockUniverseMembers,
    handleCreateStockUniverse,
    handleCreateUniverseFromSector,
    handleCreateUniverseFromSource,
    handleDeleteStockUniverse,
    handleRemoveStockUniverseMember,
    handleSaveSafetySettings,
    handleStartEngine,
    handleStopEngine,
    handleTradingHorizonChange,
    handleUpdateStockUniverse,
    highRiskMode,
    includeNonSp500,
    includeSgx,
    isAutoRefreshEnabled,
    isEngineChanging,
    marketHoursOnly,
    maxMarketCap,
    maxTradeSizeForAutoExecution,
    minAverageVolume,
    minMarketCap,
    pauseAutomationDuringMajorMacroEvents,
    primaryMarket,
    riskMultiplier,
    safetyError,
    safetyStatus,
    scanLimit,
    scanWatchlistOnly,
    scoreThreshold,
    selectedStockUniverse,
    selectedStockUniverseId,
    setAdminMode,
    setAlertThreshold,
    setAllowOvernightPositions,
    setAllowTradingNearEarnings,
    setAutoExecuteConfidenceThreshold,
    setCurrencyDisplay,
    setDailyLossLimit,
    setDrawdownThreshold,
    setEngineInterval,
    setExchangeFilter,
    setExcludePennyStocks,
    setExecutionMode,
    setHighRiskMode,
    setIncludeNonSp500,
    setIncludeSgx,
    setIsAutoRefreshEnabled,
    setMarketHoursOnly,
    setMaxMarketCap,
    setMaxTradeSizeForAutoExecution,
    setMinAverageVolume,
    setMinMarketCap,
    setPauseAutomationDuringMajorMacroEvents,
    setPrimaryMarket,
    setRiskMultiplier,
    setScanLimit,
    setScanWatchlistOnly,
    setScoreThreshold,
    setSelectedStockUniverseId,
    setSignalThreshold,
    setStockUniverseForm,
    setStockUniverseMemberInput,
    setUniverseMode,
    setWeeklyLossLimit,
    signalThreshold,
    stockUniverseForm,
    stockUniverseMemberInput,
    stockUniverses,
    stockUniversesData,
    stockUniversesError,
    tradingHorizon,
    universeMode,
    weeklyLossLimit,
  } = settings;

  const activeStrategyState = useActiveStrategy({
    activeStrategyStorageKey: ACTIVE_STRATEGY_STORAGE_KEY,
    getUserStorageKey,
  });
  const {
    activeStrategyConfig,
    fetchActiveStrategy,
    setActiveStrategyConfig,
  } = activeStrategyState;

  const trades = useTrades({ data });
  const {
    calculateUnrealizedPnL,
    closedTrades,
    fetchTrades,
    handleTradeFieldChange,
    handleTradeSubmit,
    manualOpenTradePositions,
    manualOpenTradeValue,
    openTrades,
    tradeError,
    tradeForm,
  } = trades;

  const proposedOrders = useProposedOrders();
  const {
    data: proposedOrdersData,
    refresh: fetchProposedOrders,
  } = proposedOrders;

  const preTrade = usePreTradeAnalysis({
    data,
    tradingHorizon,
  });

  const alerts = useAlerts();
  const {
    alertActionId,
    alertDigest,
    alertHealth,
    alertNeedsAction,
    alertRecent,
    alertResolved,
    alertRuleForm,
    alertRules,
    alertSummary,
    alertsData,
    fetchAlertRules,
    fetchAlerts,
    fetchNotificationChannels,
    handleAlertAction,
    handleCreateAlertRule,
    handleSaveTelegramChannel,
    handleSendTelegramTest,
    handleVerifyTelegramChannel,
    setAlertRuleForm,
    setTelegramForm,
    telegramChannel,
    telegramForm,
    telegramStatus,
    usefulAlerts,
  } = alerts;

  const {
    fetchWatchlist,
    toggleWatchlist,
    watchlist,
    watchlistError,
    watchlistSource,
  } = useWatchlist({ userId: currentUser?.id });

  const brokerReadinessEnabled = Boolean(currentUser && adminMode);
  const {
    brokerAccount,
    brokerCapabilities,
    brokerFills,
    brokerHealth,
    brokerLogs,
    brokerOrders,
    brokerPreflight,
    brokerReconciliation,
    fetchIbkrStatus,
    handleIbkrConfigChange,
    handleSaveIbkrConfig,
    handleTestIbkrConnection,
    ibkrConfig,
    ibkrError,
    ibkrStatus,
    isSavingIbkrConfig,
    isTestingIbkrConnection,
    refreshBrokerReadiness,
  } = useBroker({ enabled: brokerReadinessEnabled });

  const {
    fetchValidationData,
    handleEvaluateValidationSignals,
    isEvaluatingValidation,
    validationConfidenceData,
    validationError,
    validationOpenAiData,
    validationRegimeData,
    validationSectorData,
  } = useValidation();

  const handleTabChange = useCallback(
    (tab) => {
      if (!canAccessTab(currentUser, tab)) {
        setActiveTab(tab);
        window.history.replaceState({}, "", TAB_TO_ROUTE[tab] || "/dashboard");
        return;
      }

      if (ADMIN_TABS.has(tab) && !adminMode) {
        setActiveTab("Dashboard");
        window.history.replaceState({}, "", "/dashboard");
        showAdminModeRequired();
        return;
      }

      setActiveTab(tab);
      window.history.pushState({}, "", TAB_TO_ROUTE[tab] || "/dashboard");
    },
    [adminMode, currentUser, setActiveTab, showAdminModeRequired]
  );

  const fetchScanHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/scans`);

      if (!response.ok) {
        throw new Error("Unable to load scan history");
      }

      setScanHistoryData(await response.json());
    } catch (err) {
      setScanHistoryData({ scans: [], error: err.message });
    }
  }, []);

  const fetchSignalChanges = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/signal-changes`);

      if (!response.ok) {
        throw new Error("Unable to load signal changes");
      }

      setSignalChangesData(await response.json());
    } catch (err) {
      setSignalChangesData({ changes: [], error: err.message });
    }
  }, []);

  const fetchPlaybook = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/playbook`);

      if (!response.ok) {
        throw new Error("Unable to load playbook intelligence");
      }

      const nextPlaybook = await response.json();
      setPlaybookData(nextPlaybook);
      setPlaybookError("");
    } catch (err) {
      setPlaybookError(err.message);
    }
  }, []);

  const approvals = useApprovals({
    onActionCompleted: fetchProposedOrders,
    onBrokerPaperExecuted: async () => {
      await Promise.all([
        fetchApprovalRequests(),
        fetchPaperPortfolio({ forceRefreshBroker: true }),
        fetchPaperTrades(),
        fetchRiskDashboard(),
        fetchPortfolioConstruction(),
        fetchPlaybook(),
      ]);
    },
    onExecuted: async () => {
      await Promise.all([
        fetchPaperPortfolio(),
        fetchPaperTrades(),
        fetchRiskDashboard(),
        fetchPortfolioConstruction(),
        fetchPlaybook(),
      ]);
    },
    onTradeEdited: async () => {
      await Promise.all([
        fetchProposedOrders(),
        fetchRiskDashboard(),
        fetchPortfolioConstruction(),
        fetchPlaybook(),
      ]);
    },
    paperBrokerEnabled:
      Boolean(brokerCapabilities.capabilities?.canPlaceOrders) &&
      !brokerPreflight.preflight?.executionLocked,
    statuses: APPROVAL_STATUSES,
  });
  const {
    approvalActionId,
    dashboardPendingApprovals,
    handleApprovalAction,
    pendingApprovalRequests,
    refresh: fetchApprovalRequests,
  } = approvals;

  const handleLogout = async () => {
    await logout();
    setShowAuthScreen(false);
    setActiveTab("Dashboard");
    window.history.replaceState({}, "", "/");
  };

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    fetchScanResults();

    fetchAlerts();
    fetchNotificationChannels();
    fetchAlertRules();
    fetchProposedOrders();
    fetchApprovalRequests();

    fetch(`${API_BASE_URL}/api/scans`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load scan history");
        }

        return response.json();
      })
      .then((nextScanHistory) => setScanHistoryData(nextScanHistory))
      .catch((err) => setScanHistoryData({ scans: [], error: err.message }));

    fetch(`${API_BASE_URL}/api/signal-changes`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Unable to load signal changes");
        }

        return response.json();
      })
      .then((nextSignalChanges) => setSignalChangesData(nextSignalChanges))
      .catch((err) => setSignalChangesData({ changes: [], error: err.message }));

    const startupRefresh = window.setTimeout(() => {
      const startupTasks = [
        fetchEngineStatus,
        fetchDataHealth,
        fetchSafetyStatus,
        fetchActiveStrategy,
        () => fetchWatchlist({ migrateLocal: true }),
        fetchPaperPortfolio,
        fetchRiskDashboard,
      ];

      if (activeTab === "Portfolio" || activeTab === "Trades") {
        startupTasks.push(fetchPaperTrades, fetchPortfolioConstruction);
      }

      runSequentially(startupTasks).then(() => {
        if (activeTab === "Trades") fetchTrades();
        if (activeTab === "Settings") fetchStockUniverses();
        if (adminMode) fetchSystemDataHealth();
        if (adminMode && activeTab === "Playbook") fetchPlaybook();
        if (adminMode && activeTab === "Validation") fetchValidationData();
        if (brokerReadinessEnabled) fetchIbkrStatus();
      });
    }, 0);

    return () => window.clearTimeout(startupRefresh);
  }, [
    currentUser,
    fetchActiveStrategy,
    fetchAlertRules,
    fetchAlerts,
    fetchApprovalRequests,
    fetchDataHealth,
    fetchEngineStatus,
    fetchNotificationChannels,
    fetchPaperPortfolio,
    fetchPaperTrades,
    fetchScanResults,
    fetchSafetyStatus,
    fetchSystemDataHealth,
    adminMode,
    activeTab,
    brokerReadinessEnabled,
    fetchIbkrStatus,
    fetchPlaybook,
    fetchPortfolioConstruction,
    fetchProposedOrders,
    fetchRiskDashboard,
    fetchStockUniverses,
    fetchTrades,
    fetchValidationData,
    fetchWatchlist,
  ]);

  useEffect(() => {
    if (!brokerReadinessEnabled) {
      return;
    }

    fetchIbkrStatus();
  }, [brokerReadinessEnabled, fetchIbkrStatus]);

  const refreshRuntimeData = useCallback(async () => {
    await runSequentially([
      () => fetchScanResults({ background: true }),
      fetchAlerts,
      fetchProposedOrders,
      fetchApprovalRequests,
      fetchEngineStatus,
      fetchDataHealth,
      fetchSafetyStatus,
      fetchWatchlist,
    ]);

    if (activeTab === "Dashboard" || activeTab === "Scanner") {
      await runSequentially([fetchScanHistory, fetchSignalChanges]);
    }

    if (activeTab === "Dashboard" || activeTab === "Portfolio" || activeTab === "Trades") {
      const portfolioTasks = [fetchPaperPortfolio, fetchRiskDashboard];
      if (activeTab === "Portfolio" || activeTab === "Trades") {
        portfolioTasks.push(fetchPaperTrades, fetchPortfolioConstruction);
      }
      await runSequentially(portfolioTasks);
    }

    if (activeTab === "Trades") {
      await fetchTrades();
    }

    if (activeTab === "Settings") {
      await fetchStockUniverses();
    }

    if (adminMode) {
      await fetchSystemDataHealth();
      if (activeTab === "Playbook") await fetchPlaybook();
      if (activeTab === "Validation") await fetchValidationData();
      if (brokerReadinessEnabled) await fetchIbkrStatus();
    }
  }, [
    activeTab,
    adminMode,
    brokerReadinessEnabled,
    fetchAlerts,
    fetchApprovalRequests,
    fetchDataHealth,
    fetchEngineStatus,
    fetchIbkrStatus,
    fetchPlaybook,
    fetchPortfolioConstruction,
    fetchRiskDashboard,
    fetchScanHistory,
    fetchSignalChanges,
    fetchStockUniverses,
    fetchSystemDataHealth,
    fetchValidationData,
    fetchPaperPortfolio,
    fetchPaperTrades,
    fetchProposedOrders,
    fetchScanResults,
    fetchSafetyStatus,
    fetchTrades,
    fetchWatchlist,
  ]);

  const refreshEngineRuntime = useCallback(() => {
    fetchEngineStatus();
    fetchDataHealth();
  }, [fetchDataHealth, fetchEngineStatus]);

  const refreshPortfolioRuntime = useCallback(async () => {
    if (activeTab === "Dashboard" || activeTab === "Portfolio") {
      const portfolioTasks = [fetchPaperPortfolio, fetchRiskDashboard];
      if (activeTab === "Portfolio") {
        portfolioTasks.push(fetchPortfolioConstruction);
      }
      await runSequentially(portfolioTasks);
    }

    if (adminMode && activeTab === "Playbook") {
      await fetchPlaybook();
    }
  }, [activeTab, adminMode, fetchPaperPortfolio, fetchPlaybook, fetchPortfolioConstruction, fetchRiskDashboard]);

  const handleScanCompleted = useCallback(
    (nextData, { mergeResult = false } = {}) => {
      if (nextData.active_strategy_config) {
        setActiveStrategyConfig(nextData.active_strategy_config);
      }
      if (mergeResult) {
        mergeScanData(nextData);
      } else {
        applyScanData(nextData);
      }
    },
    [applyScanData, mergeScanData, setActiveStrategyConfig]
  );

  const refreshAfterScanData = useCallback(
    async () => {
      const tasks = [
        fetchAlerts,
        fetchProposedOrders,
        fetchApprovalRequests,
        fetchScanHistory,
        fetchSignalChanges,
        fetchPaperPortfolio,
        fetchSafetyStatus,
        fetchRiskDashboard,
        fetchDataHealth,
      ];

      if (activeTab === "Portfolio" || activeTab === "Trades") {
        tasks.push(fetchPaperTrades, fetchPortfolioConstruction);
      }

      await runSequentially(tasks);

      if (adminMode) {
        await fetchPlaybook();
      }
    },
    [
      activeTab,
      adminMode,
      fetchAlerts,
      fetchApprovalRequests,
      fetchDataHealth,
      fetchPaperPortfolio,
      fetchPaperTrades,
      fetchPlaybook,
      fetchPortfolioConstruction,
      fetchProposedOrders,
      fetchRiskDashboard,
      fetchSafetyStatus,
      fetchScanHistory,
      fetchSignalChanges,
    ]
  );

  const scanJobs = useScanJobs({
    onRefresh: refreshAfterScanData,
    onScanCompleted: handleScanCompleted,
    settings: {
      buildExecutionSettingsPayload,
      buildMarketUniverseSettingsPayload,
      riskMultiplier,
      scanLimit,
      scanWatchlistOnly,
      tradingHorizon,
      user: currentUser,
    },
    watchlist,
  });
  const {
    cancelScan,
    error: scanError,
    isScanning,
    progress: scanProgress,
    runScan: handleRunScan,
    runSymbolScan,
  } = scanJobs;

  useRuntimeRefresh({
    enabled: isAutoRefreshEnabled,
    isScanning,
    onAutoRefresh: refreshRuntimeData,
    onEngineRefresh: refreshEngineRuntime,
    onPortfolioRefresh: refreshPortfolioRuntime,
    onSafetyRefresh: fetchSafetyStatus,
    user: currentUser,
  });

  const portfolio = usePortfolio({
    activeBrokerAccount,
    activeTradingSession,
    data,
    paperPortfolio,
    paperTradesData,
    portfolioConstructionData,
    resolvedBrokerState,
    riskDashboardData,
  });

  const {
    paperPositions,
  } = portfolio;

  const scanner = useScanner({
    data,
    drawdownThreshold,
    runSymbolScan,
    scoreThreshold,
    setData: updateScanData,
    setDetailSymbol,
    setSelectedSymbol,
    signalThreshold,
  });

  const {
    dashboardCounts,
    dashboardOpportunities,
    displayed,
    heatmapMode,
    heatmapTimeframe,
    scannerExchangeFilter,
    scannerMarketFilter,
    selectedSectorFilter,
    setHeatmapMode,
    setHeatmapTimeframe,
    setScannerExchangeFilter,
    setScannerMarketFilter,
    setSelectedSectorFilter,
  } = scanner;

  const dashboard = useDashboard({
    activeBrokerAccount,
    activeTradingSession,
    activeStrategyConfig,
    alertNeedsAction,
    dashboardCounts,
    dashboardOpportunities,
    data,
    dataHealth,
    engineStatus,
    executionMode,
    handleRunScan,
    horizonSettings: HORIZON_SETTINGS,
    ibkrStatus,
    paperPortfolio,
    pendingApprovalRequests,
    proposedOrdersData,
    resolvedBrokerState,
    riskDashboardData,
    safetyStatus,
    setActiveTab,
    signalThreshold,
    tradingHorizon,
  });
  const {
    activeHorizonLabel,
    activeHorizonProfile,
    activeStrategy,
    activeStrategyDeploymentScore,
    activeStrategyLatestRun,
    automationStatus,
    availableFunds,
    brokerAccountType,
    brokerCurrency,
    brokerOpenOrderCount,
    brokerPositionCount,
    buyingPower,
    cashPct,
    criticalItems,
    drawdownData,
    engineIsRunning,
    equityCurveData,
    exposurePct,
    generatedAt,
    highestScore,
    lastScanMatchesActiveStrategy,
    lastScanStrategyName,
    marketRegime,
    marketSummaries,
    nextScanLabel,
    openRiskPct,
    portfolioCash,
    portfolioEquity,
    safetyAllowsTrade,
    safetyRiskLevel,
    signalDistributionData,
    strongestExchange,
    strongestMarket,
    topOpportunityData,
    usesBrokerHeadline,
  } = dashboard;

  const handleExportPlaybook = async (format) => {
    setPlaybookExportError("");

    try {
      const playbookId = playbookData?.playbook?.id;
      const endpoint =
        playbookId && playbookId !== "json-fallback"
          ? `${API_BASE_URL}/api/playbooks/${encodeURIComponent(playbookId)}/export`
          : `${API_BASE_URL}/api/playbook/export`;
      const response = await fetch(
        `${endpoint}?format=${encodeURIComponent(format)}`
      );

      if (!response.ok) {
        throw new Error("Unable to export playbook report");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const extension = format === "markdown" ? "md" : format;
      anchor.href = url;
      anchor.download = `playbook-report.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPlaybookExportError(err.message);
    }
  };

  const handleGeneratePlaybookAi = async () => {
    const playbookId = playbookData?.playbook?.id;

    if (!playbookId || playbookId === "json-fallback") {
      setPlaybookError("AI recommendations need a Prisma-backed playbook.");
      return;
    }

    setIsGeneratingPlaybookAi(true);
    setPlaybookError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/playbooks/${encodeURIComponent(playbookId)}/ai-recommendations`,
        {
          method: "POST",
        }
      );
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "Unable to generate AI playbook suggestions");
      }

      await fetchPlaybook();
    } catch (err) {
      setPlaybookError(err.message);
    } finally {
      setIsGeneratingPlaybookAi(false);
    }
  };

  if (!currentAuthChecked) {
    return <LoadingTerminalScreen status="Checking session" />;
  }

  if (!currentUser) {
    if (!showAuthScreen) {
      return (
        <Suspense fallback={<main className="app app-state"><h1>Trading Cockpit</h1></main>}>
          <LandingPage
            onLogin={() => {
              setAuthMode("login");
              setShowAuthScreen(true);
              window.history.replaceState({}, "", "/login");
            }}
            onRegister={() => {
              setAuthMode("register");
              setShowAuthScreen(true);
              window.history.replaceState({}, "", "/register");
            }}
            onThemeToggle={toggleTheme}
            theme={theme}
          />
        </Suspense>
      );
    }

    return (
      <LoginRegisterScreen
        error={authError}
        form={authForm}
        isLoading={isAuthenticating}
        mode={authMode}
        onBack={() => {
          setShowAuthScreen(false);
          window.history.replaceState({}, "", "/");
        }}
        onChange={handleAuthFormChange}
        onModeChange={(nextMode) => {
          setAuthMode(nextMode);
          window.history.replaceState({}, "", nextMode === "register" ? "/register" : "/login");
        }}
        onSubmit={handleAuthSubmit}
        onThemeToggle={toggleTheme}
        theme={theme}
      />
    );
  }

  if (error && !data) {
    return (
      <main className="app app-state">
        <div className="state-panel">
          <p className="eyebrow">Backend status</p>
          <h1>Scan results unavailable</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="app app-state">
        <div className="state-panel">
          <p className="eyebrow">Loading</p>
          <h1>Trading Opportunity Dashboard</h1>
          <p>Fetching the latest scan output.</p>
        </div>
      </main>
    );
  }

  const availableSectors = [
    ...new Set(data.opportunities.map((item) => item.sector).filter(Boolean)),
  ].sort();
  const availableIndustries = [
    ...new Set(data.opportunities.map((item) => item.industry).filter(Boolean)),
  ].sort();
  const watchlistSymbols = [...watchlist].sort((a, b) => a.localeCompare(b));
  const scannerDataBySymbol = data.opportunities.reduce((acc, item) => {
    acc[item.symbol] = item;
    return acc;
  }, {});
  const watchlistItems = watchlistSymbols.map((symbol) => ({
    symbol,
    item: scannerDataBySymbol[symbol] || null,
  }));
  const selectedStock =
    data.opportunities.find((item) => item.symbol === selectedSymbol) || displayed[0];
  const detailStock = data.opportunities.find((item) => item.symbol === detailSymbol);
  const detailPaperPosition = paperPositions.find(
    (position) => position.symbol === detailSymbol
  );
  const signalChanges = signalChangesData.changes || [];
  const groupedSignalChanges = {
    NEW_BUY: signalChanges.filter((change) =>
      String(change.change_type || "").includes("NEW_BUY")
    ),
    SCORE_UP: signalChanges.filter((change) =>
      String(change.change_type || "").includes("SCORE_UP")
    ),
    SCORE_DOWN: signalChanges.filter((change) =>
      String(change.change_type || "").includes("SCORE_DOWN")
    ),
    NEW_SYMBOL: signalChanges.filter((change) =>
      String(change.change_type || "").includes("NEW_SYMBOL")
    ),
  };
  const watchlistMomentum = watchlistSymbols
    .map((symbol) => {
      const latestChange = signalChanges.find((change) => change.symbol === symbol);
      const latestData = scannerDataBySymbol[symbol];
      return {
        symbol,
        latestChange,
        score: Number(latestData?.opportunity_score || latestChange?.current_score || 0),
        confidence: Number(
          latestData?.confidence || latestChange?.current_confidence || 0
        ),
        signal: latestData?.signal || latestChange?.current_signal || "NO DATA",
      };
    })
    .filter((item) => item.latestChange || scannerDataBySymbol[item.symbol])
    .slice(0, 8);
  const watchlistSectorSet = new Set(
    watchlistSymbols
      .map((symbol) => scannerDataBySymbol[symbol]?.sector)
      .filter(Boolean)
  );
  const favoredSectorsByRegime = {
    BULL_LOW_VOL: ["Technology", "Communication Services", "Consumer Discretionary"],
    BULL_HIGH_VOL: ["Technology", "Industrials", "Financials"],
    BEAR_LOW_VOL: ["Utilities", "Consumer Staples", "Health Care"],
    BEAR_HIGH_VOL: ["Utilities", "Consumer Staples", "Health Care"],
    RISK_OFF: ["Utilities", "Consumer Staples", "Health Care"],
  };
  const regimeFavoredSectors = new Set(favoredSectorsByRegime[marketRegime] || []);
  const previousSectorCounts =
    data.previous_sector_counts ||
    data.previous_scan?.sector_counts ||
    data.previous_scan?.opportunities?.reduce((acc, item) => {
      const sector = item.sector || "UNKNOWN";
      acc[sector] = (acc[sector] || 0) + 1;
      return acc;
    }, {}) ||
    {};
  const sectorHeatmapData = Object.values(
    dashboardOpportunities.reduce((acc, item) => {
      const sector = item.sector || "Unclassified";

      if (!acc[sector]) {
        acc[sector] = {
          sector,
          totalOpportunities: 0,
          scoreTotal: 0,
          confidenceTotal: 0,
          counts: { BUY: 0, HOLD: 0, SELL: 0 },
          marketSplit: { US: 0, Singapore: 0 },
          symbols: [],
        };
      }

      const market = item.market || (item.is_sgx ? "Singapore" : "US");
      acc[sector].totalOpportunities += 1;
      acc[sector].scoreTotal += Number(item.opportunity_score) || 0;
      acc[sector].confidenceTotal += Number(item.confidence) || 0;
      acc[sector].counts[item.signal] = (acc[sector].counts[item.signal] || 0) + 1;
      acc[sector].marketSplit[market] = (acc[sector].marketSplit[market] || 0) + 1;
      acc[sector].symbols.push({
        symbol: item.display_symbol || item.symbol,
        score: Number(item.opportunity_score) || 0,
      });

      return acc;
    }, {})
  )
    .map((sector) => ({
      ...sector,
      averageScore: Number(
        (sector.scoreTotal / sector.totalOpportunities).toFixed(2)
      ),
      averageConfidence: Number(
        (sector.confidenceTotal / sector.totalOpportunities).toFixed(2)
      ),
      topSymbols: sector.symbols
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((item) => item.symbol),
    }))
    .map((sector) => {
      const previousCount = Number(previousSectorCounts[sector.sector] || 0);
      const momentumDelta = sector.totalOpportunities - previousCount;
      const signalTotal = sector.counts.BUY + sector.counts.HOLD + sector.counts.SELL;
      const signalBias = signalTotal
        ? (sector.counts.BUY - sector.counts.SELL) / signalTotal
        : 0;
      const confidenceBias = ((sector.averageConfidence || 0) - 50) / 50;

      return {
        ...sector,
        canFilter: sector.sector !== "Unclassified",
        heatBias: heatmapMode === "confidence" ? confidenceBias : signalBias,
        isWatchlistSector: watchlistSectorSet.has(sector.sector),
        isRegimeFavored: regimeFavoredSectors.has(sector.sector),
        momentumDelta,
        momentumArrow: momentumDelta > 0 ? "↑" : momentumDelta < 0 ? "↓" : "→",
        momentumClass:
          momentumDelta > 0
            ? "positive"
            : momentumDelta < 0
              ? "negative"
              : "neutral-text",
      };
    })
    .sort((a, b) => b.averageScore - a.averageScore);
  const formatPercent = (value) => `${Number(value).toFixed(2)}%`;
  const formatMoney = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? `$${number.toFixed(2)}` : "-";
  };
  const formatRatioPercent = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : "-";
  };
  const renderTradeRows = (tradeList, showUnrealized = false) => {
    if (tradeList.length === 0) {
      return <p className="alerts-empty">No trades logged.</p>;
    }

    return (
      <div className="trade-table">
        {tradeList.map((trade) => {
          const unrealizedPnL = calculateUnrealizedPnL(trade);

          return (
            <article className="trade-row" key={trade.id}>
              <div>
                <strong>{trade.symbol}</strong>
                <span className={trade.side === "BUY" ? "positive" : "negative"}>
                  {trade.side}
                </span>
              </div>
              <div>
                <span>Entry</span>
                <strong>{Number(trade.entryPrice).toFixed(2)}</strong>
              </div>
              <div>
                <span>Qty</span>
                <strong>{trade.quantity}</strong>
              </div>
              <div>
                <span>Stop</span>
                <strong>{trade.stopLoss ?? "-"}</strong>
              </div>
              <div>
                <span>Target</span>
                <strong>{trade.takeProfit ?? "-"}</strong>
              </div>
              {showUnrealized && (
                <div>
                  <span>Unrealized P/L</span>
                  <strong
                    className={
                      unrealizedPnL === null || unrealizedPnL >= 0 ? "positive" : "negative"
                    }
                  >
                    {unrealizedPnL === null ? "No close" : unrealizedPnL.toFixed(2)}
                  </strong>
                </div>
              )}
              {trade.notes && <p>{trade.notes}</p>}
            </article>
          );
        })}
      </div>
    );
  };
  const visibleTabSections = getVisibleTabSections(currentUser, adminMode);
  const activeTabPageKey = TAB_TO_PAGE_KEY[activeTab];
  const activeTabAccessible = activeTabPageKey
    ? canAccessTab(currentUser, activeTab)
    : true;

  return (
    <AppShell
      activeTab={activeTab}
      adminMode={adminMode}
      onLogout={handleLogout}
      onTabChange={handleTabChange}
      onThemeToggle={toggleTheme}
      tabSections={visibleTabSections}
      tabs={TABS}
      theme={theme}
      user={currentUser}
    >
      {adminToast && <div className="admin-toast">{adminToast}</div>}
      {(systemDataHealth?.degradedMode ||
        data.degradedMode ||
        Object.keys(degradedDataSources).length > 0) && (
        <div className="degraded-mode-banner" role="alert">
          <strong>Degraded data mode.</strong>{" "}
          {systemDataHealth?.warning ||
            data.warning ||
            "Database unavailable; displayed data may be stale."}
        </div>
      )}

      {!activeTabAccessible ? (
        <AccessDeniedPage
          onGoSettings={() => handleTabChange("Settings")}
          pageName={activeTab}
        />
      ) : (
        <>

      {(() => {
        const pageTitle = TAB_HEADER_TITLES[activeTab] || activeTab;
        const scanAgeLabel = dataHealth?.scan_age_minutes != null
          ? formatScanAge(dataHealth.scan_age_minutes)
          : null;
        const universeLabel = `${String(universeMode || "S_AND_P_500").replaceAll("_", " ")} · ${
          primaryMarket === "SG"
            ? "Singapore"
            : primaryMarket === "BOTH"
              ? "US + Singapore"
              : "US"
        }`;

        return (
      <header className="dashboard-header">
        <div className="dashboard-header-copy">
          <p className="eyebrow">Trading cockpit</p>
          <h1>{pageTitle}</h1>
          <p className="subtitle">
            {isScanning
              ? "Running a fresh scan. This can take a few minutes."
              : `Last scan ${generatedAt}`}
            {scanAgeLabel ? (
              <>
                {" · "}
                <span className={dataHealth?.is_stale ? "subtitle-accent-warn" : "subtitle-accent"}>
                  {scanAgeLabel}
                </span>
              </>
            ) : null}
          </p>
          {isRefreshing && <p className="subtitle">Refreshing scan results...</p>}
          {error && <p className="subtitle">Backend unavailable: {error}</p>}
          {scanError && <p className="subtitle">Scan failed: {scanError}</p>}
        </div>

        <div className="toolbar-controls">
          <div className="scan-controls header-setting-summary">
            <span>Active Horizon</span>
            <strong>
              {HORIZON_SETTINGS[tradingHorizon]?.label || tradingHorizon}
            </strong>
          </div>

          <div className="scan-controls header-setting-summary">
            <span>Active Universe / Market</span>
            <strong>{universeLabel}</strong>
          </div>

          <button
            className="direction-toggle"
            disabled={isScanning}
            onClick={handleRunScan}
            type="button"
          >
            {isScanning ? "Scanning..." : "Run New Scan"}
          </button>
        </div>
      </header>
        );
      })()}

      <ScanProgressPanel
        onCancel={cancelScan}
        progress={scanProgress}
      />

      {(dataHealth?.is_stale || dataHealthError) && (
        <section className={`freshness-warning ${getFreshnessClass(dataHealth)}`}>
          <strong>
            {dataHealthError
              ? "Data health is unavailable."
              : `Scan data is ${
                  dataHealth.stale_level === "critical" ? "critically stale" : "stale"
                }.`}
          </strong>
          <span>
            {dataHealthError
              ? `${dataHealthError}. Check the backend server.`
              : `Last successful scan was ${
                  dataHealth.last_successful_scan
                    ? new Date(dataHealth.last_successful_scan).toLocaleString()
                    : "not available"
                }. Run a new scan or check the live engine.`}
          </span>
        </section>
      )}

      {activeTab === "Dashboard" && (
        <DashboardFeaturePage
          marketRegime={marketRegime}
          activeStrategy={activeStrategy}
          engineIsRunning={engineIsRunning}
          nextScanLabel={nextScanLabel}
          EXECUTION_MODES={EXECUTION_MODES}
          automationStatus={automationStatus}
          safetyAllowsTrade={safetyAllowsTrade}
          safetyRiskLevel={safetyRiskLevel}
          isScanning={isScanning}
          handleRunScan={handleRunScan}
          criticalItems={criticalItems}
          scannerExchangeFilter={scannerExchangeFilter}
          scannerMarketFilter={scannerMarketFilter}
          setScannerMarketFilter={setScannerMarketFilter}
          setScannerExchangeFilter={setScannerExchangeFilter}
          dashboardOpportunities={dashboardOpportunities}
          dashboardCounts={dashboardCounts}
          highestScore={highestScore}
          marketSummaries={marketSummaries}
          strongestMarket={strongestMarket}
          strongestExchange={strongestExchange}
          formatMoney={formatMoney}
          availableFunds={availableFunds}
          brokerAccountType={brokerAccountType}
          brokerCurrency={brokerCurrency}
          brokerOpenOrderCount={brokerOpenOrderCount}
          brokerPositionCount={brokerPositionCount}
          buyingPower={buyingPower}
          portfolioCash={portfolioCash}
          portfolioEquity={portfolioEquity}
          cashPct={cashPct}
          exposurePct={exposurePct}
          openRiskPct={openRiskPct}
          usesBrokerHeadline={usesBrokerHeadline}
          pendingApprovalRequests={pendingApprovalRequests}
          setActiveTab={handleTabChange}
          dashboardPendingApprovals={dashboardPendingApprovals}
          formatJsonSummary={formatJsonSummary}
          approvalActionId={approvalActionId}
          handleApprovalAction={handleApprovalAction}
          lastScanMatchesActiveStrategy={lastScanMatchesActiveStrategy}
          activeStrategyConfig={activeStrategyConfig}
          lastScanStrategyName={lastScanStrategyName}
          activeHorizonLabel={activeHorizonLabel}
          activeStrategyLatestRun={activeStrategyLatestRun}
          formatPercent={formatPercent}
          activeStrategyDeploymentScore={activeStrategyDeploymentScore}
          OpportunityHeatmap={OpportunityHeatmap}
          heatmapMode={heatmapMode}
          setHeatmapMode={setHeatmapMode}
          setSelectedSectorFilter={setSelectedSectorFilter}
          setHeatmapTimeframe={setHeatmapTimeframe}
          sectorHeatmapData={sectorHeatmapData}
          selectedSectorFilter={selectedSectorFilter}
          heatmapTimeframe={heatmapTimeframe}
          signalChanges={signalChanges}
          signalChangesData={signalChangesData}
          groupedSignalChanges={groupedSignalChanges}
          setSelectedSymbol={setSelectedSymbol}
          setDetailSymbol={setDetailSymbol}
          watchlistMomentum={watchlistMomentum}
          watchlistSymbols={watchlistSymbols}
          setSelectedHistorySymbol={setSelectedHistorySymbol}
          ChartPanel={ChartPanel}
          equityCurveData={equityCurveData}
          drawdownData={drawdownData}
          signalDistributionData={signalDistributionData}
          SIGNAL_COLORS={SIGNAL_COLORS}
          topOpportunityData={topOpportunityData}
          selectedHistorySymbol={selectedHistorySymbol}
          data={data}
          isLoadingEquityHistory={isLoadingPaperPortfolio}
        />
      )}

      {activeTab === "Scanner" && (
        <ScannerFeaturePage
          scanner={scanner}
          CURRENCY_FILTERS={CURRENCY_FILTERS}
          EXCHANGE_FILTERS={EXCHANGE_FILTERS}
          FILTERS={FILTERS}
          MARKET_FILTERS={MARKET_FILTERS}
          QUICK_FILTERS={QUICK_FILTERS}
          SORT_OPTIONS={SORT_OPTIONS}
          activeHorizonProfile={activeHorizonProfile}
          activeStrategy={activeStrategy}
          data={data}
          drawdownThreshold={drawdownThreshold}
          formatPercent={formatPercent}
          isScanning={isScanning}
          scanWatchlistOnly={scanWatchlistOnly}
          scoreThreshold={scoreThreshold}
          selectedStock={selectedStock}
          setDetailSymbol={setDetailSymbol}
          setDrawdownThreshold={setDrawdownThreshold}
          setScanWatchlistOnly={setScanWatchlistOnly}
          setScoreThreshold={setScoreThreshold}
          setSelectedSymbol={setSelectedSymbol}
          toggleWatchlist={toggleWatchlist}
          watchlist={watchlist}
        />
      )}

      {activeTab === "Watchlist" && (
        <WatchlistFeaturePage
          formatPercent={formatPercent}
          scanWatchlistOnly={scanWatchlistOnly}
          setDetailSymbol={setDetailSymbol}
          setScanWatchlistOnly={setScanWatchlistOnly}
          setSelectedSymbol={setSelectedSymbol}
          toggleWatchlist={toggleWatchlist}
          watchlistError={watchlistError}
          watchlistItems={watchlistItems}
          watchlistSource={watchlistSource}
          watchlistSymbols={watchlistSymbols}
        />
      )}

      {activeTab === "Strategy Lab" && (
        <Suspense fallback={<p className="alerts-empty">Loading Strategy Lab...</p>}>
          <StrategyLabFeaturePage
            activeStrategyStorageKey={ACTIVE_STRATEGY_STORAGE_KEY}
            getUserStorageKey={getUserStorageKey}
            onActiveStrategyChange={setActiveStrategyConfig}
            stockUniversesData={stockUniversesData}
          />
        </Suspense>
      )}

      {activeTab === "Trades" && (
        <TradesFeaturePage
          closedTrades={closedTrades}
          handleTradeFieldChange={handleTradeFieldChange}
          handleTradeSubmit={handleTradeSubmit}
          openTrades={openTrades}
          renderTradeRows={renderTradeRows}
          tradeError={tradeError}
          tradeForm={tradeForm}
        />
      )}

      {activeTab === "Playbook" && (
        <PlaybookPage
          data={playbookData}
          error={playbookError}
          exportError={playbookExportError}
          isGeneratingAi={isGeneratingPlaybookAi}
          onExport={handleExportPlaybook}
          onGenerateAi={handleGeneratePlaybookAi}
          onRefresh={fetchPlaybook}
        />
      )}

      {activeTab === "Validation" && (
        <ValidationPage
          confidenceData={validationConfidenceData}
          error={validationError}
          isEvaluating={isEvaluatingValidation}
          openAiData={validationOpenAiData}
          onEvaluate={handleEvaluateValidationSignals}
          onRefresh={fetchValidationData}
          regimeData={validationRegimeData}
          sectorData={validationSectorData}
        />
      )}

      {activeTab === "IBKR" && (
        <BrokerPage
          account={brokerAccount.account}
          capabilities={brokerCapabilities.capabilities}
          config={ibkrConfig}
          error={ibkrError}
          fills={brokerFills.fills}
          health={brokerHealth.health}
          isSaving={isSavingIbkrConfig}
          isTesting={isTestingIbkrConnection}
          logs={brokerLogs.logs}
          onChange={handleIbkrConfigChange}
          onRefresh={refreshBrokerReadiness}
          onSave={handleSaveIbkrConfig}
          onTest={handleTestIbkrConnection}
          orders={brokerOrders.orders}
          preflight={brokerPreflight.preflight}
          reconciliation={brokerReconciliation.reconciliation}
          status={ibkrStatus}
        />
      )}

      {activeTab === "Alerts" && (
        <AlertsFeaturePage
          alertActionId={alertActionId}
          alertDigest={alertDigest}
          alertHealth={alertHealth}
          alertNeedsAction={alertNeedsAction}
          alertRecent={alertRecent}
          alertResolved={alertResolved}
          alertRuleForm={alertRuleForm}
          alertRules={alertRules}
          alertSummary={alertSummary}
          alertsData={alertsData}
          formatPercent={formatPercent}
          handleAlertAction={handleAlertAction}
          handleCreateAlertRule={handleCreateAlertRule}
          handleSaveTelegramChannel={handleSaveTelegramChannel}
          handleSendTelegramTest={handleSendTelegramTest}
          handleVerifyTelegramChannel={handleVerifyTelegramChannel}
          setAlertRuleForm={setAlertRuleForm}
          setTelegramForm={setTelegramForm}
          telegramChannel={telegramChannel}
          telegramForm={telegramForm}
          telegramStatus={telegramStatus}
          usefulAlerts={usefulAlerts}
        />
      )}

      {activeTab === "Approvals" && (
        <ApprovalsFeaturePage
          activeHorizonLabel={activeHorizonLabel}
          approvals={approvals}
          approvalStatuses={APPROVAL_STATUSES}
          brokerPaperEnabled={
            Boolean(brokerCapabilities.capabilities?.canPlaceOrders) &&
            !brokerPreflight.preflight?.executionLocked
          }
          brokerExecutionProvider={resolvedBrokerState?.provider || null}
          brokerPaperReason={
            brokerCapabilities.capabilities?.canPlaceOrders
              ? brokerPreflight.preflight?.checks
                  ?.filter((check) =>
                    brokerPreflight.preflight?.executionLocked
                      ? check.status !== "PASS"
                      : check.status === "WARNING"
                  )
                  .map((check) => check.detail)
                  .find(Boolean) ||
                (brokerPreflight.preflight?.executionLocked
                  ? "Broker paper routing is blocked by preflight."
                  : "")
              : "Broker paper routing is not enabled. Open Broker Center, select Moomoo, save the config, and keep Trade Environment on SIMULATE."
          }
          formatMoney={formatMoney}
          formatRatioPercent={formatRatioPercent}
          preTrade={preTrade}
        />
      )}

      {activeTab === "Portfolio" && (
        <PortfolioFeaturePage
          portfolio={portfolio}
          formatMoney={formatMoney}
          formatSafetyPercent={formatSafetyPercent}
          handleRebuildPortfolio={handleRebuildPortfolio}
          isRebuildingPortfolio={isRebuildingPortfolio}
          manualOpenTradePositions={manualOpenTradePositions}
          manualOpenTradeValue={manualOpenTradeValue}
          paperError={paperError}
          paperPortfolio={paperPortfolio}
          portfolioConstructionData={portfolioConstructionData}
          portfolioConstructionError={portfolioConstructionError}
          portfolioReconciliation={portfolioReconciliation}
          portfolioReconciliationError={portfolioReconciliationError}
          reconciliationSyncState={brokerLedgerSyncState}
          requestBrokerLedgerSync={requestBrokerLedgerSync}
          riskDashboardData={riskDashboardData}
          riskDashboardError={riskDashboardError}
          setDetailSymbol={setDetailSymbol}
          setSelectedSymbol={setSelectedSymbol}
          syncInProgress={isAutoSyncingBrokerLedger}
        />
      )}

      {activeTab === "Settings" && (
        <SettingsFeaturePage
          adminMode={adminMode}
          setAdminMode={setAdminMode}
          setScanLimit={setScanLimit}
          scanLimit={scanLimit}
          setRiskMultiplier={setRiskMultiplier}
          riskMultiplier={riskMultiplier}
          handleTradingHorizonChange={handleTradingHorizonChange}
          tradingHorizon={tradingHorizon}
          TRADING_HORIZONS={TRADING_HORIZONS}
          HORIZON_SETTINGS={HORIZON_SETTINGS}
          engineIsRunning={engineIsRunning}
          setEngineInterval={setEngineInterval}
          engineInterval={engineInterval}
          ENGINE_INTERVALS={ENGINE_INTERVALS}
          setSignalThreshold={setSignalThreshold}
          signalThreshold={signalThreshold}
          activeHorizonLabel={activeHorizonLabel}
          activeHorizonProfile={activeHorizonProfile}
          setExecutionMode={setExecutionMode}
          executionMode={executionMode}
          EXECUTION_MODES={EXECUTION_MODES}
          setAutoExecuteConfidenceThreshold={setAutoExecuteConfidenceThreshold}
          autoExecuteConfidenceThreshold={autoExecuteConfidenceThreshold}
          setMaxTradeSizeForAutoExecution={setMaxTradeSizeForAutoExecution}
          maxTradeSizeForAutoExecution={maxTradeSizeForAutoExecution}
          allowTradingNearEarnings={allowTradingNearEarnings}
          setAllowTradingNearEarnings={setAllowTradingNearEarnings}
          allowOvernightPositions={allowOvernightPositions}
          setAllowOvernightPositions={setAllowOvernightPositions}
          pauseAutomationDuringMajorMacroEvents={pauseAutomationDuringMajorMacroEvents}
          setPauseAutomationDuringMajorMacroEvents={setPauseAutomationDuringMajorMacroEvents}
          setScoreThreshold={setScoreThreshold}
          scoreThreshold={scoreThreshold}
          setAlertThreshold={setAlertThreshold}
          alertThreshold={alertThreshold}
          setDrawdownThreshold={setDrawdownThreshold}
          drawdownThreshold={drawdownThreshold}
          setDailyLossLimit={setDailyLossLimit}
          dailyLossLimit={dailyLossLimit}
          setWeeklyLossLimit={setWeeklyLossLimit}
          weeklyLossLimit={weeklyLossLimit}
          marketHoursOnly={marketHoursOnly}
          setMarketHoursOnly={setMarketHoursOnly}
          isAutoRefreshEnabled={isAutoRefreshEnabled}
          setIsAutoRefreshEnabled={setIsAutoRefreshEnabled}
          scanWatchlistOnly={scanWatchlistOnly}
          setScanWatchlistOnly={setScanWatchlistOnly}
          universeMode={universeMode}
          highRiskMode={highRiskMode}
          primaryMarket={primaryMarket}
          includeSgx={includeSgx}
          setPrimaryMarket={setPrimaryMarket}
          setIncludeSgx={setIncludeSgx}
          setExchangeFilter={setExchangeFilter}
          setCurrencyDisplay={setCurrencyDisplay}
          exchangeFilter={exchangeFilter}
          EXCHANGE_FILTERS={EXCHANGE_FILTERS}
          currencyDisplay={currencyDisplay}
          setUniverseMode={setUniverseMode}
          setHighRiskMode={setHighRiskMode}
          setMinMarketCap={setMinMarketCap}
          minMarketCap={minMarketCap}
          setMaxMarketCap={setMaxMarketCap}
          maxMarketCap={maxMarketCap}
          setMinAverageVolume={setMinAverageVolume}
          minAverageVolume={minAverageVolume}
          excludePennyStocks={excludePennyStocks}
          setExcludePennyStocks={setExcludePennyStocks}
          includeNonSp500={includeNonSp500}
          setIncludeNonSp500={setIncludeNonSp500}
          isEngineChanging={isEngineChanging}
          handleStartEngine={handleStartEngine}
          handleStopEngine={handleStopEngine}
          handleSaveSafetySettings={handleSaveSafetySettings}
          formatSafetyPercent={formatSafetyPercent}
          safetyStatus={safetyStatus}
          safetyError={safetyError}
          stockUniverses={stockUniverses}
          stockUniversesError={stockUniversesError}
          setStockUniverseForm={setStockUniverseForm}
          stockUniverseForm={stockUniverseForm}
          handleCreateStockUniverse={handleCreateStockUniverse}
          selectedStockUniverseId={selectedStockUniverseId}
          handleUpdateStockUniverse={handleUpdateStockUniverse}
          handleCreateUniverseFromSource={handleCreateUniverseFromSource}
          handleCreateUniverseFromSector={handleCreateUniverseFromSector}
          availableSectors={availableSectors}
          availableIndustries={availableIndustries}
          selectedStockUniverse={selectedStockUniverse}
          setStockUniverseMemberInput={setStockUniverseMemberInput}
          stockUniverseMemberInput={stockUniverseMemberInput}
          handleAddStockUniverseMembers={handleAddStockUniverseMembers}
          setSelectedStockUniverseId={setSelectedStockUniverseId}
          handleDeleteStockUniverse={handleDeleteStockUniverse}
          handleRemoveStockUniverseMember={handleRemoveStockUniverseMember}
        />
      )}

      {activeTab === "Admin Dashboard" && (
        <AdminDashboardPage currentUser={currentUser} />
      )}
        </>
      )}

      <StockDetailDrawer
        formatPercent={formatPercent}
        marketRegime={marketRegime}
        onClose={() => setDetailSymbol("")}
        paperPosition={detailPaperPosition}
        stock={detailStock}
      />
    </AppShell>
  );
}

export default App;
