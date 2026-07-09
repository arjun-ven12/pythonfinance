// Loads settings from .env

// Loads settings from .env
require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { assertSafeRuntime } = require("./config/runtimeGuard");
const { authMiddleware } = require("./middleware/authMiddleware");
const {
  PAGE_KEYS,
  USER_ROLES,
  blockDemoMutation,
  requirePageAccess,
  requireDemoAccess,
  requireRole,
  requireVerifiedUser,
} = require("./middleware/accessControl");
const {
  errorMiddleware,
  notFoundMiddleware,
} = require("./middleware/errorMiddleware");
const requestLogger = require("./middleware/requestLogger");
const dataSourceHeaders = require("./middleware/dataSourceHeaders");
const { createCsrfProtectionMiddleware } = require("./middleware/csrfMiddleware");
const {
  browserSecurityHeaders,
  createCorsMiddleware,
  createHelmetMiddleware,
  securityDiagnostics,
} = require("./middleware/securityMiddleware");
const authRoutes = require("./features/auth/routes/auth.routes");
const createAiRouter = require("./features/ai/routes/ai.routes");
const createAdminRouter = require("./features/admin/routes/admin.routes");
const createNotificationsRouter = require("./features/alerts/routes/alerts.routes");
const alertDeliveryService = require("./services/alertDeliveryService");
const createProposedTradesRouter = require("./features/proposedTrades/routes/proposedTrades.routes");
const createScansRouter = require("./features/scanner/routes/scanner.routes");
const validationRoutes = require("./features/validation/routes/validation.routes");
const createApprovalsRouter = require("./features/approvals/routes/approvals.routes");
const createBrokerRouter = require("./features/broker/routes/broker.routes");
const createDemoRouter = require("./features/demo/routes/demo.routes");
const createIbkrService = require("./features/broker/services/ibkr.service");
const createIbkrAdapter = require("./features/broker/adapters/ibkrAdapter");
const createMoomooAdapter = require("./features/broker/adapters/moomoo/moomooAdapter");
const createBrokerService = require("./features/broker/services/broker/broker.service");
const {
  createBrokerAdapterRegistry,
} = require("./features/broker/services/brokerAdapterRegistry.service");
const {
  createBrokerSecretService,
} = require("./features/broker/services/brokerSecret.service");
const createBrokerConnectionLogRepository = require("./features/broker/repositories/brokerConnectionLog.repository");
const createBrokerOrdersRepository = require("./features/broker/repositories/brokerOrders.repository");
const createBrokerPaperExecutionService = require("./features/broker/services/brokerPaperExecution.service");
const createBrokerConfigService = require("./features/broker/services/brokerConfig.service");
const createBrokerExecutionAuditRepository = require("./features/execution/repositories/brokerExecutionAudit.repository");
const {
  createLiveExecutionGuardService,
  normalizeBrokerExecutionMode,
} = require("./features/execution/services/liveExecutionGuard.service");
const createEngineRouter = require("./features/engine/routes/engine.routes");
const createMarketDataRouter = require("./features/marketData/routes/marketData.routes");
const createChartDataService = require("./features/marketData/services/chartData.service");
const createMarketDataService = require("./features/marketData/services/marketData.service");
const createMarketDataHubService = require("./features/marketData/services/marketDataHub.service");
const createPaperExecutionRouter = require("./features/paperExecution/routes/paperExecution.routes");
const createPaperExecutionService = require("./features/paperExecution/services/paperExecution.service");
const createPortfolioRouter = require("./features/portfolio/routes/portfolio.routes");
const createPlaybookRouter = require("./features/playbook/routes/playbook.routes");
const createPlaybookSourceService = require("./features/playbook/services/playbookSource.service");
const createPreTradeRouter = require("./features/preTrade/routes/preTrade.routes");
const createPreTradeService = require("./features/preTrade/services/preTrade.service");
const createSettingsRouter = require("./features/settings/routes/settings.routes");
const createStockUniversesRouter = require("./features/stockUniverses/routes/stockUniverses.routes");
const createStrategyLabRouter = require("./features/strategyLab/routes/strategyLab.routes");
const createStrategyLabService = require("./features/strategyLab/services/strategyLab.service");
const {
  createStrategyStorageService,
} = require("./features/strategyLab/services/strategyStorage.service");
const {
  activateStrategyVersion,
  assignStrategyToActiveSet,
  computeLifecycleReadiness,
  deactivateStrategyDeployment,
  getActiveSetState,
  getStrategyLifecycleDashboard,
  getStrategyLifecycleEvidence,
  getStrategyValidationAggregate,
  removeStrategyFromActiveSet,
  resolveCanonicalDeploymentState,
  statusFromReadiness,
} = require("./features/strategyLab/services/strategyLifecycleService");
const {
  createStrategyAllocationService,
} = require("./features/strategyLab/services/strategyAllocationService");
const createSystemRouter = require("./features/system/routes/system.routes");
const createRuntimeDiagnosticsService = require("./features/system/services/runtimeDiagnostics.service");
const createTradesService = require("./features/trades/services/trades.service");
const createTradingRouter = require("./features/trading/routes/trading.routes");
const createTradingSessionService = require("./features/trading/services/tradingSession.service");
const createScannerReadService = require("./features/scanner/services/scannerRead.service");
const { createAdminService } = require("./features/admin/services/admin.service");
const createApprovalRecordsService = require("./features/approvals/services/approvalRecords.service");
const createProposedTradesService = require("./features/proposedTrades/services/proposedTrades.service");
const createEngineRuntimeService = require("./features/engine/services/engineRuntime.service");
const createStockUniversesService = require("./features/stockUniverses/services/stockUniverses.service");
const createTradesRouter = require("./features/trades/routes/trades.routes");
const createWatchlistRouter = require("./features/watchlist/routes/watchlist.routes");
const proposedTradeRepository = require("./repositories/proposedTradeRepository");
const { requireUserId } = require("./repositories/ownership");
const watchlistRepository = require("./repositories/watchlistRepository");
const tradeRepository = require("./repositories/tradeRepository");
const settingsRepository = require("./repositories/settingsRepository");
const alertRepository = require("./repositories/alertRepository");
const prisma = require("./services/prisma");
const {
  encryptionDiagnostics,
  validateEncryptionConfiguration,
} = require("./services/encryptionService");
const { createAiRateLimiter } = require("./middleware/aiRateLimit");
const { createAIService } = require("./services/ai/AIService");
const {
  withJsonFallback,
  withPrismaSource,
} = require("./services/dataSource");
const { saveScanResultsToDatabase } = require("./services/scanRepository");
const {
  persistCompletedScan,
} = require("./services/scanPersistenceService");
const {
  compareVersions,
  convertRecommendationToDraft,
  createPlaybook,
  createPlaybookSnapshot,
  createVersion,
  exportPlaybook,
  generateAiPlaybookRecommendation,
  getPlaybookDashboard,
  getSnapshot,
  listPlaybooks,
  promoteVersion,
  recordPlaybookExport,
  rebuildEvidence,
  restoreVersion,
  reviewRecommendation,
  syncPlaybook,
} = require("./services/versionedPlaybookService");
const {
  persistValidationSignalsFromScanResults,
} = require("./services/validationService");
const {
  appendAuditEvent,
  requireApprovedApprovalForExecution,
  transitionApprovalRequest,
} = require("./services/approvalService");
const { getSystemDataHealth } = require("./services/systemDataHealth");
const {
  appendPaperExecution,
  estimateLedgerImpact,
  ensureLedgerInitialized,
  getPortfolioForUser,
  recordManualTrade,
  rebuildCaches,
  rebuildPortfolioFromLedger,
  syncLedgerFromBrokerAccount,
  verifyUserLedger,
} = require("./services/portfolioLedgerService");
const ledgerRepository = require("./repositories/transactionLedgerRepository");
const {
  getUserRuntimeDir,
} = require("./services/userRuntime");
const { createScanJobService } = require("./services/scanJobService");
const { normalizeExchange } = require("./services/marketMetadata");
const {
  appendOutput,
  getProcessFailureMessage,
  parseJsonOutput,
  parseScanArtifacts,
} = require("./services/processOutput");
const {
  allowedIntervals,
  getDefaultExecutionSettings,
  getDefaultMarketUniverseSettings,
  getExecutionSettingsFromRequest,
  getMarketUniverseSettingsFromRequest,
  getRiskMultiplier,
  getScanLimit,
  getTradingHorizon,
  normalizeExecutionMode,
} = require("./services/runtimeSettings");

