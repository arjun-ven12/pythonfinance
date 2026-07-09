import { useCallback, useEffect, useMemo, useState } from "react";
import useEngineStatus from "../../../hooks/useEngineStatus";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";

function dashboardPercentToDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return number > 1 ? number / 100 : number;
}

export default function useSettings({
  activeTab,
  adminTabs,
  currentUser,
  displayedRef,
  getUserStorageKey,
  horizonSettings,
  onAdminModeRequired,
  onForceDashboard,
  refreshUser,
  savedSettings,
  setRiskDashboardError,
  setPortfolioConstructionError,
}) {
  const [adminMode, setAdminModeState] = useState(() =>
    window.localStorage.getItem("adminMode") === "true"
  );
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(false);
  const [scanLimit, setScanLimit] = useState(savedSettings.scanLimit);
  const [riskMultiplier, setRiskMultiplier] = useState(savedSettings.riskMultiplier);
  const [tradingHorizon, setTradingHorizon] = useState(savedSettings.tradingHorizon || "SWING");
  const [engineInterval, setEngineInterval] = useState(savedSettings.engineInterval);
  const [marketHoursOnly, setMarketHoursOnly] = useState(savedSettings.marketHoursOnly);
  const [safetyStatus, setSafetyStatus] = useState(null);
  const [signalThreshold, setSignalThreshold] = useState(savedSettings.signalThreshold);
  const [scoreThreshold, setScoreThreshold] = useState(savedSettings.scoreThreshold);
  const [alertThreshold, setAlertThreshold] = useState(savedSettings.alertThreshold);
  const [drawdownThreshold, setDrawdownThreshold] = useState(savedSettings.drawdownThreshold);
  const [dailyLossLimit, setDailyLossLimit] = useState(savedSettings.dailyLossLimit);
  const [weeklyLossLimit, setWeeklyLossLimit] = useState(savedSettings.weeklyLossLimit);
  const [scanWatchlistOnly, setScanWatchlistOnly] = useState(Boolean(savedSettings.scanWatchlistOnly));
  const [executionMode, setExecutionMode] = useState(savedSettings.executionMode || "MANUAL_APPROVAL");
  const [autoExecuteConfidenceThreshold, setAutoExecuteConfidenceThreshold] = useState(
    savedSettings.autoExecuteConfidenceThreshold
  );
  const [allowTradingNearEarnings, setAllowTradingNearEarnings] = useState(
    Boolean(savedSettings.allowTradingNearEarnings)
  );
  const [maxTradeSizeForAutoExecution, setMaxTradeSizeForAutoExecution] = useState(
    savedSettings.maxTradeSizeForAutoExecution
  );
  const [allowOvernightPositions, setAllowOvernightPositions] = useState(
    savedSettings.allowOvernightPositions !== false
  );
  const [pauseAutomationDuringMajorMacroEvents, setPauseAutomationDuringMajorMacroEvents] =
    useState(savedSettings.pauseAutomationDuringMajorMacroEvents !== false);
  const [universeMode, setUniverseMode] = useState(savedSettings.universeMode);
  const [minMarketCap, setMinMarketCap] = useState(savedSettings.minMarketCap);
  const [maxMarketCap, setMaxMarketCap] = useState(savedSettings.maxMarketCap);
  const [minAverageVolume, setMinAverageVolume] = useState(savedSettings.minAverageVolume);
  const [excludePennyStocks, setExcludePennyStocks] = useState(savedSettings.excludePennyStocks !== false);
  const [includeNonSp500, setIncludeNonSp500] = useState(Boolean(savedSettings.includeNonSp500));
  const [highRiskMode, setHighRiskMode] = useState(Boolean(savedSettings.highRiskMode));
  const [primaryMarket, setPrimaryMarket] = useState(savedSettings.primaryMarket || "US");
  const [exchangeFilter, setExchangeFilter] = useState(savedSettings.exchangeFilter || "ALL");
  const [currencyDisplay, setCurrencyDisplay] = useState(savedSettings.currencyDisplay || "AUTO");
  const [includeSgx, setIncludeSgx] = useState(Boolean(savedSettings.includeSgx));
  const [safetyError, setSafetyError] = useState("");
  const [stockUniversesData, setStockUniversesData] = useState({ universes: [] });
  const [stockUniversesError, setStockUniversesError] = useState("");
  const [stockUniverseForm, setStockUniverseForm] = useState({
    name: "",
    description: "",
    universeType: "MANUAL",
    symbols: "",
  });
  const [selectedStockUniverseId, setSelectedStockUniverseId] = useState("");
  const [stockUniverseMemberInput, setStockUniverseMemberInput] = useState("");

  useEffect(() => {
    localStorage.setItem("adminMode", adminMode ? "true" : "false");
    if (!adminMode && adminTabs.has(activeTab)) {
      onForceDashboard();
      onAdminModeRequired();
    }
  }, [activeTab, adminMode, adminTabs, onAdminModeRequired, onForceDashboard]);

  const setAdminMode = useCallback(async (nextValue) => {
    try {
      if (!nextValue) {
        setAdminModeState(false);
        return true;
      }

      if (currentUser?.role === "LEVEL_1_USER") {
        const response = await fetch(`${API_BASE_URL}/api/auth/admin-mode`, {
          method: "PATCH",
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Unable to enable Admin Mode.");
        }

        if (refreshUser) {
          await refreshUser();
        }
      }

      setAdminModeState(true);
      setSafetyError("");
      return true;
    } catch (error) {
      setSafetyError(error.message);
      setAdminModeState(false);
      return false;
    }
  }, [currentUser, refreshUser, setSafetyError]);

  useEffect(() => {
    localStorage.setItem(
      getUserStorageKey("tradingDashboardSettings"),
      JSON.stringify({
        scanLimit,
        riskMultiplier,
        tradingHorizon,
        engineInterval,
        marketHoursOnly,
        signalThreshold,
        scoreThreshold,
        alertThreshold,
        drawdownThreshold,
        dailyLossLimit,
        weeklyLossLimit,
        scanWatchlistOnly,
        executionMode,
        autoExecuteConfidenceThreshold,
        allowTradingNearEarnings,
        maxTradeSizeForAutoExecution,
        allowOvernightPositions,
        pauseAutomationDuringMajorMacroEvents,
        universeMode,
        minMarketCap,
        maxMarketCap,
        minAverageVolume,
        excludePennyStocks,
        includeNonSp500,
        highRiskMode,
        primaryMarket,
        exchangeFilter,
        currencyDisplay,
        includeSgx,
      })
    );
  }, [
    allowOvernightPositions,
    allowTradingNearEarnings,
    alertThreshold,
    autoExecuteConfidenceThreshold,
    dailyLossLimit,
    drawdownThreshold,
    engineInterval,
    executionMode,
    excludePennyStocks,
    exchangeFilter,
    getUserStorageKey,
    highRiskMode,
    includeNonSp500,
    includeSgx,
    currencyDisplay,
    marketHoursOnly,
    maxMarketCap,
    maxTradeSizeForAutoExecution,
    minAverageVolume,
    minMarketCap,
    pauseAutomationDuringMajorMacroEvents,
    primaryMarket,
    riskMultiplier,
    scanLimit,
    scanWatchlistOnly,
    scoreThreshold,
    signalThreshold,
    tradingHorizon,
    universeMode,
    weeklyLossLimit,
  ]);

  const handleTradingHorizonChange = useCallback(
    (nextHorizon) => {
      const nextSettings = horizonSettings[nextHorizon] || horizonSettings.SWING;
      setTradingHorizon(nextHorizon);
      setEngineInterval(nextSettings.interval);
      setMarketHoursOnly(nextSettings.marketHoursOnly);
      setSignalThreshold(nextSettings.signalThreshold);
    },
    [horizonSettings]
  );

  const buildExecutionSettingsPayload = useCallback(() => ({
    executionMode,
    autoExecuteConfidenceThreshold: Number(autoExecuteConfidenceThreshold),
    allowTradingNearEarnings,
    maxTradeSizeForAutoExecution: Number(maxTradeSizeForAutoExecution),
    allowOvernightPositions,
    pauseAutomationDuringMajorMacroEvents,
  }), [
    allowOvernightPositions,
    allowTradingNearEarnings,
    autoExecuteConfidenceThreshold,
    executionMode,
    maxTradeSizeForAutoExecution,
    pauseAutomationDuringMajorMacroEvents,
  ]);

  const buildMarketUniverseSettingsPayload = useCallback(() => ({
    universeMode,
    minMarketCap: Number(minMarketCap),
    maxMarketCap: maxMarketCap === "" ? null : Number(maxMarketCap),
    minAverageVolume: Number(minAverageVolume),
    excludePennyStocks,
    includeNonSp500,
    highRiskMode,
    market: primaryMarket,
    exchange: exchangeFilter,
    includeSgx,
    currency: currencyDisplay,
  }), [
    currencyDisplay,
    exchangeFilter,
    excludePennyStocks,
    highRiskMode,
    includeNonSp500,
    includeSgx,
    maxMarketCap,
    minAverageVolume,
    minMarketCap,
    primaryMarket,
    universeMode,
  ]);

  const {
    engineError,
    engineStatus,
    fetchEngineStatus,
    handleStartEngine,
    handleStopEngine,
    isEngineChanging,
  } = useEngineStatus({
    buildExecutionSettingsPayload,
    buildMarketUniverseSettingsPayload,
    engineInterval,
    marketHoursOnly,
    onIntervalFromStatus: setEngineInterval,
    riskMultiplier,
    scanLimit,
    tradingHorizon,
  });

  const fetchSafetyStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/safety-status`);
      if (!response.ok) throw new Error("Unable to load safety status");
      setSafetyStatus(await response.json());
      setSafetyError("");
    } catch (err) {
      setSafetyError(err.message);
    }
  }, []);

  const fetchStockUniverses = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/stock-universes`);
      if (!response.ok) throw new Error("Unable to load stock universes");
      const nextUniverses = await response.json();
      setStockUniversesData(nextUniverses);
      setStockUniversesError("");
      setSelectedStockUniverseId((current) => current || nextUniverses.universes?.[0]?.id || "");
    } catch (err) {
      setStockUniversesError(err.message);
    }
  }, []);

  const handleSaveSafetySettings = useCallback(async () => {
    setSafetyError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/safety-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_daily_loss_pct: dashboardPercentToDecimal(dailyLossLimit),
          max_weekly_loss_pct: dashboardPercentToDecimal(weeklyLossLimit),
        }),
      });
      const nextStatus = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextStatus?.error || "Unable to save safety settings");
      setSafetyStatus(nextStatus);
      setRiskDashboardError("");
      setPortfolioConstructionError("");
    } catch (err) {
      setSafetyError(err.message);
    }
  }, [dailyLossLimit, setPortfolioConstructionError, setRiskDashboardError, weeklyLossLimit]);

  const handleCreateStockUniverse = useCallback(async () => {
    setStockUniversesError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/stock-universes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stockUniverseForm),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to create stock universe");
      setStockUniverseForm({ name: "", description: "", universeType: "MANUAL", symbols: "" });
      setSelectedStockUniverseId(result.id);
      await fetchStockUniverses();
    } catch (err) {
      setStockUniversesError(err.message);
    }
  }, [fetchStockUniverses, stockUniverseForm]);

  const handleCreateUniverseFromSource = useCallback(async (source) => {
    const sourceName = source === "WATCHLIST" ? "Watchlist" : source === "SCANNER_RESULTS" ? "Scanner Results" : source;
    setStockUniversesError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/stock-universes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${sourceName} ${new Date().toLocaleDateString()}`,
          description: `Saved from ${sourceName.toLowerCase()}.`,
          universeType: source === "WATCHLIST" ? "WATCHLIST" : "CUSTOM_SCREEN",
          source,
          ...(source === "SCANNER_RESULTS"
            ? {
                members: (displayedRef.current || []).map((item) => ({
                  symbol: item.symbol,
                  sector: item.sector,
                  industry: item.industry,
                  source: "scanner-filtered",
                })),
              }
            : {}),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to save stock universe");
      setSelectedStockUniverseId(result.id);
      await fetchStockUniverses();
    } catch (err) {
      setStockUniversesError(err.message);
    }
  }, [displayedRef, fetchStockUniverses]);

  const handleCreateUniverseFromSector = useCallback(async (kind, value) => {
    if (!value) return;
    setStockUniversesError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/stock-universes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${value} ${kind === "sector" ? "Sector" : "Industry"}`,
          description: `Generated from latest scanner ${kind} metadata.`,
          universeType: kind === "sector" ? "SECTOR" : "INDUSTRY",
          [kind]: value,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to create stock universe");
      setSelectedStockUniverseId(result.id);
      await fetchStockUniverses();
    } catch (err) {
      setStockUniversesError(err.message);
    }
  }, [fetchStockUniverses]);

  const handleDeleteStockUniverse = useCallback(async (universeId) => {
    setStockUniversesError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/stock-universes/${universeId}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Unable to delete stock universe");
      }
      setSelectedStockUniverseId("");
      await fetchStockUniverses();
    } catch (err) {
      setStockUniversesError(err.message);
    }
  }, [fetchStockUniverses]);

  const handleUpdateStockUniverse = useCallback(async () => {
    if (!selectedStockUniverseId) return;
    setStockUniversesError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/stock-universes/${selectedStockUniverseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stockUniverseForm),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to update stock universe");
      await fetchStockUniverses();
    } catch (err) {
      setStockUniversesError(err.message);
    }
  }, [fetchStockUniverses, selectedStockUniverseId, stockUniverseForm]);

  const handleAddStockUniverseMembers = useCallback(async () => {
    if (!selectedStockUniverseId || !stockUniverseMemberInput.trim()) return;
    setStockUniversesError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/stock-universes/${selectedStockUniverseId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: stockUniverseMemberInput }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to add symbols");
      setStockUniverseMemberInput("");
      await fetchStockUniverses();
    } catch (err) {
      setStockUniversesError(err.message);
    }
  }, [fetchStockUniverses, selectedStockUniverseId, stockUniverseMemberInput]);

  const handleRemoveStockUniverseMember = useCallback(async (universeId, symbol) => {
    setStockUniversesError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/stock-universes/${universeId}/members/${encodeURIComponent(symbol)}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to remove symbol");
      await fetchStockUniverses();
    } catch (err) {
      setStockUniversesError(err.message);
    }
  }, [fetchStockUniverses]);

  const stockUniverses = useMemo(
    () => stockUniversesData.universes || [],
    [stockUniversesData.universes]
  );
  const selectedStockUniverse = useMemo(
    () => stockUniverses.find((universe) => universe.id === selectedStockUniverseId) || stockUniverses[0],
    [selectedStockUniverseId, stockUniverses]
  );

  return {
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
    engineError,
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
  };
}
