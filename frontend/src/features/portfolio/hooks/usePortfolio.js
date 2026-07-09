import { useMemo, useState } from "react";
import { resolveBrokerState } from "../../broker/utils/resolveBrokerState";

export default function usePortfolio({
  activeBrokerAccount,
  activeTradingSession,
  data,
  paperPortfolio,
  paperTradesData,
  portfolioConstructionData,
  resolvedBrokerState,
  riskDashboardData,
}) {
  const [portfolioSection, setPortfolioSection] = useState("Overview");

  const sessionTrades = Array.isArray(activeTradingSession?.trades)
    ? activeTradingSession.trades
    : null;
  const brokerState =
    resolvedBrokerState ||
    resolveBrokerState({
      activeBrokerAccount,
      activeTradingSession,
    });
  const activeProvider = String(
    brokerState.provider || "INTERNAL_PAPER"
  );
  const isInternalPaperMode = brokerState.isInternalPaperMode;
  const paperTrades = useMemo(
    () =>
      isInternalPaperMode
        ? sessionTrades || paperTradesData.trades || []
        : sessionTrades || [],
    [isInternalPaperMode, paperTradesData, sessionTrades]
  );

  const paperPositions = useMemo(
    () => Object.values(paperPortfolio?.positions || {}),
    [paperPortfolio]
  );

  const construction = portfolioConstructionData || {};
  const riskPortfolio = riskDashboardData?.portfolio || {};
  const constructionPortfolio = construction.portfolio || {};
  const constructionWeights = construction.weights || {};
  const constructionRisk = construction.risk || {};
  const constructionWarnings = construction.warnings || {};
  const constructionLimits = construction.suggested_limits || {};
  const constructionRecommendations = construction.recommendations || [];
  const activeAccount = brokerState.account || {};
  const balances = brokerState.balances || {};
  const usesBrokerHeadline =
    brokerState.usesBrokerHeadline &&
    Number.isFinite(Number(balances.equity ?? activeAccount?.equity ?? activeAccount?.cash));
  const brokerPositions = brokerState.positions;
  const brokerOpenOrders = brokerState.orders;
  const activeBrokerOrders = brokerState.openOrders;
  const inactiveBrokerOrders = brokerState.inactiveOrders;
  const headlineFees = Number(
    activeTradingSession?.performance?.feesPaid ?? paperPortfolio?.fees_paid ?? 0
  ) || 0;
  const headlineEquity = Number(
    usesBrokerHeadline
      ? balances.equity ?? activeAccount?.equity ?? 0
      : activeTradingSession?.balances?.equity ?? paperPortfolio?.equity ?? 100000
  ) || 0;

  const headlineCash = Number(
    usesBrokerHeadline
      ? balances.cash ?? activeAccount?.cash ?? 0
      : activeTradingSession?.balances?.cash ?? paperPortfolio?.cash ?? 100000
  ) || 0;

  const headlineModeLabel = activeTradingSession
    ? `${activeProvider} ${String(
        activeTradingSession.tradeEnv ||
          activeTradingSession.executionMode ||
          activeAccount?.tradeEnv ||
          activeAccount?.executionMode ||
          ""
      )
        .trim()
        .replaceAll("_", " ")}`
        .trim()
    : usesBrokerHeadline
      ? `${activeProvider} ${String(
          activeAccount?.tradeEnv || activeAccount?.executionMode || ""
        )
          .trim()
          .replaceAll("_", " ")}`
          .trim()
      : "INTERNAL PAPER";

  const constructionPositions = useMemo(
    () =>
      constructionWeights.positions ||
      riskDashboardData?.open_positions_risk ||
      paperPositions.map((position) => ({
        symbol: position.symbol,
        sector: position.sector || "UNKNOWN",
        notional:
          Number(position.quantity || 0) *
          Number(position.last_price ?? position.avg_price ?? 0),
      })),
    [constructionWeights.positions, paperPositions, riskDashboardData?.open_positions_risk]
  );

  const constructionSectors = useMemo(
    () => constructionWeights.sectors || riskDashboardData?.sector_exposure || [],
    [constructionWeights.sectors, riskDashboardData?.sector_exposure]
  );

  const constructionEquity =
    Number(
      constructionPortfolio.equity ??
        riskPortfolio.equity ??
        paperPortfolio?.equity ??
        100000
    ) || 0;

  const constructionCash =
    Number(
      constructionPortfolio.cash ??
        paperPortfolio?.cash ??
        riskPortfolio.cash ??
        100000
    ) || 0;

  const largestConstructionPosition = useMemo(
    () =>
      constructionPositions.reduce(
        (largest, position) =>
          Number(position.notional || 0) > Number(largest?.notional || 0)
            ? position
            : largest,
        null
      ),
    [constructionPositions]
  );

  const largestConstructionSector = useMemo(
    () =>
      constructionSectors.reduce(
        (largest, sector) =>
          Number(sector.pct || 0) > Number(largest?.pct || 0) ? sector : largest,
        null
      ),
    [constructionSectors]
  );

  const bestPortfolioAdditions = useMemo(
    () =>
      [...(data?.opportunities || [])]
        .map((opportunity) => {
          const portfolioFit = opportunity.portfolio_fit || {};
          return {
            ...opportunity,
            portfolioFitScore: Number(
              opportunity.portfolio_fit_score ??
                portfolioFit.portfolio_fit_score ??
                0
            ),
            portfolioRecommendation:
              opportunity.portfolio_recommendation ||
              portfolioFit.recommendation ||
              "WAIT",
            portfolioReason:
              portfolioFit.explanation ||
              opportunity.reasons?.[0] ||
              "No portfolio-fit reason available.",
          };
        })
        .sort(
          (a, b) =>
            b.portfolioFitScore - a.portfolioFitScore ||
            Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0)
        )
        .slice(0, 12),
    [data?.opportunities]
  );

  return {
    activeBrokerOrders,
    bestPortfolioAdditions,
    brokerOpenOrders,
    brokerPositions,
    constructionCash,
    constructionEquity,
    constructionLimits,
    constructionPortfolio,
    constructionPositions,
    constructionRecommendations,
    constructionRisk,
    constructionSectors,
    constructionWarnings,
    constructionWeights,
    headlineCash,
    headlineEquity,
    headlineFees,
    isInternalPaperMode,
    headlineModeLabel,
    inactiveBrokerOrders,
    largestConstructionPosition,
    largestConstructionSector,
    paperPositions,
    paperTrades,
    portfolioSection,
    setPortfolioSection,
  };
}