const app = express();

try {
  assertSafeRuntime();
  validateEncryptionConfiguration();
} catch (error) {
  console.error(`[FATAL] Backend runtime validation failed: ${error.message}`);
  process.exit(1);
}

app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}
app.use(requestLogger);
app.use(createHelmetMiddleware());
app.use(browserSecurityHeaders);
app.post(
  "/api/security/csp-report",
  express.json({
    limit: "32kb",
    type: ["application/csp-report", "application/reports+json", "application/json"],
  }),
  (req, res) => {
    console.warn(
      JSON.stringify({
        type: "csp_violation",
        requestId: req.requestId || null,
        report: req.body || null,
      })
    );
    res.status(204).end();
  }
);
app.use(createCorsMiddleware());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(dataSourceHeaders);
app.use(createCsrfProtectionMiddleware());

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const projectRoot = path.join(__dirname, "..");
const pythonEngineDir = path.join(projectRoot, "python-engine");
const dotVenvPythonPath = path.join(pythonEngineDir, ".venv", "bin", "python");
const venvPythonPath = path.join(pythonEngineDir, "venv", "bin", "python");
const scannerPath = path.join(pythonEngineDir, "scanner.py");
const paperExecutionPath = path.join(pythonEngineDir, "paper_execution.py");
const preTradeAnalyzerPath = path.join(pythonEngineDir, "pre_trade_analyzer.py");
const ibkrConnectionTestPath = path.join(pythonEngineDir, "ibkr_connection_test.py");
const ibkrBrokerActionPath = path.join(pythonEngineDir, "ibkr_broker_action.py");
const schedulerControllers = new Map();
const scanJobService = createScanJobService({ prisma });
const adminService = createAdminService({ prisma });
const aiService = createAIService();
const aiRateLimiter = createAiRateLimiter();
const strategyStorage = createStrategyStorageService();

function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ratio(value, denominator) {
  if (!denominator || denominator <= 0) {
    return 0;
  }

  return Number((value / denominator).toFixed(4));
}

function normalizePositions(positions) {
  const iterable = Array.isArray(positions)
    ? positions
    : Object.values(positions || {});

  return iterable.map((position) => {
    const quantity = toNumber(position.quantity);
    const lastPrice = toNumber(
      position.last_price ??
        position.lastPrice ??
        position.market_price ??
        position.avg_price ??
        position.entry_price ??
        position.price
    );
    const avgPrice = toNumber(
      position.avg_price ?? position.average_price ?? position.entry_price ?? lastPrice
    );
    const notional = Math.abs(
      toNumber(position.notional ?? position.market_value, quantity * lastPrice)
    );

    return {
      ...position,
      symbol: String(position.symbol || "").toUpperCase(),
      quantity,
      last_price: lastPrice,
      avg_price: avgPrice,
      notional,
      sector: position.sector || null,
    };
  });
}

function getPortfolioEquity(portfolio) {
  const positions = normalizePositions(portfolio.positions);
  const positionsValue = positions.reduce((sum, position) => sum + position.notional, 0);

  return toNumber(
    portfolio.equity ??
      portfolio.portfolio_value ??
      portfolio.account_value ??
      portfolio.total_equity ??
      portfolio.net_liquidation,
    toNumber(portfolio.cash) + positionsValue || 100000
  );
}

function getOpportunityBySymbol(scanResults) {
  return (scanResults.opportunities || []).reduce((acc, opportunity) => {
    if (opportunity.symbol) {
      acc[String(opportunity.symbol).toUpperCase()] = opportunity;
    }

    return acc;
  }, {});
}

function getOrderStop(order) {
  return toNumber(order.stop_loss ?? order.stopLoss ?? order.stop);
}

function getOrderEntry(order) {
  return toNumber(
    order.entry_price ?? order.entryPrice ?? order.current_price ?? order.price
  );
}

function getOrderQuantity(order) {
  return toNumber(order.quantity);
}

function getPositionStop(position, proposedBySymbol, opportunityBySymbol) {
  const symbol = String(position.symbol || "").toUpperCase();
  const proposedStop = getOrderStop(proposedBySymbol[symbol] || {});

  if (proposedStop > 0) {
    return proposedStop;
  }

  return toNumber(
    opportunityBySymbol[symbol]?.portfolio_fit?.stop_loss_risk?.stop_loss ??
      opportunityBySymbol[symbol]?.stop_loss
  );
}

function getPositionSector(position, opportunityBySymbol) {
  return (
    position.sector ||
    opportunityBySymbol[String(position.symbol || "").toUpperCase()]?.sector ||
    "UNKNOWN"
  );
}

