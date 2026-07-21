const { requireUserId } = require("../../../repositories/ownership");
const { buildPortfolioEvidence } = require("./portfolioCopilotEvidence.service");

const MAX_POSITIONS = 50;
const MAX_ACTIVITY_ITEMS = 25;
const STALE_AFTER_MS = 15 * 60 * 1000;

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizePosition(position = {}, equity = 0) {
  const quantity = toNumber(position.quantity ?? position.shares, 0);
  const averageCost = toNumber(position.averageCost ?? position.average_cost ?? position.avgCost ?? position.avg_price, 0);
  const currentPrice = toNumber(position.lastPrice ?? position.last_price ?? position.currentPrice, averageCost);
  const marketValue = toNumber(position.marketValue ?? position.market_value, quantity * currentPrice);
  const unrealizedPnl = toNumber(position.unrealizedPnl ?? position.unrealized_pnl, marketValue - quantity * averageCost);
  return {
    id: String(position.id || position.brokerPositionId || ""),
    symbol: String(position.symbol || "").toUpperCase(),
    quantity,
    side: quantity < 0 ? "SHORT" : "LONG",
    averageCost,
    currentPrice,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct: toNumber(
      position.unrealizedPnlPct ?? position.unrealized_pnl_pct,
      quantity * averageCost ? (unrealizedPnl / Math.abs(quantity * averageCost)) * 100 : null
    ),
    portfolioWeightPct: equity ? (Math.abs(marketValue) / equity) * 100 : null,
    sector: String(position.sector || "UNKNOWN"),
    industry: String(position.industry || ""),
    priceTimestamp: toTimestamp(position.priceTimestamp || position.updatedAt || position.lastUpdated),
  };
}

function approvalMatchesProvider(approval = {}, provider) {
  const raw = approval.raw && typeof approval.raw === "object" ? approval.raw : {};
  const recorded = String(raw.provider || raw.broker || raw.executionProvider || "").toUpperCase();
  if (recorded) return recorded === String(provider).toUpperCase();
  return provider === "INTERNAL_PAPER";
}

