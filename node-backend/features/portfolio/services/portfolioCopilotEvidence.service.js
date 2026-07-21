const PORTFOLIO_EVIDENCE_SOURCE_TYPES = Object.freeze([
  "ACCOUNT_SNAPSHOT",
  "POSITION",
  "PORTFOLIO_SNAPSHOT",
  "TRADE",
  "FILL",
  "ORDER",
  "APPROVAL",
  "STRATEGY_ALLOCATION",
  "MATRIX_ALLOCATION",
  "RISK_METRIC",
  "RECONCILIATION",
  "CORRELATION",
  "SECTOR_EXPOSURE",
  "PORTFOLIO_SIMULATION",
  "MATRIX_REPLAY",
  "BACKTEST",
  "TRANSACTION_COST_ESTIMATE",
]);

function stringifyMetricValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function createPortfolioEvidenceItem({
  sourceType,
  sourceId = "",
  metricName,
  metricValue,
  symbol = "",
  strategy = "",
  timestamp = "",
  dateRange = "",
  interpretation,
  strength = "MEDIUM",
}) {
  const value = stringifyMetricValue(metricValue);
  if (!PORTFOLIO_EVIDENCE_SOURCE_TYPES.includes(sourceType) || !metricName || value === null || !interpretation) {
    return null;
  }
  return {
    sourceType,
    sourceId: String(sourceId || ""),
    metricName: String(metricName),
    metricValue: value,
    symbol: String(symbol || ""),
    strategy: String(strategy || ""),
    timestamp: timestamp ? String(timestamp) : "",
    dateRange: dateRange ? String(dateRange) : "",
    interpretation: String(interpretation),
    strength: ["HIGH", "MEDIUM", "LOW"].includes(strength) ? strength : "MEDIUM",
  };
}

function buildPortfolioEvidence(context = {}) {
  const items = [];
  const add = (item) => {
    const evidence = createPortfolioEvidenceItem(item);
    if (evidence) items.push(evidence);
  };
  const account = context.account || {};
  const timestamp = context.freshness?.portfolioSnapshotTimestamp || "";

  [
    ["Equity", account.equity, "Current account equity or net liquidation value."],
    ["Cash", account.cash, "Current cash balance for the selected execution provider."],
    ["BuyingPower", account.buyingPower, "Current buying power for the selected execution provider."],
  ].forEach(([metricName, metricValue, interpretation]) => add({
    sourceType: "ACCOUNT_SNAPSHOT",
    sourceId: account.accountId || context.provider,
    metricName,
    metricValue,
    timestamp,
    interpretation,
    strength: "HIGH",
  }));

  context.positions?.slice(0, 30).forEach((position) => {
    const sourceId = position.id || `${context.provider}:${position.symbol}`;
    [
      ["MarketValue", position.marketValue, "Current market value of this position."],
      ["PortfolioWeightPct", position.portfolioWeightPct, "Share of account equity represented by this position."],
      ["UnrealizedPnl", position.unrealizedPnl, "Current unrealized profit or loss for this position."],
    ].forEach(([metricName, metricValue, interpretation]) => add({
      sourceType: "POSITION",
      sourceId,
      metricName,
      metricValue,
      symbol: position.symbol,
      timestamp: position.priceTimestamp || timestamp,
      interpretation,
      strength: metricName === "PortfolioWeightPct" ? "MEDIUM" : "HIGH",
    }));
  });

  Object.entries(context.performance || {}).forEach(([metricName, metricValue]) => add({
    sourceType: "RISK_METRIC",
    sourceId: context.provider,
    metricName,
    metricValue,
    timestamp,
    interpretation: `Platform portfolio metric: ${metricName}.`,
    strength: "MEDIUM",
  }));

  context.exposure?.sectors?.slice(0, 12).forEach((sector) => add({
    sourceType: "RISK_METRIC",
    sourceId: `${context.provider}:sector:${sector.sector}`,
    metricName: "SectorExposurePct",
    metricValue: sector.weightPct,
    interpretation: `Portfolio weight assigned to ${sector.sector}.`,
    strength: "MEDIUM",
  }));

  add({
    sourceType: "ORDER",
    sourceId: context.provider,
    metricName: "OpenOrderCount",
    metricValue: context.tradingState?.openOrders?.length,
    timestamp,
    interpretation: "Number of open orders in the selected provider session.",
    strength: "HIGH",
  });
  add({
    sourceType: "APPROVAL",
    sourceId: context.provider,
    metricName: "PendingApprovalCount",
    metricValue: context.tradingState?.pendingApprovals?.length,
    timestamp,
    interpretation: "Number of pending approvals associated with the selected provider context.",
    strength: "HIGH",
  });

  context.tradingState?.strategyAllocations?.slice(0, 12).forEach((allocation) => add({
    sourceType: "STRATEGY_ALLOCATION",
    sourceId: allocation.id,
    metricName: "AssignedCapitalPct",
    metricValue: allocation.assignedCapitalPct,
    strategy: allocation.strategyName,
    timestamp: allocation.updatedAt,
    interpretation: "Capital allocation recorded for this active strategy.",
    strength: "HIGH",
  }));

  context.tradingState?.matrixAllocations?.slice(0, 12).forEach((allocation) => add({
    sourceType: "MATRIX_ALLOCATION",
    sourceId: allocation.id,
    metricName: "AllocationPct",
    metricValue: allocation.allocationPct,
    timestamp: allocation.updatedAt,
    interpretation: `Recorded matrix allocation for ${allocation.sector} in ${allocation.regime}.`,
    strength: "HIGH",
  }));

  context.tradingState?.recentFills?.slice(0, 12).forEach((fill) => add({
    sourceType: "FILL",
    sourceId: fill.id || fill.executionId || fill.orderId,
    metricName: "FillValue",
    metricValue: Number(fill.quantity || 0) * Number(fill.price || fill.fill_price || 0),
    symbol: fill.symbol,
    timestamp: fill.filled_at || fill.updatedAt || fill.createdAt,
    interpretation: "Executed fill value from recent provider activity.",
    strength: "HIGH",
  }));

  [context.comparison?.currentSnapshot, context.comparison?.previousSnapshot]
    .filter(Boolean)
    .forEach((snapshot) => add({
      sourceType: "PORTFOLIO_SNAPSHOT",
      sourceId: snapshot.id,
      metricName: "Equity",
      metricValue: snapshot.equity,
      timestamp: snapshot.timestamp,
      interpretation: "Saved Internal Paper portfolio equity snapshot.",
      strength: "HIGH",
    }));

  const reconciliation = context.tradingState?.reconciliation;
  if (reconciliation) {
    add({
      sourceType: "RECONCILIATION",
      sourceId: reconciliation.id || context.provider,
      metricName: "Status",
      metricValue: reconciliation.status,
      timestamp: reconciliation.lastChecked,
      interpretation: "Latest portfolio reconciliation status.",
      strength: "HIGH",
    });
  }

  return items.slice(0, 80);
}