function buildRiskDashboard({
  portfolio = {},
  paperTrades = { trades: [] },
  proposedOrders = { orders: [] },
  safetyStatus = {},
  scanResults = { opportunities: [] },
} = {}) {
  const opportunitiesBySymbol = getOpportunityBySymbol(scanResults);
  const proposedBySymbol = (proposedOrders.orders || []).reduce((acc, order) => {
    if (order.symbol) {
      acc[String(order.symbol).toUpperCase()] = order;
    }

    return acc;
  }, {});
  const positions = normalizePositions(portfolio.positions).map((position) => {
    const stopLoss = getPositionStop(position, proposedBySymbol, opportunitiesBySymbol);
    const stopRisk =
      stopLoss > 0
        ? Math.max(0, (position.last_price - stopLoss) * Math.abs(position.quantity))
        : 0;
    const sector = getPositionSector(position, opportunitiesBySymbol);

    return {
      symbol: position.symbol,
      quantity: position.quantity,
      avg_price: position.avg_price,
      last_price: position.last_price,
      notional: Number(position.notional.toFixed(2)),
      sector,
      stop_loss: stopLoss || null,
      risk_at_stop: Number(stopRisk.toFixed(2)),
    };
  });
  const equity = getPortfolioEquity(portfolio);
  const cash = toNumber(portfolio.cash);
  const totalExposure = positions.reduce((sum, position) => sum + position.notional, 0);
  const openRiskAtStop = positions.reduce(
    (sum, position) => sum + position.risk_at_stop,
    0
  );
  const largestPosition = positions.reduce(
    (largest, position) => Math.max(largest, position.notional),
    0
  );
  const sectorExposure = positions.reduce((acc, position) => {
    acc[position.sector] = acc[position.sector] || {
      sector: position.sector,
      notional: 0,
      pct: 0,
      positions: 0,
    };
    acc[position.sector].notional += position.notional;
    acc[position.sector].positions += 1;
    return acc;
  }, {});

  Object.values(sectorExposure).forEach((sector) => {
    sector.notional = Number(sector.notional.toFixed(2));
    sector.pct = ratio(sector.notional, equity);
  });

  const limits = safetyStatus.limits || {};
  const checks = safetyStatus.checks || {};
  const dailyLimitPct = toNumber(limits.max_daily_loss_pct);
  const weeklyLimitPct = toNumber(
    limits.max_weekly_loss_pct ?? limits.max_weekly_drawdown_pct
  );
  const dailyUsedPct = toNumber(checks.daily_loss_pct);
  const weeklyUsedPct = toNumber(checks.weekly_loss_pct ?? checks.weekly_drawdown_pct);
  const dailyBudget = equity * dailyLimitPct;
  const weeklyBudget = equity * weeklyLimitPct;
  const dailyUsed = equity * dailyUsedPct;
  const weeklyUsed = equity * weeklyUsedPct;
  const proposedRisk = (proposedOrders.orders || []).map((order) => {
    const quantity = getOrderQuantity(order);
    const entry = getOrderEntry(order);
    const stop = getOrderStop(order);
    const side = String(order.side || "BUY").toUpperCase();
    const riskAmount =
      stop > 0
        ? Math.max(0, (side === "SELL" ? stop - entry : entry - stop) * quantity)
        : toNumber(order.risk_amount);
    const riskPct = ratio(riskAmount, equity);
    const route = order.execution_route?.route || proposedOrders.mode || "PROPOSED";
    const isHighRisk =
      riskPct >= 0.01 ||
      ["BLOCKED", "REJECT", "WAIT", "REDUCE_SIZE"].includes(route) ||
      order.execution_route?.risk_level === "HIGH";

    return {
      symbol: order.symbol,
      side,
      quantity,
      entry_price: entry,
      stop_loss: stop || null,
      notional: Number((entry * quantity).toFixed(2)),
      risk_amount: Number(riskAmount.toFixed(2)),
      risk_pct: riskPct,
      route,
      is_high_risk: isHighRisk,
      reason: order.reason || order.execution_route?.reason || "",
    };
  });

  return {
    generated_at: new Date().toISOString(),
    portfolio: {
      equity: Number(equity.toFixed(2)),
      cash: Number(cash.toFixed(2)),
      cash_pct: ratio(cash, equity),
      invested_pct: ratio(totalExposure, equity),
      open_positions_count: positions.length,
      total_exposure: Number(totalExposure.toFixed(2)),
      total_exposure_pct: ratio(totalExposure, equity),
      largest_position_pct: ratio(largestPosition, equity),
    },
    risk: {
      open_risk_at_stop: Number(openRiskAtStop.toFixed(2)),
      open_risk_pct_of_equity: ratio(openRiskAtStop, equity),
      max_loss_if_all_stops_hit: Number(openRiskAtStop.toFixed(2)),
      daily_loss_budget_remaining: Number(Math.max(0, dailyBudget - dailyUsed).toFixed(2)),
      daily_loss_budget_remaining_pct: Math.max(0, dailyLimitPct - dailyUsedPct),
      daily_loss_usage_pct: dailyLimitPct ? ratio(dailyUsedPct, dailyLimitPct) : 0,
      weekly_loss_budget_remaining: Number(
        Math.max(0, weeklyBudget - weeklyUsed).toFixed(2)
      ),
      weekly_loss_budget_remaining_pct: Math.max(0, weeklyLimitPct - weeklyUsedPct),
      weekly_loss_usage_pct: weeklyLimitPct ? ratio(weeklyUsedPct, weeklyLimitPct) : 0,
      high_risk_proposed_orders_count: proposedRisk.filter((order) => order.is_high_risk)
        .length,
    },
    limits: {
      max_daily_loss_pct: dailyLimitPct,
      max_weekly_loss_pct: weeklyLimitPct,
      max_total_portfolio_exposure_pct: toNumber(
        limits.max_total_portfolio_exposure_pct,
        0.8
      ),
      max_sector_exposure_pct: toNumber(limits.max_sector_exposure_pct, 0.3),
      max_position_size_pct: toNumber(limits.max_position_size_pct, 0.1),
    },
    gauges: {
      exposure_usage: ratio(
        ratio(totalExposure, equity),
        toNumber(limits.max_total_portfolio_exposure_pct, 0.8)
      ),
      daily_loss_usage: dailyLimitPct ? ratio(dailyUsedPct, dailyLimitPct) : 0,
      weekly_loss_usage: weeklyLimitPct ? ratio(weeklyUsedPct, weeklyLimitPct) : 0,
      max_sector_concentration:
        Math.max(0, ...Object.values(sectorExposure).map((sector) => sector.pct)) /
        Math.max(0.0001, toNumber(limits.max_sector_exposure_pct, 0.3)),
    },
    open_positions_risk: positions,
    proposed_orders_risk: proposedRisk,
    sector_exposure: Object.values(sectorExposure).sort((a, b) => b.pct - a.pct),
    safety_violations: safetyStatus.violations || [],
    paper_trades_count: (paperTrades.trades || []).length,
    sources: {
      paper_portfolio: Boolean(portfolio.generated_at),
      paper_trades: Boolean(paperTrades.generated_at),
      proposed_orders: Boolean(proposedOrders.generated_at),
      safety_status: Boolean(safetyStatus.generated_at),
      scan_results: Boolean(scanResults.generated_at),
    },
  };
}

async function buildRiskDashboardFromDatabase(userId) {
  const [portfolioResult, paperTrades, proposedOrders, safetyStatus, scanResults] =
    await Promise.all([
      getPortfolioForUser(userId),
      prisma.run((db) =>
        db.paperTrade.findMany({
          where: { userId },
          orderBy: { filledAt: "desc" },
          take: 500,
        })
      ),
      readProposedOrdersForApi(userId),
      readUserSafetyStatus(userId),
      readScanResultsWithHistory(userId),
    ]);

  return buildRiskDashboard({
    portfolio: portfolioResult.ledgerState,
    paperTrades: { trades: paperTrades },
    proposedOrders,
    safetyStatus,
    scanResults,
  });
}

