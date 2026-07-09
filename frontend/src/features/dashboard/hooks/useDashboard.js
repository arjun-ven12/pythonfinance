import { useMemo } from "react";
import { normalizeExchange } from "../../../utils/marketMetadata";
import {
  firstFiniteNumber,
  resolveBrokerState,
  toFiniteNumber,
} from "../../broker/utils/resolveBrokerState";

function formatScanAge(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return "No scan age";
  if (value < 1) return "Just now";
  if (value >= 60) return `${(value / 60).toFixed(1)}h old`;
  return `${value.toFixed(1)}m old`;
}

export default function useDashboard({
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
  horizonSettings,
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
}) {
  const generatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleString()
    : "not available";

  const highestScore = useMemo(
    () => Math.max(...dashboardOpportunities.map((item) => Number(item.opportunity_score) || 0), 0),
    [dashboardOpportunities]
  );

  const marketSummaries = useMemo(
    () => dashboardOpportunities.reduce((acc, item) => {
      const market = item.market || (item.is_sgx ? "Singapore" : "US");
      const exchange = normalizeExchange(item.exchange, item);
      acc.markets[market] = acc.markets[market] || { count: 0, buy: 0, scoreTotal: 0 };
      acc.markets[market].count += 1;
      acc.markets[market].scoreTotal += Number(item.opportunity_score || 0);
      if (item.signal === "BUY") acc.markets[market].buy += 1;
      acc.exchanges[exchange] = acc.exchanges[exchange] || { count: 0, scoreTotal: 0 };
      acc.exchanges[exchange].count += 1;
      acc.exchanges[exchange].scoreTotal += Number(item.opportunity_score || 0);
      return acc;
    }, { markets: {}, exchanges: {} }),
    [dashboardOpportunities]
  );

  const strongestMarket = useMemo(
    () => Object.entries(marketSummaries.markets).sort(
      ([, a], [, b]) => b.scoreTotal / Math.max(1, b.count) - a.scoreTotal / Math.max(1, a.count)
    )[0]?.[0] || "-",
    [marketSummaries]
  );

  const strongestExchange = useMemo(
    () => Object.entries(marketSummaries.exchanges).sort(
      ([, a], [, b]) => b.scoreTotal / Math.max(1, b.count) - a.scoreTotal / Math.max(1, a.count)
    )[0]?.[0] || "-",
    [marketSummaries]
  );

  const automationStatus = useMemo(() => ({
    currentMode: (proposedOrdersData.execution_status || {}).execution_mode || executionMode,
    pendingApprovals:
      (proposedOrdersData.execution_status || {}).pending_approvals ??
      (proposedOrdersData.orders || []).filter((order) => order.execution_route?.route === "REQUEST_APPROVAL").length,
    blockedTrades:
      (proposedOrdersData.execution_status || {}).blocked_trades ??
      (proposedOrdersData.orders || []).filter((order) => order.execution_route?.route === "BLOCKED").length,
    approvalRequests:
      (proposedOrdersData.execution_status || {}).approval_requests ||
      (proposedOrdersData.orders || [])
        .filter((order) => order.execution_route?.requires_user_approval)
        .map((order) => ({
          symbol: order.symbol,
          reasons: order.execution_route?.approval_reasons || [],
        })),
    lastAutomatedAction: (proposedOrdersData.execution_status || {}).last_automated_action || "None",
    autoReady:
      (proposedOrdersData.execution_status || {}).auto_ready ??
      (proposedOrdersData.orders || []).filter((order) => order.execution_route?.route === "READY_FOR_AUTO_EXECUTION").length,
  }), [executionMode, proposedOrdersData]);

  const marketRegime =
    data?.market_regime?.regime ||
    data?.market_regime?.regime_name ||
    data?.market_regime ||
    "UNKNOWN";
  const lastScanStrategyName = data?.strategy_name || data?.active_strategy?.name || data?.strategy?.name || "";
  const activeDeploymentSet = activeStrategyConfig?.activeSet || null;
  const activeDeploymentMembers = activeDeploymentSet?.membership || [];
  const activeStrategy = {
    name:
      activeStrategyConfig?.name ||
      activeStrategyConfig?.strategy?.name ||
      lastScanStrategyName ||
      "EMA/RSI Trend Momentum",
    path: activeStrategyConfig?.path || "python-engine/strategy.py",
    description:
      activeStrategyConfig?.description ||
      "Scores each stock using EMA trend, price versus EMA20, RSI, and controlled volatility. Scanner then adjusts BUY eligibility with horizon, market regime, news/OpenAI risk, backtest performance, and portfolio fit.",
    signalFunction:
      activeStrategyConfig?.signalFunction ||
      activeStrategyConfig?.signal_function ||
      "generate_research_signal_from_row",
    buyThreshold:
      activeStrategyConfig?.buyThreshold ?? activeStrategyConfig?.buy_threshold ?? Number(signalThreshold),
    sellThreshold: activeStrategyConfig?.sellThreshold ?? activeStrategyConfig?.sell_threshold ?? 30,
    rawScoreMax: activeStrategyConfig?.rawScoreMax ?? activeStrategyConfig?.raw_score_max ?? 80,
  };
  const engineIsRunning = Boolean(engineStatus?.is_running);
  const nextScanLabel = engineIsRunning
    ? engineStatus?.next_run_at
      ? new Date(engineStatus.next_run_at).toLocaleString()
      : "Scheduled"
    : "Engine stopped";
  const safetyAllowsTrade = safetyStatus?.allow_new_trades ?? safetyStatus?.allow_trade ?? true;
  const safetyRiskLevel = safetyStatus?.risk_level || "UNKNOWN";
  const activeHorizonLabel = horizonSettings[tradingHorizon]?.label || tradingHorizon || "Swing";
  const activeHorizonProfile =
    activeStrategyConfig?.horizonProfile ||
    activeStrategyConfig?.horizon_profile ||
    horizonSettings[tradingHorizon] ||
    horizonSettings.SWING;
  const activeStrategyLatestRun = activeStrategyConfig?.latestRun || activeStrategyConfig?.latest_run || null;
  const activeStrategyDeploymentScore =
    activeStrategyConfig?.deploymentScore ??
    activeStrategyConfig?.deployment_score ??
    activeStrategyLatestRun?.deploymentScore ??
    activeStrategyLatestRun?.deployment_score ??
    null;
  const lastScanMatchesActiveStrategy =
    !lastScanStrategyName || !activeStrategyConfig?.name || lastScanStrategyName === activeStrategyConfig.name;

  const brokerState =
    resolvedBrokerState ||
    resolveBrokerState({
      activeBrokerAccount,
      activeTradingSession,
    });
  const activeProvider = brokerState.provider;
  const activeAccount = brokerState.account;
  const balances = brokerState.balances;
  const isBrokerProvider = brokerState.isBrokerProvider;
  const usesBrokerHeadline = brokerState.usesBrokerHeadline;

  const portfolioEquity =
    firstFiniteNumber(
      usesBrokerHeadline
        ? balances.equity ?? activeAccount?.equity
        : null,
      activeProvider === "INTERNAL_PAPER" ? balances.equity : null,
      isBrokerProvider ? null : paperPortfolio?.equity,
      isBrokerProvider ? null : riskDashboardData?.portfolio?.equity,
      isBrokerProvider ? null : riskDashboardData?.summary?.equity,
      usesBrokerHeadline ? null : 0
    ) ?? 0;
  const portfolioCash =
    firstFiniteNumber(
      usesBrokerHeadline
        ? balances.cash ?? activeAccount?.cash
        : null,
      activeProvider === "INTERNAL_PAPER" ? balances.cash : null,
      isBrokerProvider ? null : paperPortfolio?.cash,
      isBrokerProvider ? null : riskDashboardData?.portfolio?.cash,
      isBrokerProvider ? null : riskDashboardData?.summary?.cash,
      usesBrokerHeadline ? null : 0
    ) ?? 0;
  const buyingPower =
    firstFiniteNumber(
      usesBrokerHeadline
        ? balances.buyingPower ?? activeAccount?.buyingPower
        : null,
      usesBrokerHeadline ? balances.availableFunds ?? activeAccount?.availableFunds : null,
      usesBrokerHeadline ? balances.cash ?? activeAccount?.cash : null,
      activeProvider === "INTERNAL_PAPER" ? balances.buyingPower ?? balances.cash : null,
      isBrokerProvider ? null : paperPortfolio?.cash,
      isBrokerProvider ? null : riskDashboardData?.portfolio?.cash,
      usesBrokerHeadline ? null : 0
    ) ?? 0;
  const availableFunds =
    firstFiniteNumber(
      usesBrokerHeadline
        ? balances.availableFunds ?? activeAccount?.availableFunds
        : null,
      usesBrokerHeadline ? balances.cash ?? activeAccount?.cash : null,
      activeProvider === "INTERNAL_PAPER" ? balances.availableFunds ?? balances.cash : null,
      isBrokerProvider ? null : paperPortfolio?.cash,
      isBrokerProvider ? null : riskDashboardData?.portfolio?.cash,
      usesBrokerHeadline ? null : 0
    ) ?? 0;
  const marginValue =
    firstFiniteNumber(
      usesBrokerHeadline
        ? balances.margin ?? activeAccount?.margin
        : null,
      0
    ) ?? 0;
  const brokerCurrency = balances.currency || activeAccount?.currency || "USD";
  const brokerAccountType = activeAccount?.accountType || "-";
  const brokerPositionCount = brokerState.positions.length;
  const brokerOpenOrderCount = brokerState.openOrders.length;
  const brokerExposurePct = usesBrokerHeadline
    ? (() => {
        const positions = brokerState.positions;
        const grossExposure = positions.reduce((total, position) => {
          const marketValue =
            firstFiniteNumber(
              position?.marketValue,
              toFiniteNumber(position?.quantity, 0) * toFiniteNumber(position?.lastPrice, 0)
            ) ?? 0;
          return total + Math.abs(Number.isFinite(marketValue) ? marketValue : 0);
        }, 0);
        return portfolioEquity > 0 ? (grossExposure / portfolioEquity) * 100 : 0;
      })()
    : null;
  const cashPct = portfolioEquity > 0 ? (portfolioCash / portfolioEquity) * 100 : null;
  const exposurePct =
    usesBrokerHeadline
      ? brokerExposurePct
      : riskDashboardData?.portfolio?.total_exposure_pct ??
        riskDashboardData?.summary?.total_exposure_pct ??
        riskDashboardData?.risk?.total_exposure_pct ??
        null;
  const openRiskPct = usesBrokerHeadline
    ? null
    : riskDashboardData?.risk?.open_risk_pct ?? riskDashboardData?.summary?.open_risk_pct ?? null;

  const criticalItems = [
    ...pendingApprovalRequests.slice(0, 1).map((request) => ({
      key: `approval-${request.id || request.symbol || "pending"}`,
      type: "approval",
      title: `${pendingApprovalRequests.length} pending approval${pendingApprovalRequests.length === 1 ? "" : "s"}`,
      body: `${request.symbol} is waiting for review.`,
      action: "Open Approvals",
      onClick: () => setActiveTab("Approvals"),
    })),
    ...(!safetyAllowsTrade
      ? [{
          key: "safety-warning",
          type: "safety",
          title: "Trading safety warning",
          body: safetyStatus?.reason || safetyStatus?.violations?.[0] || "Safety manager is blocking trades.",
          action: "Open Risk",
          onClick: () => setActiveTab("Portfolio"),
        }]
      : []),
    ...(alertNeedsAction.length > 0
      ? [{
          key: `alert-${alertNeedsAction[0]?.id || alertNeedsAction[0]?.symbol || "attention"}`,
          type: "alert",
          title: "High-score BUY alert",
          body: alertNeedsAction[0]?.message || `${alertNeedsAction[0]?.symbol || "A symbol"} needs attention.`,
          action: "View Alerts",
          onClick: () => setActiveTab("Alerts"),
        }]
      : []),
    ...(dataHealth?.is_stale
      ? [{
          key: "stale-scan",
          type: "stale",
          title: "Scan data is stale",
          body: `Last scan ${formatScanAge(dataHealth.scan_age_minutes)}.`,
          action: "Run Scan",
          onClick: handleRunScan,
        }]
      : []),
    ...(ibkrStatus?.status && !["CONNECTED", "CONFIGURED"].includes(ibkrStatus.status)
      ? [{
          key: `broker-${ibkrStatus.status}`,
          type: "broker",
          title: "Broker not connected",
          body: `Broker status: ${ibkrStatus.status}.`,
          action: "Open Broker",
          onClick: () => setActiveTab("IBKR"),
        }]
      : []),
  ];

  const sessionEquityHistory = Array.isArray(activeTradingSession?.performance?.equityHistory)
    ? activeTradingSession.performance.equityHistory
    : null;
  const equityCurveData = (sessionEquityHistory || paperPortfolio?.equity_history || []).map((point, index) => ({
    label: point.timestamp ? new Date(point.timestamp).toLocaleDateString() : `Point ${index + 1}`,
    equity: Number(point.equity) || 0,
  }));
  const dashboardEquityLabel = usesBrokerHeadline
    ? `${activeProvider} ${String(
      activeTradingSession?.tradeEnv ||
          activeTradingSession?.executionMode ||
          activeAccount?.tradeEnv ||
          activeAccount?.executionMode ||
          ""
      )
        .trim()
        .replaceAll("_", " ")} equity`
    : "Paper portfolio equity";
  const dashboardEquityNote = usesBrokerHeadline
    ? "Connected broker account headline. Ledger history remains available in Portfolio."
    : equityCurveData.length > 1
      ? "Live paper equity history"
      : "Awaiting enough paper activity for history";
  const drawdownData = equityCurveData.reduce((acc, point) => {
    const previousPeak = acc.length > 0 ? acc[acc.length - 1].peak : point.equity;
    const peak = Math.max(previousPeak, point.equity);
    const drawdown = peak > 0 ? ((peak - point.equity) / peak) * 100 : 0;
    acc.push({ label: point.label, drawdown: Number(drawdown.toFixed(2)), peak });
    return acc;
  }, []);
  const signalDistributionData = ["BUY", "HOLD", "SELL"].map((signal) => ({
    name: signal,
    value: dashboardCounts[signal] || 0,
  }));
  const topOpportunityData = [...dashboardOpportunities]
    .sort((a, b) => Number(b.opportunity_score) - Number(a.opportunity_score))
    .slice(0, 10)
    .map((item) => ({
      symbol: item.symbol,
      score: Number(item.opportunity_score) || 0,
    }));

  return {
    activeDeploymentMembers,
    activeDeploymentSet,
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
    dashboardEquityLabel,
    dashboardEquityNote,
    drawdownData,
    engineIsRunning,
    equityCurveData,
    exposurePct,
    generatedAt,
    highestScore,
    lastScanMatchesActiveStrategy,
    lastScanStrategyName,
    marginValue,
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
  };
}
