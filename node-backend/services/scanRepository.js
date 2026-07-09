const prisma = require("./prisma");

let scanMirrorSupportsFreshnessFields = true;
let scanMirrorSupportsOpportunityMirrorFields = true;
let scanMirrorSupportsOpportunityMarketFields = true;
let scanMirrorSupportsStrategyLifecycleFields = true;
let scanMirrorSupportsConditioningFields = true;
let loggedLegacyScanMirrorFallback = false;
let scanMirrorCompatibility = null;

function mapSignal(signal) {
  return ["BUY", "HOLD", "SELL"].includes(signal) ? signal : "HOLD";
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissingColumnError(error) {
  return /column .* does not exist|does not exist in the current database/i.test(
    error?.message || ""
  );
}

async function getScanMirrorCompatibility() {
  if (scanMirrorCompatibility) {
    return scanMirrorCompatibility;
  }

  try {
    const columns = await prisma.run((db) => db.$queryRaw`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name IN ('Scan', 'Opportunity')
        AND column_name IN (
          'externalScanId',
          'scanDuration',
          'finalConfidence',
          'confidenceBreakdown',
          'sector',
          'market',
          'exchange',
          'currency',
          'country',
          'displaySymbol',
          'yahooSymbol',
          'marketRegime',
          'scanTimestamp',
          'strategyVersionId',
          'signalScore',
          'ruleSnapshot',
          'fitScore',
          'regimeAtSignal',
          'sectorContext',
          'instrumentType'
        )
    `);
    const columnKeys = new Set(
      columns.map((column) => `${column.table_name}.${column.column_name}`)
    );

    scanMirrorCompatibility = {
      supportsFreshnessFields:
        columnKeys.has("Scan.externalScanId") &&
        columnKeys.has("Scan.scanDuration"),
      supportsOpportunityMirrorFields:
        columnKeys.has("Opportunity.finalConfidence") &&
        columnKeys.has("Opportunity.confidenceBreakdown") &&
        columnKeys.has("Opportunity.sector") &&
        columnKeys.has("Opportunity.marketRegime") &&
        columnKeys.has("Opportunity.scanTimestamp"),
      supportsOpportunityMarketFields:
        columnKeys.has("Opportunity.market") &&
        columnKeys.has("Opportunity.exchange") &&
        columnKeys.has("Opportunity.currency") &&
        columnKeys.has("Opportunity.country") &&
        columnKeys.has("Opportunity.displaySymbol") &&
        columnKeys.has("Opportunity.yahooSymbol"),
      supportsStrategyLifecycleFields:
        columnKeys.has("Scan.strategyVersionId") &&
        columnKeys.has("Opportunity.strategyVersionId") &&
        columnKeys.has("Opportunity.signalScore") &&
        columnKeys.has("Opportunity.ruleSnapshot"),
      supportsConditioningFields:
        columnKeys.has("Opportunity.fitScore") &&
        columnKeys.has("Opportunity.regimeAtSignal") &&
        columnKeys.has("Opportunity.sectorContext") &&
        columnKeys.has("Opportunity.instrumentType"),
    };
  } catch (_error) {
    scanMirrorCompatibility = {
      supportsFreshnessFields: scanMirrorSupportsFreshnessFields,
      supportsOpportunityMirrorFields: scanMirrorSupportsOpportunityMirrorFields,
      supportsOpportunityMarketFields: scanMirrorSupportsOpportunityMarketFields,
      supportsStrategyLifecycleFields: scanMirrorSupportsStrategyLifecycleFields,
      supportsConditioningFields: scanMirrorSupportsConditioningFields,
    };
  }

  return scanMirrorCompatibility;
}

function buildOpportunityCreate(
  opportunity,
  userId,
  generatedAt,
  marketRegimeName,
  includeMirrorFields,
  includeMarketFields,
  includeStrategyLifecycleFields,
  includeConditioningFields,
  strategyAttribution
) {
  const data = {
    userId,
    symbol: opportunity.symbol,
    signal: mapSignal(opportunity.signal),
    confidence: toNumber(opportunity.confidence) || 0,
    opportunityScore: toNumber(opportunity.opportunity_score) || 0,
    close: toNumber(opportunity.close),
    rsi: toNumber(opportunity.rsi),
    backtestReturn: toNumber(opportunity.backtest_return),
    buyAndHoldReturn: toNumber(opportunity.buy_and_hold),
    winRate: toNumber(opportunity.win_rate),
    drawdown: toNumber(opportunity.drawdown),
    sharpeRatio: toNumber(opportunity.sharpe_ratio),
    profitFactor: toNumber(opportunity.profit_factor),
    expectancyPerTrade: toNumber(opportunity.expectancy_per_trade),
    averageHoldingPeriodDays: toNumber(
      opportunity.average_holding_period_days
    ),
    annualizedReturn: toNumber(opportunity.annualized_return),
    volatility: toNumber(opportunity.volatility),
    trades: Number.isInteger(Number(opportunity.trades))
      ? Number(opportunity.trades)
      : null,
    reasons: opportunity.reasons || [],
    raw: opportunity,
  };

  if (includeMirrorFields) {
    data.finalConfidence =
      toNumber(opportunity.final_confidence) ??
      toNumber(opportunity.confidence);
    data.confidenceBreakdown = opportunity.confidence_breakdown || {};
    data.sector = opportunity.sector || null;
    data.marketRegime = marketRegimeName;
    data.scanTimestamp = generatedAt;
  }

  if (includeMarketFields) {
    data.market = opportunity.market || null;
    data.exchange = opportunity.exchange || null;
    data.currency = opportunity.currency || null;
    data.country = opportunity.country || null;
    data.displaySymbol = opportunity.display_symbol || opportunity.displaySymbol || null;
    data.yahooSymbol =
      opportunity.yahoo_symbol || opportunity.yahooSymbol || opportunity.symbol || null;
  }

  if (includeStrategyLifecycleFields) {
    data.strategyVersionId = strategyAttribution.strategyVersionId || null;
    data.signalScore =
      toNumber(opportunity.signal_score) ??
      toNumber(opportunity.signalScore) ??
      toNumber(opportunity.score) ??
      toNumber(opportunity.confidence);
    data.ruleSnapshot =
      opportunity.rule_snapshot ||
      opportunity.ruleSnapshot ||
      strategyAttribution.ruleSnapshot ||
      {};
  }

  if (includeConditioningFields) {
    data.fitScore =
      toNumber(opportunity.fit_score) ??
      toNumber(opportunity.fitScore) ??
      toNumber(opportunity.portfolio_fit_score);
    data.regimeAtSignal =
      opportunity.regime_at_signal || opportunity.regimeAtSignal || marketRegimeName;
    data.sectorContext =
      opportunity.sector_context || opportunity.sectorContext || opportunity.sector || null;
    data.instrumentType =
      opportunity.instrument_type || opportunity.instrumentType || null;
  }

  return data;
}

function getStrategyAttribution(scanResults) {
  const activeStrategy =
    scanResults.active_strategy || scanResults.active_strategy_config || {};
  return {
    strategyVersionId:
      scanResults.strategy_version_id ||
      activeStrategy.strategyVersionId ||
      activeStrategy.strategy_version_id ||
      null,
    ruleSnapshot:
      activeStrategy.ruleSnapshot ||
      activeStrategy.rule_snapshot ||
      activeStrategy.settings?.strategyJson?.executable ||
      activeStrategy.strategyJson?.executable ||
      null,
  };
}

function buildScanCreateData(
  scanResults,
  userId,
  includeFreshnessFields,
  includeOpportunityMirrorFields,
  includeOpportunityMarketFields,
  includeStrategyLifecycleFields,
  includeConditioningFields
) {
  const opportunities = scanResults.opportunities || [];
  const marketRegime = scanResults.market_regime || {};
  const generatedAt = scanResults.generated_at
    ? new Date(scanResults.generated_at)
    : new Date();
  const marketRegimeName =
    marketRegime.regime || marketRegime.regime_name || null;
  const strategyAttribution = getStrategyAttribution(scanResults);
  const data = {
    userId,
    generatedAt,
    marketRegime: marketRegimeName,
    riskMultiplier: toNumber(marketRegime.risk_multiplier),
    raw: scanResults,
    opportunities: {
      create: opportunities.map((opportunity) =>
        buildOpportunityCreate(
          opportunity,
          userId,
          generatedAt,
          marketRegimeName,
          includeOpportunityMirrorFields,
          includeOpportunityMarketFields,
          includeStrategyLifecycleFields,
          includeConditioningFields,
          strategyAttribution
        )
      ),
    },
  };

  if (includeFreshnessFields) {
    data.externalScanId = scanResults.scan_id || null;
    data.scanDuration = toNumber(scanResults.scan_duration);
  }

  if (includeStrategyLifecycleFields) {
    data.strategyVersionId = strategyAttribution.strategyVersionId || null;
  }

  return data;
}

async function saveScanResultsToDatabase(scanResults, userId) {
  if (!userId) {
    throw new Error("Authenticated user ownership is required to save a scan.");
  }
  const compatibility = await getScanMirrorCompatibility();
  const includeFreshnessFields =
    scanMirrorSupportsFreshnessFields &&
    compatibility.supportsFreshnessFields;
  const includeOpportunityMirrorFields =
    scanMirrorSupportsOpportunityMirrorFields &&
    compatibility.supportsOpportunityMirrorFields;
  const includeOpportunityMarketFields =
    scanMirrorSupportsOpportunityMarketFields &&
    compatibility.supportsOpportunityMarketFields;
  const includeStrategyLifecycleFields =
    scanMirrorSupportsStrategyLifecycleFields &&
    compatibility.supportsStrategyLifecycleFields;
  const includeConditioningFields =
    scanMirrorSupportsConditioningFields &&
    compatibility.supportsConditioningFields;

  try {
    return await prisma.run((db) => db.scan.create({
      data: buildScanCreateData(
        scanResults,
        userId,
        includeFreshnessFields,
        includeOpportunityMirrorFields,
        includeOpportunityMarketFields,
        includeStrategyLifecycleFields,
        includeConditioningFields
      ),
      select: {
        id: true,
      },
    }));
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    scanMirrorSupportsFreshnessFields = false;
    scanMirrorSupportsOpportunityMirrorFields = false;
    scanMirrorSupportsOpportunityMarketFields = false;
    scanMirrorSupportsStrategyLifecycleFields = false;
    scanMirrorSupportsConditioningFields = false;
    scanMirrorCompatibility = {
      supportsFreshnessFields: false,
      supportsOpportunityMirrorFields: false,
      supportsOpportunityMarketFields: false,
      supportsStrategyLifecycleFields: false,
      supportsConditioningFields: false,
    };

    if (!loggedLegacyScanMirrorFallback) {
      loggedLegacyScanMirrorFallback = true;
      console.warn(
        "Scan mirror is using legacy Prisma columns until pending migrations are applied."
      );
    }

    return prisma.run((db) => db.scan.create({
      data: buildScanCreateData(scanResults, userId, false, false, false, false),
      select: {
        id: true,
      },
    }));
  }
}

module.exports = {
  saveScanResultsToDatabase,
};