function buildRecommendation(type, title, severity, affectedSymbols, explanation, recommendedAction) {
  return {
    type,
    title,
    severity,
    affected_symbols: affectedSymbols,
    explanation,
    recommended_action: recommendedAction,
  };
}

function buildPortfolioConstruction(riskDashboard) {
  const portfolio = riskDashboard.portfolio || {};
  const risk = riskDashboard.risk || {};
  const limits = riskDashboard.limits || {};
  const positions = riskDashboard.open_positions_risk || [];
  const sectors = riskDashboard.sector_exposure || [];
  const proposedOrders = riskDashboard.proposed_orders_risk || [];
  const safetyViolations = riskDashboard.safety_violations || [];
  const equity = toNumber(portfolio.equity, 100000);
  const cash = toNumber(portfolio.cash);
  const cashPct = ratio(cash, equity);
  const investedPct = toNumber(portfolio.invested_pct);
  const maxPositionPct = toNumber(limits.max_position_size_pct, 0.1);
  const maxSectorPct = toNumber(limits.max_sector_exposure_pct, 0.3);
  const maxExposurePct = toNumber(limits.max_total_portfolio_exposure_pct, 0.8);
  const openRiskPct = toNumber(risk.open_risk_pct_of_equity);
  const largestPositionPct = toNumber(portfolio.largest_position_pct);
  const largestSectorPct = Math.max(0, ...sectors.map((sector) => toNumber(sector.pct)));
  const largestPosition = positions.reduce(
    (largest, position) =>
      toNumber(position.notional) > toNumber(largest?.notional)
        ? position
        : largest,
    null
  );
  const largestSector = sectors.find((sector) => toNumber(sector.pct) === largestSectorPct);
  const positionWeights = positions.map((position) => ({
    symbol: position.symbol,
    sector: position.sector || "UNKNOWN",
    notional: toNumber(position.notional),
    weight_pct: ratio(toNumber(position.notional), equity),
    risk_at_stop: toNumber(position.risk_at_stop),
    risk_pct: ratio(toNumber(position.risk_at_stop), equity),
  }));
  const sectorWeights = sectors.map((sector) => ({
    sector: sector.sector,
    notional: toNumber(sector.notional),
    weight_pct: toNumber(sector.pct),
    positions: sector.positions || 0,
  }));
  const concentrationWarnings = [];
  const correlatedExposureWarnings = [];
  const recommendations = [];

  positionWeights
    .filter((position) => position.weight_pct > maxPositionPct)
    .forEach((position) => {
      concentrationWarnings.push({
        type: "POSITION_CONCENTRATION",
        severity: position.weight_pct > maxPositionPct * 1.5 ? "HIGH" : "MEDIUM",
        symbol: position.symbol,
        current_pct: position.weight_pct,
        limit_pct: maxPositionPct,
      });
      recommendations.push(
        buildRecommendation(
          "REDUCE_POSITION",
          `Reduce ${position.symbol} concentration`,
          position.weight_pct > maxPositionPct * 1.5 ? "HIGH" : "MEDIUM",
          [position.symbol],
          `${position.symbol} is ${(position.weight_pct * 100).toFixed(2)}% of equity, above the ${(maxPositionPct * 100).toFixed(2)}% position limit.`,
          "Trim the position or avoid adding until its weight returns inside the limit."
        )
      );
    });

  sectorWeights
    .filter((sector) => sector.positions > 1)
    .forEach((sector) => {
      const affectedSymbols = positions
        .filter((position) => position.sector === sector.sector)
        .map((position) => position.symbol);
      const severity =
        sector.weight_pct > maxSectorPct
          ? sector.weight_pct > maxSectorPct * 1.5
            ? "HIGH"
            : "MEDIUM"
          : sector.weight_pct > maxSectorPct * 0.67
            ? "MEDIUM"
            : "LOW";

      correlatedExposureWarnings.push({
        type: "SAME_SECTOR_CORRELATION",
        severity,
        sector: sector.sector,
        current_pct: sector.weight_pct,
        explanation: `${sector.positions} positions share ${sector.sector} exposure.`,
        affected_symbols: affectedSymbols,
      });

      if (sector.weight_pct <= maxSectorPct) {
        return;
      }

      concentrationWarnings.push({
        type: "SECTOR_CONCENTRATION",
        severity,
        sector: sector.sector,
        current_pct: sector.weight_pct,
        limit_pct: maxSectorPct,
        affected_symbols: affectedSymbols,
      });
      recommendations.push(
        buildRecommendation(
          "DIVERSIFY",
          `Diversify ${sector.sector} exposure`,
          severity,
          affectedSymbols,
          `${sector.sector} is ${(sector.weight_pct * 100).toFixed(2)}% of equity, above the ${(maxSectorPct * 100).toFixed(2)}% sector limit.`,
          "Prioritize other sectors or reduce same-sector exposure before adding new positions."
        )
      );
    });

  if (safetyViolations.length > 0 || openRiskPct >= 0.03) {
    recommendations.push(
      buildRecommendation(
        "BLOCK_NEW_TRADE",
        "Block new risk until safety improves",
        safetyViolations.length > 0 || openRiskPct >= 0.05 ? "HIGH" : "MEDIUM",
        [],
        safetyViolations.length > 0
          ? `Active safety violations: ${safetyViolations.join(", ")}.`
          : `Open risk is ${(openRiskPct * 100).toFixed(2)}% of equity.`,
        "Do not add new trades until violations clear or open stop risk declines."
      )
    );
  }

  proposedOrders
    .filter((order) => order.is_high_risk || toNumber(order.risk_pct) >= 0.01)
    .forEach((order) => {
      recommendations.push(
        buildRecommendation(
          "REDUCE_SIZE",
          `Reduce ${order.symbol} proposed order size`,
          order.is_high_risk ? "HIGH" : "MEDIUM",
          [order.symbol],
          `${order.symbol} proposed risk is ${(toNumber(order.risk_pct) * 100).toFixed(2)}% of equity.`,
          "Lower quantity or widen safety review before paper execution."
        )
      );
    });

  if (cashPct >= 0.35 && recommendations.length === 0) {
    recommendations.push(
      buildRecommendation(
        "HOLD_CASH",
        "Maintain high cash reserve",
        "LOW",
        [],
        `Cash is ${(cashPct * 100).toFixed(2)}% of equity, leaving dry powder available.`,
        "Deploy selectively only into high-confidence opportunities that pass safety checks."
      )
    );
  }

  if (
    recommendations.length === 0 &&
    investedPct < maxExposurePct &&
    openRiskPct < 0.03
  ) {
    recommendations.push(
      buildRecommendation(
        "ALLOW_TRADE",
        "Portfolio can accept selective new risk",
        "LOW",
        proposedOrders.map((order) => order.symbol).filter(Boolean),
        "Exposure, concentration, and open stop risk are inside current dashboard limits.",
        "Allow trades that pass pre-trade analysis, safety checks, and approval workflow."
      )
    );
  }

  const availableCapitalToDeploy = Math.max(
    0,
    Math.min(cash, equity * Math.max(0, maxExposurePct - investedPct))
  );
  const healthPenalty =
    concentrationWarnings.length * 12 +
    correlatedExposureWarnings.length * 8 +
    safetyViolations.length * 18 +
    Math.min(25, openRiskPct * 500) +
    Math.max(0, investedPct - maxExposurePct) * 100;
  const portfolioHealthScore = Math.max(0, Math.min(100, Math.round(100 - healthPenalty)));

  return {
    generated_at: new Date().toISOString(),
    portfolio: {
      equity: Number(equity.toFixed(2)),
      cash: Number(cash.toFixed(2)),
      cash_pct: cashPct,
      invested_pct: investedPct,
      available_capital_to_deploy: Number(availableCapitalToDeploy.toFixed(2)),
      portfolio_health_score: portfolioHealthScore,
    },
    weights: {
      positions: positionWeights,
      sectors: sectorWeights,
      largest_position_pct: largestPositionPct,
      largest_position_symbol: largestPosition?.symbol || null,
      largest_sector_pct: largestSectorPct,
      largest_sector: largestSector?.sector || null,
    },
    risk: {
      open_risk_pct: openRiskPct,
      open_risk_at_stop: toNumber(risk.open_risk_at_stop),
      max_loss_if_all_stops_hit: toNumber(risk.max_loss_if_all_stops_hit),
      safety_violations: safetyViolations,
    },
    suggested_limits: {
      max_position_size_pct: maxPositionPct,
      max_sector_size_pct: maxSectorPct,
      max_total_exposure_pct: maxExposurePct,
      max_position_size_dollars: Number((equity * maxPositionPct).toFixed(2)),
      max_sector_size_dollars: Number((equity * maxSectorPct).toFixed(2)),
    },
    warnings: {
      concentration: concentrationWarnings,
      correlated_exposure: correlatedExposureWarnings,
    },
    recommendations,
    sources: riskDashboard.sources,
  };
}