function createPortfolioCopilotContextService({
  tradingSessionService,
  buildRiskDashboardFromDatabase,
  getPortfolioForUser,
  listApprovalRequests,
  prisma,
  now = () => new Date(),
}) {
  async function loadOwnedSupportingData(userId, provider) {
    const isInternal = provider === "INTERNAL_PAPER";
    const [riskResult, portfolioResult, approvalsResult, deploymentResult] = await Promise.allSettled([
      isInternal && buildRiskDashboardFromDatabase
        ? buildRiskDashboardFromDatabase(userId)
        : Promise.resolve(null),
      isInternal && getPortfolioForUser ? getPortfolioForUser(userId) : Promise.resolve(null),
      listApprovalRequests ? listApprovalRequests(userId) : Promise.resolve([]),
      prisma?.run
        ? prisma.run(async (db) => {
            const [deployment, snapshots, availableStrategies] = await Promise.all([
              db.strategyDeploymentSet.findFirst({
                where: { userId },
                include: {
                  capitalAllocations: {
                    where: { userId },
                    include: { experiment: { select: { id: true, name: true, status: true } } },
                    orderBy: { assignedCapitalPct: "desc" },
                    take: 20,
                  },
                  routes: { where: { userId }, orderBy: { allocationPct: "desc" }, take: 30 },
                },
              }),
              isInternal
                ? db.portfolioState.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 2 })
                : Promise.resolve([]),
              db.strategyExperiment?.findMany
                ? db.strategyExperiment.findMany({ where: { userId }, select: { id: true, name: true, status: true }, orderBy: { updatedAt: "desc" }, take: 50 })
                : Promise.resolve([]),
            ]);
            return { deployment, snapshots, availableStrategies };
          })
        : Promise.resolve(null),
    ]);
    return {
      risk: riskResult.status === "fulfilled" ? riskResult.value : null,
      portfolio: portfolioResult.status === "fulfilled" ? portfolioResult.value : null,
      approvals: approvalsResult.status === "fulfilled" ? approvalsResult.value : [],
      deployment: deploymentResult.status === "fulfilled" ? deploymentResult.value?.deployment : null,
      snapshots: deploymentResult.status === "fulfilled" ? deploymentResult.value?.snapshots || [] : [],
      availableStrategies: deploymentResult.status === "fulfilled" ? deploymentResult.value?.availableStrategies || [] : [],
      loadWarnings: [riskResult, portfolioResult, approvalsResult, deploymentResult]
        .filter((result) => result.status === "rejected")
        .map(() => "Some platform context was unavailable."),
    };
  }

  async function buildContext(userId, request = {}) {
    const ownerId = requireUserId(userId);
    const session = await tradingSessionService.getTradingSession(ownerId, { forceRefresh: false });
    const provider = String(session.provider || "INTERNAL_PAPER").toUpperCase();
    const support = await loadOwnedSupportingData(ownerId, provider);
    const account = session.account || {};
    const balances = session.balances || {};
    const equity = toNumber(balances.equity ?? account.equity, 0);
    const symbolFilter = new Set((request.symbols || []).map((symbol) => String(symbol).toUpperCase()));
    const positions = (session.positions || [])
      .map((position) => normalizePosition(position, equity))
      .filter((position) => position.symbol && (!symbolFilter.size || symbolFilter.has(position.symbol)))
      .sort((left, right) => Math.abs(right.marketValue) - Math.abs(left.marketValue))
      .slice(0, MAX_POSITIONS);
    const sectorMap = new Map();
    positions.forEach((position) => {
      const current = sectorMap.get(position.sector) || { sector: position.sector, marketValue: 0, positions: 0 };
      current.marketValue += Math.abs(position.marketValue || 0);
      current.positions += 1;
      sectorMap.set(position.sector, current);
    });
    const sectors = [...sectorMap.values()]
      .map((sector) => ({ ...sector, weightPct: equity ? (sector.marketValue / equity) * 100 : null }))
      .sort((left, right) => (right.weightPct || 0) - (left.weightPct || 0));
    const snapshotTimestamp = toTimestamp(
      account.lastUpdated || account.updatedAt || session.portfolio?.updatedAt || support.portfolio?.reconciliation?.lastChecked
    );
    const syncTimestamp = toTimestamp(account.lastSyncAt || account.syncTimestamp || account.lastUpdated);
    const ageMs = snapshotTimestamp ? now().getTime() - new Date(snapshotTimestamp).getTime() : null;
    const marketPriceTimestamp = positions.map((position) => position.priceTimestamp).filter(Boolean).sort().at(-1) || null;
    const marketPriceAgeMs = marketPriceTimestamp ? now().getTime() - new Date(marketPriceTimestamp).getTime() : null;
    const marketPricesStale = marketPriceAgeMs === null || marketPriceAgeMs > STALE_AFTER_MS;
    const stale = ageMs === null || ageMs > STALE_AFTER_MS || marketPricesStale || Boolean(
      account.staleBecauseRateLimited || account.staleBecauseBrokerReadFailed
    );
    const reconciliation = support.portfolio?.reconciliation || null;
    const pendingApprovals = support.approvals
      .filter((approval) => String(approval.status).toUpperCase() === "PENDING")
      .filter((approval) => approvalMatchesProvider(approval, provider))
      .slice(0, MAX_ACTIVITY_ITEMS)
      .map((approval) => ({
        id: approval.id,
        symbol: approval.symbol,
        side: approval.side,
        quantity: approval.quantity,
        createdAt: toTimestamp(approval.createdAt),
      }));
    const strategyFilter = new Set((request.strategyIds || []).map(String));
    const strategyAllocations = (support.deployment?.capitalAllocations || [])
      .filter((allocation) => !strategyFilter.size || strategyFilter.has(String(allocation.experimentId)))
      .map((allocation) => ({
      id: allocation.id,
      strategyId: allocation.experimentId,
      strategyName: allocation.experiment?.name || allocation.experimentId,
      strategyStatus: allocation.experiment?.status || "UNKNOWN",
      assignedCapitalPct: toNumber(allocation.assignedCapitalPct, 0),
      status: allocation.status,
      updatedAt: toTimestamp(allocation.updatedAt),
      }));
    const matrixAllocations = (support.deployment?.routes || []).map((route) => ({
      id: route.id,
      sector: route.sector,
      regime: route.regime,
      strategyId: route.selectedExperimentId || "",
      allocationPct: toNumber(route.allocationPct),
      status: route.status,
      evidenceStatus: route.evidenceStatus || "",
      updatedAt: toTimestamp(route.updatedAt),
    }));
    const cash = toNumber(balances.cash ?? account.cash, 0);
    const risk = support.risk?.risk || {};
    const portfolioMetrics = support.risk?.portfolio || {};
    const warnings = [...support.loadWarnings];
    if (stale) warnings.push(snapshotTimestamp ? "Portfolio data is stale." : "Portfolio freshness timestamp is unavailable.");
    if (marketPricesStale) warnings.push(marketPriceTimestamp ? "Market prices are stale." : "Market-price freshness is unavailable.");
    if (account.staleBecauseBrokerReadFailed) warnings.push("The latest broker read failed; cached account data is being analyzed.");
    if (account.staleBecauseRateLimited) warnings.push("Broker rate limiting caused a cached account snapshot to be used.");
    if (reconciliation && !reconciliation.matched) warnings.push("Portfolio reconciliation is degraded.");
    if (!positions.some((position) => position.sector !== "UNKNOWN")) warnings.push("Sector metadata is unavailable for current positions.");

    const context = {
      workflow: request.workflow || "OVERVIEW",
      question: String(request.question || "Explain my portfolio."),
      provider,
      executionMode: String(session.executionMode || ""),
      account: {
        accountId: String(session.accountId || account.brokerAccountId || ""),
        currency: String(balances.currency || account.currency || "USD"),
        accountType: String(account.accountType || session.tradeEnv || session.executionMode || ""),
        cash,
        buyingPower: toNumber(balances.buyingPower ?? account.buyingPower),
        equity,
      },
      positions,
      performance: {
        realizedPnl: toNumber(session.performance?.realizedPnl),
        unrealizedPnl: positions.reduce((sum, position) => sum + (position.unrealizedPnl || 0), 0),
        feesPaid: toNumber(session.performance?.feesPaid),
        drawdownPct: toNumber(risk.current_drawdown_pct ?? portfolioMetrics.drawdown_pct),
        volatility: toNumber(risk.portfolio_volatility ?? portfolioMetrics.volatility),
      },
      exposure: {
        sectors,
        grossExposurePct: equity
          ? (positions.reduce((sum, position) => sum + Math.abs(position.marketValue || 0), 0) / equity) * 100
          : null,
        netExposurePct: equity
          ? (positions.reduce((sum, position) => sum + (position.marketValue || 0), 0) / equity) * 100
          : null,
        cashPct: equity ? (cash / equity) * 100 : null,
      },
      tradingState: {
        openOrders: (session.openOrders || []).slice(0, MAX_ACTIVITY_ITEMS),
        recentFills: (session.trades || []).slice(0, MAX_ACTIVITY_ITEMS),
        pendingApprovals,
        activeDeploymentSet: support.deployment
          ? { id: support.deployment.id, name: support.deployment.name, allocationMethod: support.deployment.allocationMethod }
          : null,
        strategyAllocations,
        availableStrategies: support.availableStrategies,
        matrixAllocations,
        reconciliation: reconciliation
          ? {
              id: reconciliation.id || "",
              status: reconciliation.status,
              matched: Boolean(reconciliation.matched),
              lastChecked: toTimestamp(reconciliation.lastChecked),
            }
          : null,
      },
      freshness: {
        portfolioSnapshotTimestamp: snapshotTimestamp,
        brokerSyncTimestamp: syncTimestamp,
        marketPriceTimestamp,
        marketPricesStale,
        reconciliationState: reconciliation?.status || "UNAVAILABLE",
        stale,
      },
      comparison: {
        currentSnapshot: support.snapshots[0]
          ? { id: support.snapshots[0].id, equity: toNumber(support.snapshots[0].equity), cash: toNumber(support.snapshots[0].cash), timestamp: toTimestamp(support.snapshots[0].updatedAt) }
          : null,
        previousSnapshot: support.snapshots[1]
          ? { id: support.snapshots[1].id, equity: toNumber(support.snapshots[1].equity), cash: toNumber(support.snapshots[1].cash), timestamp: toTimestamp(support.snapshots[1].updatedAt) }
          : null,
      },
      limitations: warnings,
      preferences: request.preferences && typeof request.preferences === "object" ? request.preferences : null,
    };
    context.availableEvidence = buildPortfolioEvidence(context);
    return context;
  }

  return { buildContext };
}

module.exports = { createPortfolioCopilotContextService, normalizePosition };
