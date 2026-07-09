import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../services/apiClient";
import {
  getTradingSession,
  synchronizeBrokerState,
} from "../features/broker/hooks/brokerApi";
import useAutoBrokerLedgerSync from "../features/broker/hooks/useAutoBrokerLedgerSync";
import { resolveBrokerState } from "../features/broker/utils/resolveBrokerState";

export default function usePortfolioData({
  enabled = true,
  onPortfolioConstructionError,
  onRiskDashboardError,
} = {}) {
  const [paperPortfolio, setPaperPortfolio] = useState(null);
  const [portfolioReconciliation, setPortfolioReconciliation] = useState(null);
  const [paperTradesData, setPaperTradesData] = useState({ trades: [] });
  const [activeBrokerAccount, setActiveBrokerAccount] = useState(null);
  const [activeTradingSession, setActiveTradingSession] = useState(null);
  const [riskDashboardData, setRiskDashboardData] = useState(null);
  const [portfolioConstructionData, setPortfolioConstructionData] = useState(null);
  const [paperError, setPaperError] = useState("");
  const [riskDashboardError, setRiskDashboardError] = useState("");
  const [portfolioConstructionError, setPortfolioConstructionError] = useState("");
  const [portfolioReconciliationError, setPortfolioReconciliationError] = useState("");
  const [isRebuildingPortfolio, setIsRebuildingPortfolio] = useState(false);
  const [isLoadingPaperPortfolio, setIsLoadingPaperPortfolio] = useState(false);
  const [isLoadingRiskDashboard, setIsLoadingRiskDashboard] = useState(false);
  const [isLoadingPortfolioConstruction, setIsLoadingPortfolioConstruction] = useState(false);
  const paperPortfolioRefreshPromiseRef = useRef(null);

  const setRiskError = useCallback((message) => {
    setRiskDashboardError(message);
    onRiskDashboardError?.(message);
  }, [onRiskDashboardError]);

  const setConstructionError = useCallback((message) => {
    setPortfolioConstructionError(message);
    onPortfolioConstructionError?.(message);
  }, [onPortfolioConstructionError]);

  const fetchRiskDashboard = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    setIsLoadingRiskDashboard(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/risk-dashboard`);
      if (!response.ok) throw new Error("Unable to load risk dashboard");
      setRiskDashboardData(await response.json());
      setRiskError("");
    } catch (err) {
      setRiskError(err.message);
    } finally {
      setIsLoadingRiskDashboard(false);
    }
  }, [enabled, setRiskError]);

  const fetchPortfolioConstruction = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    setIsLoadingPortfolioConstruction(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/portfolio-construction`);
      if (!response.ok) throw new Error("Unable to load portfolio construction");
      setPortfolioConstructionData(await response.json());
      setConstructionError("");
    } catch (err) {
      setConstructionError(err.message);
    } finally {
      setIsLoadingPortfolioConstruction(false);
    }
  }, [enabled, setConstructionError]);

  const fetchPaperPortfolio = useCallback(async (options = {}) => {
    if (!enabled) {
      return null;
    }
    const syncBroker = Boolean(options.syncBroker ?? options.forceRefreshBroker);
    const forceRefreshReads = Boolean(
      options.forceRefreshReads ?? options.forceRefreshBroker
    );

    if (paperPortfolioRefreshPromiseRef.current) {
      return paperPortfolioRefreshPromiseRef.current;
    }

    const run = async () => {
      setIsLoadingPaperPortfolio(true);
      try {
        if (syncBroker) {
          await synchronizeBrokerState({
            source: "frontend_portfolio_refresh",
          }).catch(() => null);
        }

        const [paperResponse, reconciliationResponse, tradingSessionResult] =
          await Promise.allSettled([
            fetch(`${API_BASE_URL}/api/paper-portfolio`),
            fetch(
              `${API_BASE_URL}/api/portfolio-reconciliation${
                forceRefreshReads ? "?refresh=1" : ""
              }`
            ),
            getTradingSession({ forceRefresh: forceRefreshReads }),
          ]);

        if (paperResponse.status !== "fulfilled" || !paperResponse.value.ok) {
          throw new Error("Unable to load paper portfolio");
        }
        setPaperPortfolio(await paperResponse.value.json());

        if (
          reconciliationResponse.status !== "fulfilled" ||
          !reconciliationResponse.value.ok
        ) {
          throw new Error("Unable to verify portfolio accounting");
        }
        setPortfolioReconciliation(await reconciliationResponse.value.json());
        setPortfolioReconciliationError("");

        if (tradingSessionResult.status === "fulfilled") {
          const session = tradingSessionResult.value?.session || null;
          setActiveTradingSession(session);
          setActiveBrokerAccount(session?.account || null);
        } else {
          setActiveTradingSession(null);
          setActiveBrokerAccount(null);
        }
        setPaperError("");
      } catch (err) {
        setPaperError(err.message);
        setPortfolioReconciliationError(err.message);
      } finally {
        setIsLoadingPaperPortfolio(false);
      }
    };

    paperPortfolioRefreshPromiseRef.current = run().finally(() => {
      paperPortfolioRefreshPromiseRef.current = null;
    });
    return paperPortfolioRefreshPromiseRef.current;
  }, [enabled]);

  useEffect(() => {
    const refreshTradingSession = () => {
      fetchPaperPortfolio({ forceRefreshReads: true });
    };

    window.addEventListener(
      "trading-dashboard:trading-session-changed",
      refreshTradingSession
    );
    return () => {
      window.removeEventListener(
        "trading-dashboard:trading-session-changed",
        refreshTradingSession
      );
    };
  }, [fetchPaperPortfolio]);

  const fetchPaperTrades = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/paper-trades`);
      if (!response.ok) throw new Error("Unable to load paper trades");
      setPaperTradesData(await response.json());
    } catch (err) {
      setPaperTradesData({ trades: [], error: err.message });
    }
  }, [enabled]);

  const { isSyncing: isAutoSyncingBrokerLedger, requestLedgerSync, syncState: brokerLedgerSyncState } =
    useAutoBrokerLedgerSync({
      enabled,
      provider: activeTradingSession?.provider || activeBrokerAccount?.provider || "INTERNAL_PAPER",
      reconciliation: portfolioReconciliation,
      triggerKey: portfolioReconciliation?.lastChecked || portfolioReconciliation?.status || "",
    });

  const resolvedBrokerState = useMemo(
    () =>
      resolveBrokerState({
        activeBrokerAccount,
        activeTradingSession,
      }),
    [activeBrokerAccount, activeTradingSession]
  );

  const handleRebuildPortfolio = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    setIsRebuildingPortfolio(true);
    setPortfolioReconciliationError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/portfolio/recompute`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to rebuild portfolio");
      setPaperPortfolio(payload.portfolio);
      setPortfolioReconciliation(payload.reconciliation);
      await Promise.all([fetchRiskDashboard(), fetchPortfolioConstruction()]);
    } catch (err) {
      setPortfolioReconciliationError(err.message);
    } finally {
      setIsRebuildingPortfolio(false);
    }
  }, [enabled, fetchPortfolioConstruction, fetchRiskDashboard]);

  useEffect(() => {
    if (enabled) {
      return undefined;
    }

    setActiveBrokerAccount(null);
    setActiveTradingSession(null);
    setPaperPortfolio(null);
    setPortfolioReconciliation(null);
    setPaperTradesData({ trades: [] });
    setRiskDashboardData(null);
    setPortfolioConstructionData(null);
    setPaperError("");
    setRiskDashboardError("");
    setPortfolioConstructionError("");
    setPortfolioReconciliationError("");
    setIsLoadingPaperPortfolio(false);
    setIsLoadingRiskDashboard(false);
    setIsLoadingPortfolioConstruction(false);
    setIsRebuildingPortfolio(false);
    return undefined;
  }, [enabled]);

  return {
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
    isLoadingPortfolioConstruction,
    isLoadingRiskDashboard,
    isRebuildingPortfolio,
    paperError,
    paperPortfolio,
    paperTradesData,
    portfolioConstructionData,
    portfolioConstructionError,
    portfolioReconciliation,
    portfolioReconciliationError,
    requestBrokerLedgerSync: requestLedgerSync,
    riskDashboardData,
    riskDashboardError,
    setPortfolioConstructionError: setConstructionError,
    setRiskDashboardError: setRiskError,
  };
}