async function readUserSetting(userId, key, fallback) {
  const setting = await settingsRepository.read(userId, key);

  return setting?.value ?? fallback;
}

async function writeUserSetting(userId, key, value) {
  return settingsRepository.write(userId, key, value);
}

function normalizeAlertForApi(alert) {
  return {
    ...(alert.raw || {}),
    id: alert.id,
    scan_id: alert.scanId,
    category: alert.category,
    severity: alert.severity,
    status: alert.status,
    source: alert.source,
    symbol: alert.symbol,
    title: alert.title,
    message: alert.message,
    score: alert.score,
    opportunity_score: alert.score,
    confidence: alert.confidence,
    backtest_return: alert.backtestReturn,
    drawdown: alert.drawdown,
    reasons: alert.reasons || [],
    metadata: alert.metadata || {},
    occurrences: alert.occurrences || 1,
    last_triggered_at: alert.lastTriggeredAt,
    generated_at: alert.generatedAt,
    created_at: alert.createdAt,
    updated_at: alert.updatedAt,
    expires_at: alert.expiresAt,
    acknowledged_at: alert.acknowledgedAt,
    snoozed_until: alert.snoozedUntil,
    resolved_at: alert.resolvedAt,
    actioned_by: alert.actionedBy,
    action_reason: alert.actionReason,
    sent_at: alert.sentAt,
    channel: alert.channel,
  };
}

function buildAlertSummary(alerts) {
  const summary = {
    active: 0,
    critical: 0,
    acknowledged: 0,
    snoozed: 0,
    resolved: 0,
  };

  for (const alert of alerts) {
    const key = String(alert.status || "").toLowerCase();
    if (key && summary[key] !== undefined) {
      summary[key] += 1;
    }
    if (alert.severity === "CRITICAL") {
      summary.critical += 1;
    }
  }

  return summary;
}

function buildAlertDigest(alerts) {
  const scannerBuyAlerts = alerts.filter(
    (alert) => alert.category === "SCANNER" && alert.status === "ACTIVE"
  );
  if (scannerBuyAlerts.length < 5) {
    return [];
  }

  return [{
    id: "scanner-buy-digest",
    category: "SCANNER",
    severity: scannerBuyAlerts.some((alert) => alert.severity === "CRITICAL")
      ? "CRITICAL"
      : "HIGH",
    status: "ACTIVE",
    title: `${scannerBuyAlerts.length} high-confidence scanner alerts`,
    message: "Review the top scanner setups instead of handling each alert separately.",
    symbols: scannerBuyAlerts.slice(0, 15).map((alert) => alert.symbol),
    count: scannerBuyAlerts.length,
  }];
}

async function readAlertsForApi(userId, options = {}) {
  try {
    const alerts = await alertRepository.list(userId, {
      status: options.status,
      category: options.category,
      includeResolved: options.includeResolved === "true",
      limit: options.limit,
    });
    const mutedCategories = await alertRepository.getMutedCategories(userId);
    const visibleAlerts = alerts.filter(
      (alert) => !mutedCategories.includes(alert.category)
    );
    const health = await alertRepository.getHealth(userId);

    return withPrismaSource({
      generated_at: alerts[0]?.lastTriggeredAt || alerts[0]?.generatedAt || null,
      summary: buildAlertSummary(alerts),
      digest: buildAlertDigest(visibleAlerts),
      muted_categories: mutedCategories,
      health,
      alerts: visibleAlerts.map(normalizeAlertForApi),
    });
  } catch (error) {
    console.error(`Alert database read failed: ${error.message}`);
    return withJsonFallback({ generated_at: null, alerts: [] }, error);
  }
}

function getPythonPath() {
  if (fs.existsSync(dotVenvPythonPath)) {
    return dotVenvPythonPath;
  }

  return fs.existsSync(venvPythonPath) ? venvPythonPath : "python3";
}

const {
  buildIbkrConfig,
  getIbkrStatus,
  normalizeIbkrMode,
  readUserIbkrConfig,
  runIbkrBrokerAction,
  runIbkrConnectionTest,
  writeUserIbkrConfig,
} = createIbkrService({
  appendOutput,
  getPythonPath,
  ibkrBrokerActionPath,
  ibkrConnectionTestPath,
  normalizeBrokerExecutionMode,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  spawn,
});
const brokerConnectionLogRepository = createBrokerConnectionLogRepository({ prisma });
const brokerConfigService = createBrokerConfigService({ prisma });
const brokerSecretService = createBrokerSecretService({ prisma });
const brokerOrdersRepository = createBrokerOrdersRepository({ prisma });
const brokerExecutionAuditRepository = createBrokerExecutionAuditRepository({ prisma });
const ibkrAdapter = createIbkrAdapter({
  buildIbkrConfig,
  getIbkrStatus,
  readUserIbkrConfig,
  runIbkrBrokerAction,
  runIbkrConnectionTest,
});
const moomooAdapter = createMoomooAdapter({});
const brokerAdapterRegistry = createBrokerAdapterRegistry({
  adapters: {
    IBKR: ibkrAdapter,
    MOOMOO: moomooAdapter,
  },
  prisma,
});