function normalizePortfolioEvidenceReferences(responseEvidence = [], availableEvidence = []) {
  if (!Array.isArray(responseEvidence) || responseEvidence.length === 0) return [];
  const catalog = new Map(availableEvidence.map((item) => [
    `${item.sourceType}::${item.sourceId}::${item.metricName}`,
    item,
  ]));
  return responseEvidence.map((item) => {
    const key = `${item?.sourceType || ""}::${item?.sourceId || ""}::${item?.metricName || ""}`;
    const match = catalog.get(key);
    if (!match || String(item.metricValue) !== String(match.metricValue)) {
      const error = new Error(`AI cited unavailable or mismatched portfolio evidence: ${key}.`);
      error.statusCode = 502;
      error.code = "AI_EVIDENCE_VALIDATION_ERROR";
      throw error;
    }
    return { ...match, interpretation: String(item.interpretation || match.interpretation) };
  });
}

function buildScenarioEvidence(comparison = {}, proposal = {}) {
  const timestamp = new Date().toISOString();
  const items = [];
  const add = (payload) => {
    const item = createPortfolioEvidenceItem(payload);
    if (item) items.push(item);
  };
  Object.entries(comparison.changes || {}).forEach(([metricName, metricValue]) => add({
    sourceType: "PORTFOLIO_SIMULATION",
    sourceId: proposal.title || "portfolio-scenario",
    metricName,
    metricValue,
    timestamp,
    interpretation: `Deterministic ${comparison.method || "snapshot"} current-to-proposed change for ${metricName}.`,
    strength: comparison.inputValidity === "CURRENT" ? "HIGH" : "MEDIUM",
  }));
  add({
    sourceType: "PORTFOLIO_SIMULATION",
    sourceId: proposal.title || "portfolio-scenario",
    metricName: "TurnoverPct",
    metricValue: comparison.turnoverPct,
    timestamp,
    interpretation: "Deterministic traded-notional estimate as a percentage of current equity.",
    strength: "HIGH",
  });
  add({
    sourceType: "TRANSACTION_COST_ESTIMATE",
    sourceId: proposal.title || "portfolio-scenario",
    metricName: "EstimatedTotalCost",
    metricValue: comparison.transactionCosts?.estimatedTotal,
    timestamp,
    interpretation: "Estimated costs using disclosed platform stress assumptions; not a broker quote.",
    strength: "LOW",
  });
  ["current", "proposed"].forEach((variant) => {
    const simulation = comparison.historicalSimulation?.[variant];
    if (!simulation?.metrics) return;
    Object.entries(simulation.metrics).forEach(([metricName, metricValue]) => add({
      sourceType: "PORTFOLIO_SIMULATION",
      sourceId: `${simulation.generatedAt || proposal.title}:${variant}`,
      metricName: `${variant}.${metricName}`,
      metricValue,
      timestamp: simulation.generatedAt || timestamp,
      interpretation: `Existing deterministic ${variant} strategy portfolio simulation metric: ${metricName}.`,
      strength: "MEDIUM",
    }));
  });
  return items;
}

module.exports = {
  PORTFOLIO_EVIDENCE_SOURCE_TYPES,
  buildPortfolioEvidence,
  buildScenarioEvidence,
  createPortfolioEvidenceItem,
  normalizePortfolioEvidenceReferences,
};