const {
  getChartPeriod,
  runChartData,
} = createChartDataService({
  appendOutput,
  getPythonPath,
  parseJsonOutput,
  pythonEngineDir,
  spawn,
});

const {
  buildDataHealth,
  computeSignalChanges,
  normalizeRawOpportunity,
  normalizeScanMetadata,
  normalizeStoredOpportunity,
  readScanResultsWithHistory,
  storedScanWithOpportunitiesSelect,
} = createScannerReadService({
  crypto,
  normalizeExchange,
  persistValidationSignalsFromScanResults,
  prisma,
  readEngineStatus: (userId) => readEngineStatus(userId),
  saveScanResultsToDatabase,
  scanJobService,
  withJsonFallback,
  withPrismaSource,
});

const {
  getMetrics: getMarketDataMetrics,
  getPriceHistory,
  getProviderHealth,
  getQuote,
  getQuotes,
  metricsService: marketDataMetricsService,
  start: startMarketDataService,
  stop: stopMarketDataService,
} = createMarketDataService({
  appendOutput,
  brokerAdapterRegistry,
  getPythonPath,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  readResolvedBrokerConfigForUser: (userId, providerOverride = null) =>
    brokerConfigService.readResolvedBrokerConfig(userId, providerOverride),
  readScanResultsWithHistory,
  spawn,
});

const {
  addStockUniverseMembers,
  createStockUniverse,
  deleteStockUniverse,
  getBacktestSymbols,
  getRequestedScanSymbols,
  getStockUniverseById,
  listStockUniverses,
  removeStockUniverseMember,
  resolveBacktestUniversePayload,
  updateStockUniverse,
  validateSymbol,
} = createStockUniversesService({
  appendOutput,
  getPythonPath,
  normalizeStoredOpportunity,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  requireUserId,
  spawn,
  storedScanWithOpportunitiesSelect,
  watchlistRepository,
});

const {
  buildApprovalRequestData,
  buildApprovalTradeEditData,
  createApprovalRequestRecord,
  getApprovalRequestById,
  getDecisionNote,
  getRequestOrderPayload,
  listApprovalRequests,
  normalizeApprovalMode,
  updateApprovalRequestRecord,
} = createApprovalRecordsService({
  ledgerRepository,
  normalizeExecutionMode,
  prisma,
  requireUserId,
  validateSymbol,
});

const {
  getActiveApprovalForOrder,
  getProposedTradeById,
  persistProposedTradeEditFromApproval,
  proposedTradeToOrder,
  readProposedOrdersForApi,
  syncApprovalRequestsFromProposedOrders,
  syncProposedTradesFromJson,
  updateProposedTrade,
} = createProposedTradesService({
  buildApprovalRequestData,
  createApprovalRequestRecord,
  getOrderEntry,
  getOrderQuantity,
  getOrderStop,
  normalizeApprovalMode,
  prisma,
  proposedTradeRepository,
  requireUserId,
  updateApprovalRequestRecord,
  validateSymbol,
  withJsonFallback,
  withPrismaSource,
});

const {
  getPlaybookSourceData,
  sendPlaybookExport,
} = createPlaybookSourceService({
  computeSignalChanges,
  exportPlaybook,
  getDefaultExecutionSettings,
  getPlaybookDashboard,
  getPortfolioForUser,
  listApprovalRequests,
  prisma,
  readAlertsForApi,
  readProposedOrdersForApi,
  readScanResultsWithHistory,
  readUserSetting,
  recordPlaybookExport,
  storedScanWithOpportunitiesSelect,
});

const {
  buildScannerStrategyConfig,
  parseSafetyPercent,
  readActiveStrategyConfig,
  readEngineStatus,
  readUserSafetyStatus,
  startScanJobForUser,
  startScheduler,
  stopUserScheduler,
  writeActiveStrategyConfig,
  writeEngineStatus,
  writeUserSafetyStatus,
} = createEngineRuntimeService({
  getDefaultExecutionSettings,
  getDefaultMarketUniverseSettings,
  getExecutionSettingsFromRequest,
  getMarketUniverseSettingsFromRequest,
  getPlaybookSourceData,
  getPortfolioForUser,
  getPythonPath,
  getRequestedScanSymbols,
  getRiskMultiplier,
  getScanLimit,
  getTradingHorizon,
  normalizeScanMetadata,
  parseScanArtifacts,
  persistCompletedScan,
  prisma,
  pythonEngineDir,
  readUserSetting,
  scanJobService,
  scannerPath,
  schedulerControllers,
  strategyStorage,
  syncPlaybook,
  writeUserSetting,
});

let brokerService = null;

const liveExecutionGuard = createLiveExecutionGuardService({
  auditRepository: brokerExecutionAuditRepository,
  getDefaultExecutionSettings,
  getBrokerCapabilities: async (userId) => {
    const resolved = await brokerConfigService.readResolvedBrokerConfig(userId);
    const adapter = await brokerAdapterRegistry.getAdapter(userId, resolved.provider);
    return adapter.getCapabilities(userId, {
      ...(resolved.config || {}),
      provider: resolved.provider,
      executionMode: resolved.executionMode,
    });
  },
  getBrokerHealth: async (userId) => {
    const resolved = await brokerConfigService.readResolvedBrokerConfig(userId);
    const adapter = await brokerAdapterRegistry.getAdapter(userId, resolved.provider);
    return adapter.getHealth(userId, {
      ...(resolved.config || {}),
      provider: resolved.provider,
      executionMode: resolved.executionMode,
    });
  },
  getBrokerReconciliation: async (userId) => {
    if (!brokerService) {
      throw new Error("Broker service is not initialized.");
    }
    return brokerService.getReconciliation(userId);
  },
  getRiskDashboard: buildRiskDashboardFromDatabase,
  prisma,
  readUserSafetyStatus,
  readUserSetting,
});
brokerService = createBrokerService({
  getAdapterForUser: (userId, providerOverride = null) =>
    brokerAdapterRegistry.getAdapter(userId, providerOverride),
  getProviderForUser: (userId) => brokerAdapterRegistry.getProvider(userId),
  readBrokerConfigForUser: (userId) => brokerConfigService.readBrokerConfig(userId),
  readResolvedBrokerConfigForUser: (userId, providerOverride = null) =>
    brokerConfigService.readResolvedBrokerConfig(userId, providerOverride),
  brokerConnectionLogRepository,
  brokerOrdersRepository,
  buildRiskDashboardFromDatabase,
  liveExecutionGuard,
});

const {
  buildExperimentBacktestConfig,
  buildStrategyComparisonMetrics,
  buildStrategyExperimentCreateData,
  buildStrategyExperimentUpdateData,
  buildStrategyRunData,
  computeDeploymentReadiness,
  createStrategyVersion,
  getStrategyLeaderboard,
  getStrategyMemory,
  getStrategyComparisonWinner,
  getStrategyExperimentId,
  persistMarketRegimeSnapshots,
  persistStrategyRunTrades,
  runBacktestLabConfigForSymbols,
  runBacktestParameterSweep,
  runMonteCarloStress,
  runParameterSweep,
  runRegimeAnalysis,
  runStrategyRobustness,
  runStrategyPreview,
  runMatrixReplay,
  runWalkForward,
  sanitizeBacktestConfig,
  simulateStrategyPortfolio,
} = createStrategyLabService({
  appendOutput,
  getBacktestSymbols,
  getProcessFailureMessage,
  getPythonPath,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  spawn,
  strategyStorage,
  validateSymbol,
});

const {
  getDeploymentAllocationDashboard,
  updateDeploymentAllocation,
} = createStrategyAllocationService({
  createStrategyVersion,
  getStrategyLifecycleDashboard,
  prisma,
  readActiveStrategyConfig,
  strategyStorage,
  writeActiveStrategyConfig,
});

const {
  persistPaperExecutionResult,
  runPaperOrder,
} = createPaperExecutionService({
  appendOutput,
  appendPaperExecution,
  ensureLedgerInitialized,
  getPortfolioForUser,
  getProcessFailureMessage,
  getPythonPath,
  parseJsonOutput,
  paperExecutionPath,
  prisma,
  pythonEngineDir,
  rebuildCaches,
  requireUserId,
  spawn,
});

const {
  runPreTradeAnalysis,
} = createPreTradeService({
  appendOutput,
  getDefaultExecutionSettings,
  getPortfolioForUser,
  getProcessFailureMessage,
  getPythonPath,
  getTradingHorizon,
  parseJsonOutput,
  preTradeAnalyzerPath,
  pythonEngineDir,
  readActiveStrategyConfig,
  readScanResultsWithHistory,
  readUserSafetyStatus,
  readUserSetting,
  requireUserId,
  spawn,
  validateSymbol,
});

const brokerPaperExecutionService = createBrokerPaperExecutionService({
  getAdapterForUser: (userId) => brokerAdapterRegistry.getAdapter(userId),
  brokerOrdersRepository,
  getApprovalRequestById,
  getRequestOrderPayload,
  invalidateBrokerAccountCache: (userId) =>
    brokerService.invalidateAccountSummaryCache(userId),
  readResolvedBrokerConfigForUser: (userId) =>
    brokerConfigService.readResolvedBrokerConfig(userId),
  liveExecutionGuard,
  persistPaperExecutionResult,
  prisma,
  runPreTradeAnalysis,
  updateApprovalRequestRecord,
});

const tradingSessionService = createTradingSessionService({
  brokerConfigService,
  brokerPaperExecutionService,
  brokerService,
  getPortfolioForUser,
  tradeRepository,
});

const {
  buildTrade,
} = createTradesService();

app.get("/", (req, res) => {
  res.json({ message: "Trading dashboard backend running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/demo", requireDemoAccess, blockDemoMutation, createDemoRouter());

// Login and registration are the only public API endpoints.
// Every API route mounted below this line requires a valid JWT.
app.use("/api", authMiddleware);
app.use("/api", requireVerifiedUser);

app.get(
  "/api/security/diagnostics",
  requireRole(USER_ROLES.LEVEL_3_OWNER_ADMIN),
  async (_req, res) => {
    const base = securityDiagnostics();
    const encryption = encryptionDiagnostics();
    const brokerSecretRows = await prisma.run((db) =>
      db.brokerSecret.findMany({
        select: {
          encryptedPayload: true,
        },
        take: 50,
      })
    );
    const telegramRows = await prisma.run((db) =>
      db.notificationChannel.findMany({
        select: {
          telegramBotToken: true,
          telegramChatId: true,
        },
        take: 50,
      })
    );

    res.json({
      cookieOnlyAuth: true,
      encryptionFailClosed: Boolean(encryption.failClosed),
      testRuntimeGuardEnabled: true,
      testRuntimeAllowed: base.testRuntimeAllowed,
      csrfEnabled: true,
      csrfSessionBound: true,
      csrfOriginCheckEnabled: true,
      encryptionKeyConfigured: Boolean(encryption.configured),
      brokerSecretsEncrypted: brokerSecretRows.every((row) =>
        String(row.encryptedPayload || "").startsWith("v1:")
      ),
      telegramSecretsEncrypted: telegramRows.every((row) =>
        [row.telegramBotToken, row.telegramChatId]
          .filter(Boolean)
          .every((value) => String(value).startsWith("v1:"))
      ),
      cspMode: base.cspMode,
      cspAllowsInlineStyles: base.cspAllowsInlineStyles,
      cspAllowsInlineScripts: base.cspAllowsInlineScripts,
      cspReportUri: base.cspReportUri,
      localStorageAuthHintsDisabled: true,
      localStorageTokenDisabled: true,
      productionCookieSecure: Boolean(base.cookies?.secure),
      hstsConfiguredByApp: base.hsts.configuredByApp,
      hstsMaxAge: base.hsts.maxAge,
      hstsIncludeSubDomains: base.hsts.includeSubDomains,
      hstsPreload: base.hsts.preload,
      hstsHandledByEdge: base.hsts.handledByEdge,
      redactionEnabled: true,
    });
  }
);

app.use("/api", createSystemRouter({
  runtimeDiagnosticsService: createRuntimeDiagnosticsService({
    getUserRuntimeDir,
    prisma,
  }),
}));

app.use("/api", requirePageAccess(PAGE_KEYS.SCANNER), createScansRouter({
  computeSignalChanges,
  normalizeRawOpportunity,
  normalizeStoredOpportunity,
  prisma,
  readScanResultsWithHistory,
  scanJobService,
  startScanJobForUser,
  storedScanSelect: storedScanWithOpportunitiesSelect,
  validateSymbol,
  withJsonFallback,
  withPrismaSource,
}));
app.use("/api/validation", requirePageAccess(PAGE_KEYS.VALIDATION), validationRoutes);
app.use("/api", requirePageAccess(PAGE_KEYS.ALERTS), createNotificationsRouter({
  alertDeliveryService,
  alertRepository,
  readAlertsForApi,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.APPROVALS), createProposedTradesRouter({
  proposedTradeToOrder,
  readProposedOrdersForApi,
  syncApprovalRequestsFromProposedOrders,
  syncProposedTradesFromJson,
  updateProposedTrade,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.PORTFOLIO), createPortfolioRouter({
  buildPortfolioConstruction,
  buildRiskDashboardFromDatabase,
  getPortfolioForUser,
  ledgerRepository,
  prisma,
  rebuildPortfolioFromLedger,
  syncProposedTradesFromJson,
  tradeRepository,
  withJsonFallback,
  verifyUserLedger,
  withPrismaSource,
}));
app.use("/api", createTradingRouter({
  tradingSessionService,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.APPROVALS), createApprovalsRouter({
  buildApprovalRequestData,
  buildApprovalTradeEditData,
  createApprovalRequestRecord,
  executeBrokerPaperOrder: brokerPaperExecutionService.executeApproval,
  estimateLedgerImpact,
  getApprovalRequestById,
  getDecisionNote,
  getPortfolioForUser,
  getRequestOrderPayload,
  listApprovalRequests,
  persistPaperExecutionResult,
  persistProposedTradeEditFromApproval,
  proposedTradeToOrder,
  runPaperOrder,
  runPreTradeAnalysis,
  syncApprovalRequestsFromProposedOrders,
  transitionApprovalRequest,
  updateApprovalRequestRecord,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.SETTINGS), createSettingsRouter({
  getDefaultExecutionSettings,
  getDefaultMarketUniverseSettings,
  getExecutionSettingsFromRequest,
  getMarketUniverseSettingsFromRequest,
  parseSafetyPercent,
  readUserSafetyStatus,
  readUserSetting,
  withJsonFallback,
  withPrismaSource,
  writeUserSafetyStatus,
  writeUserSetting,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.SETTINGS), createStockUniversesRouter({
  addStockUniverseMembers,
  createStockUniverse,
  deleteStockUniverse,
  getStockUniverseById,
  listStockUniverses,
  removeStockUniverseMember,
  updateStockUniverse,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.WATCHLIST), createWatchlistRouter({
  validateSymbol,
  watchlistRepository,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.BROKER), createBrokerRouter({
  brokerConfigService,
  brokerSecretService,
  brokerPaperExecutionService,
  brokerService,
  buildIbkrConfig,
  getIbkrStatus,
  normalizeIbkrMode,
  readUserIbkrConfig,
  runIbkrConnectionTest,
  syncLedgerFromBrokerAccount,
  writeUserIbkrConfig,
}));
app.use("/api", createMarketDataRouter({
  getChartPeriod,
  getMetrics: getMarketDataMetrics,
  getPriceHistory,
  getProviderHealth,
  getQuote,
  getQuotes,
  runChartData,
  validateSymbol,
}));
app.use("/api", createAiRouter({
  aiService,
  aiRateLimiter,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.TRADES), createTradesRouter({
  buildTrade,
  recordManualTrade,
  tradeRepository,
  withPrismaSource,
}));
app.use("/api", createEngineRouter({
  allowedIntervals,
  buildDataHealth,
  buildScannerStrategyConfig,
  getDefaultExecutionSettings,
  getDefaultMarketUniverseSettings,
  getExecutionSettingsFromRequest,
  getMarketUniverseSettingsFromRequest,
  getPortfolioForUser,
  getRequestedScanSymbols,
  getRiskMultiplier,
  getScanLimit,
  getSystemDataHealth,
  readActiveStrategyConfig,
  readEngineStatus,
  readUserSafetyStatus,
  readUserSetting,
  scanJobService,
  schedulerControllers,
  startScanJobForUser,
  startScheduler,
  stopUserScheduler,
  writeEngineStatus,
  writeUserSetting,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.PLAYBOOK), createPlaybookRouter({
  compareVersions,
  convertRecommendationToDraft,
  createPlaybook,
  createPlaybookSnapshot,
  createVersion,
  generateAiPlaybookRecommendation,
  getPlaybookDashboard,
  getPlaybookSourceData,
  getSnapshot,
  listPlaybooks,
  promoteVersion,
  rebuildEvidence,
  restoreVersion,
  reviewRecommendation,
  sendPlaybookExport,
  syncPlaybook,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.STRATEGY_LAB), createStrategyLabRouter({
  activateStrategyVersion,
  assignStrategyToActiveSet,
  buildExperimentBacktestConfig,
  buildStrategyComparisonMetrics,
  buildStrategyComparisonWinner: getStrategyComparisonWinner,
  buildStrategyExperimentCreateData,
  buildStrategyExperimentUpdateData,
  buildStrategyRunData,
  computeLifecycleReadiness,
  computeDeploymentReadiness,
  createStrategyVersion,
  deactivateStrategyDeployment,
  getActiveSetState,
  getStrategyLifecycleDashboard,
  getStrategyLifecycleEvidence,
  getStrategyValidationAggregate,
  getStrategyLeaderboard,
  getStrategyMemory,
  getStrategyExperimentId,
  persistMarketRegimeSnapshots,
  persistStrategyRunTrades,
  prisma,
  readActiveStrategyConfig,
  resolveCanonicalDeploymentState,
  resolveBacktestUniversePayload,
  runBacktestLabConfigForSymbols,
  runBacktestParameterSweep,
  runMonteCarloStress,
  runParameterSweep,
  runRegimeAnalysis,
  runStrategyRobustness,
  runStrategyPreview,
  runMatrixReplay,
  runWalkForward,
  sanitizeBacktestConfig,
  getDeploymentAllocationDashboard,
  simulateStrategyPortfolio,
  statusFromReadiness,
  strategyStorage,
  removeStrategyFromActiveSet,
  updateDeploymentAllocation,
  writeActiveStrategyConfig,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.APPROVALS), createPaperExecutionRouter({
  getApprovalRequestById,
  getDecisionNote,
  getRequestOrderPayload,
  persistPaperExecutionResult,
  runPaperOrder,
}));
app.use("/api", requirePageAccess(PAGE_KEYS.APPROVALS), createPreTradeRouter({
  runPreTradeAnalysis,
}));
app.use(
  "/api",
  requirePageAccess(PAGE_KEYS.ADMIN_DASHBOARD),
  requireRole(USER_ROLES.LEVEL_3_OWNER_ADMIN),
  createAdminRouter({
    adminService,
    getMarketDataMetrics,
  })
);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

scanJobService.recoverInterruptedJobs().catch((error) => {
  console.error(`Unable to reconcile interrupted scan jobs: ${error.message}`);
});

startMarketDataService();

const httpServer = app.listen(PORT, (error) => {
  if (error) {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Cannot start backend: port ${PORT} is already in use. ` +
        "Stop the existing backend process or use a different PORT."
      );
    } else {
      console.error(`Cannot start backend: ${error.message}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log(`Node backend running on http://localhost:${PORT}`);
});

const marketDataHub = createMarketDataHubService({
  marketDataService: {
    getPriceHistory,
    getQuote,
    getQuotes,
  },
  metrics: marketDataMetricsService,
});

marketDataHub.attach(httpServer);

let shuttingDown = false;

function stopSchedulerProcesses() {
  for (const userId of schedulerControllers.keys()) {
    stopUserScheduler(userId);
  }
}

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}; shutting down backend.`);
  stopSchedulerProcesses();
  void scanJobService.shutdown();
  void marketDataHub.stop();
  void stopMarketDataService();

  httpServer.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", stopSchedulerProcesses);
