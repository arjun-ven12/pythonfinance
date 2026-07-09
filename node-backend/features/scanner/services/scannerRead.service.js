function createScannerReadService({
  crypto,
  normalizeExchange,
  persistValidationSignalsFromScanResults,
  prisma,
  readEngineStatus,
  saveScanResultsToDatabase,
  scanJobService,
  withJsonFallback,
  withPrismaSource,
}) {
const STORED_OPPORTUNITY_SELECT = {
  id: true,
  scanId: true,
  strategyVersionId: true,
  symbol: true,
  signal: true,
  signalScore: true,
  confidence: true,
  finalConfidence: true,
  confidenceBreakdown: true,
  opportunityScore: true,
  ruleSnapshot: true,
  sector: true,
  marketRegime: true,
  scanTimestamp: true,
  close: true,
  rsi: true,
  backtestReturn: true,
  buyAndHoldReturn: true,
  winRate: true,
  drawdown: true,
  sharpeRatio: true,
  profitFactor: true,
  expectancyPerTrade: true,
  averageHoldingPeriodDays: true,
  annualizedReturn: true,
  volatility: true,
  trades: true,
  market: true,
  exchange: true,
  currency: true,
  country: true,
  displaySymbol: true,
  yahooSymbol: true,
  reasons: true,
  raw: true,
};

const STORED_SCAN_SELECT = {
  id: true,
  strategyVersionId: true,
  generatedAt: true,
  marketRegime: true,
  riskMultiplier: true,
  raw: true,
};

const storedScanWithOpportunitiesSelect = {
  ...STORED_SCAN_SELECT,
  opportunities: {
    select: STORED_OPPORTUNITY_SELECT,
  },
};

function normalizeScanMetadata(scanResults, scanDurationSeconds = null) {
  const generatedAt = scanResults.generated_at || new Date().toISOString();
  const duration =
    scanDurationSeconds ?? scanResults.scan_duration ?? scanResults.scan_duration_seconds ?? null;

  return {
    ...scanResults,
    scan_id: scanResults.scan_id || crypto.randomUUID(),
    generated_at: generatedAt,
    scan_duration:
      duration === null || duration === undefined ? null : Number(Number(duration).toFixed(2)),
  };
}

function getScanAgeMinutes(lastScanTime) {
  if (!lastScanTime) {
    return null;
  }

  const timestamp = new Date(lastScanTime).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Number(((Date.now() - timestamp) / 60000).toFixed(1));
}

function getFreshnessLevel(scanAgeMinutes) {
  if (scanAgeMinutes === null || scanAgeMinutes === undefined) {
    return "unknown";
  }

  if (scanAgeMinutes >= 120) {
    return "critical";
  }

  if (scanAgeMinutes >= 30) {
    return "warning";
  }

  return "fresh";
}

async function buildDataHealth(userId) {
  try {
    const latestScan = await prisma.run((db) =>
      db.scan.findFirst({
        where: { userId },
        orderBy: { generatedAt: "desc" },
        select: {
          generatedAt: true,
          externalScanId: true,
          scanDuration: true,
        },
      })
    );
    const lastScanTime = latestScan?.generatedAt || null;
    const scanAgeMinutes = getScanAgeMinutes(lastScanTime);
    const freshnessLevel = getFreshnessLevel(scanAgeMinutes);
    const [engineStatus, activeScanJob] = await Promise.all([
      readEngineStatus(userId),
      scanJobService.getActiveJob(userId),
    ]);
    const scannerStatus = activeScanJob
      ? "RUNNING"
      : engineStatus.last_error
        ? "ERROR"
        : freshnessLevel === "critical"
          ? "STALE_CRITICAL"
          : freshnessLevel === "warning"
            ? "STALE_WARNING"
            : freshnessLevel === "fresh"
              ? "OK"
              : "UNKNOWN";

    return {
      last_scan_time: lastScanTime,
      scan_age_minutes: scanAgeMinutes,
      is_stale: freshnessLevel === "warning" || freshnessLevel === "critical",
      last_successful_scan: lastScanTime,
      scanner_status: scannerStatus,
      stale_level: freshnessLevel,
      scan_id: latestScan?.externalScanId || null,
      scan_duration: latestScan?.scanDuration || null,
    };
  } catch (error) {
    return {
      last_scan_time: null,
      scan_age_minutes: null,
      is_stale: true,
      last_successful_scan: null,
      scanner_status: (await scanJobService.getActiveJob(userId))
        ? "RUNNING"
        : "NO_DATA",
      stale_level: "critical",
      scan_id: null,
      scan_duration: null,
      error: error.message,
    };
  }
}

function buildSectorCounts(opportunities = []) {
  return opportunities.reduce((acc, opportunity) => {
    const sector = opportunity.sector || "UNKNOWN";
    acc[sector] = (acc[sector] || 0) + 1;
    return acc;
  }, {});
}

async function getPreviousSectorCounts(generatedAt, userId) {
  try {
    const generatedDate = generatedAt ? new Date(generatedAt) : new Date();
    const previousScan = await prisma.run((db) => db.scan.findFirst({
      where: {
        userId,
        generatedAt: {
          lt: generatedDate,
        },
      },
      orderBy: {
        generatedAt: "desc",
      },
      select: {
        raw: true,
      },
    }));

    return buildSectorCounts(previousScan?.raw?.opportunities || []);
  } catch (error) {
    console.error(`Previous sector counts unavailable: ${error.message}`);
    return {};
  }
}

async function readScanResultsWithHistory(userId) {
  try {
    const latestScan = await prisma.run((db) => db.scan.findFirst({
      where: { userId },
      orderBy: {
        generatedAt: "desc",
      },
      select: storedScanWithOpportunitiesSelect,
    }));

    if (!latestScan) {
      return withPrismaSource({
        generated_at: null,
        market_regime: null,
        opportunities: [],
        previous_sector_counts: {},
        emptyState: true,
        message: "No scans have been run for this account yet.",
      });
    }

    const raw = latestScan.raw || {};
    const previousSectorCounts = await getPreviousSectorCounts(
      latestScan.generatedAt,
      userId
    );

    return withPrismaSource({
      ...raw,
      scan_id: latestScan.id,
      strategy_version_id: latestScan.strategyVersionId || raw.strategy_version_id || null,
      generated_at: latestScan.generatedAt,
      market_regime:
        raw.market_regime || {
          regime: latestScan.marketRegime,
          risk_multiplier: latestScan.riskMultiplier,
        },
      opportunities: latestScan.opportunities.map((opportunity) =>
        normalizeStoredOpportunity(opportunity, latestScan)
      ),
      previous_sector_counts: previousSectorCounts,
    });
  } catch (error) {
    return withJsonFallback(
      {
        generated_at: null,
        market_regime: null,
        opportunities: [],
        previous_sector_counts: {},
      },
      error
    );
  }
}

async function ensureScanResultsStored(scanResults, userId) {
  if (!scanResults?.generated_at) {
    return;
  }

  try {
    const generatedAt = new Date(scanResults.generated_at);
    const existing = await prisma.run((db) => db.scan.findFirst({
      where: {
        userId,
        generatedAt,
      },
      select: {
        id: true,
      },
    }));

    if (!existing) {
      await saveScanResultsToDatabase(scanResults, userId);
    }

    await persistValidationSignalsFromScanResults(scanResults, userId);
  } catch (error) {
    console.error(`Scan history save skipped: ${error.message}`);
  }
}

function normalizeStoredOpportunity(opportunity, scan) {
  const raw = opportunity.raw || opportunity;
  return {
    ...raw,
    id: opportunity.id,
    scan_id: opportunity.scanId || scan?.id || null,
    strategy_version_id:
      opportunity.strategyVersionId ||
      raw.strategy_version_id ||
      raw.strategyVersionId ||
      scan?.strategyVersionId ||
      null,
    generated_at: scan?.generatedAt || raw.generated_at || null,
    symbol: opportunity.symbol || raw.symbol,
    signal: opportunity.signal || raw.signal,
    signal_score:
      opportunity.signalScore ?? raw.signal_score ?? raw.signalScore ?? null,
    confidence: Number(opportunity.confidence ?? raw.confidence ?? 0),
    final_confidence:
      opportunity.finalConfidence ?? raw.final_confidence ?? raw.finalConfidence ?? null,
    confidence_breakdown:
      opportunity.confidenceBreakdown ??
      raw.confidence_breakdown ??
      raw.confidenceBreakdown ??
      null,
    opportunity_score: Number(
      opportunity.opportunityScore ?? raw.opportunity_score ?? 0
    ),
    rule_snapshot:
      opportunity.ruleSnapshot ??
      raw.rule_snapshot ??
      raw.ruleSnapshot ??
      null,
    close: opportunity.close ?? raw.close ?? null,
    display_symbol: opportunity.displaySymbol || raw.display_symbol || raw.displaySymbol || opportunity.symbol || raw.symbol,
    yahoo_symbol: opportunity.yahooSymbol || raw.yahoo_symbol || raw.yahooSymbol || opportunity.symbol || raw.symbol,
    company_name: raw.company_name || raw.companyName || null,
    market: opportunity.market || raw.market || "US",
    exchange: normalizeExchange(opportunity.exchange || raw.exchange, {
      ...raw,
      ...opportunity,
    }),
    currency: opportunity.currency || raw.currency || "USD",
    country: opportunity.country || raw.country || null,
    is_sgx: Boolean(raw.is_sgx || raw.isSgx || opportunity.exchange === "SGX"),
    is_us: raw.is_us ?? raw.isUs ?? opportunity.market === "US",
    sector: opportunity.sector || raw.sector || null,
    industry: raw.industry || null,
    fit_score: opportunity.fitScore ?? raw.fit_score ?? raw.fitScore ?? null,
    regime_at_signal:
      opportunity.regimeAtSignal || raw.regime_at_signal || raw.regimeAtSignal || null,
    sector_context:
      opportunity.sectorContext || raw.sector_context || raw.sectorContext || null,
    instrument_type:
      opportunity.instrumentType || raw.instrument_type || raw.instrumentType || null,
    market_regime:
      opportunity.marketRegime || raw.market_regime || raw.marketRegime || null,
    raw,
  };
}

function normalizeRawOpportunity(opportunity, generatedAt) {
  return {
    id: `${generatedAt}-${opportunity.symbol}`,
    scan_id: generatedAt,
    generated_at: generatedAt,
    symbol: opportunity.symbol,
    signal: opportunity.signal,
    confidence: Number(opportunity.confidence || 0),
    opportunity_score: Number(opportunity.opportunity_score || 0),
    close: opportunity.close ?? null,
    display_symbol: opportunity.display_symbol || opportunity.displaySymbol || opportunity.symbol,
    yahoo_symbol: opportunity.yahoo_symbol || opportunity.yahooSymbol || opportunity.symbol,
    company_name: opportunity.company_name || opportunity.companyName || null,
    market: opportunity.market || "US",
    exchange: normalizeExchange(opportunity.exchange, opportunity),
    currency: opportunity.currency || "USD",
    country: opportunity.country || null,
    is_sgx: Boolean(opportunity.is_sgx || opportunity.isSgx),
    is_us: opportunity.is_us ?? opportunity.isUs ?? opportunity.market === "US",
    sector: opportunity.sector || null,
    industry: opportunity.industry || null,
    fit_score: opportunity.fit_score ?? opportunity.fitScore ?? null,
    regime_at_signal: opportunity.regime_at_signal || opportunity.regimeAtSignal || null,
    sector_context: opportunity.sector_context || opportunity.sectorContext || null,
    instrument_type: opportunity.instrument_type || opportunity.instrumentType || null,
    raw: opportunity,
  };
}

function buildOpportunityMap(scan) {
  const opportunities = scan.opportunities || scan.raw?.opportunities || [];
  return opportunities.reduce((acc, opportunity) => {
    const normalized = opportunity.raw
      ? normalizeStoredOpportunity(opportunity, scan)
      : normalizeRawOpportunity(opportunity, scan.generatedAt || scan.generated_at);
    acc[normalized.symbol] = normalized;
    return acc;
  }, {});
}

function getChangeTypes(current, previous) {
  const changes = [];

  if (!previous) {
    changes.push("NEW_SYMBOL");

    if (current.signal === "BUY") {
      changes.push("NEW_BUY");
    }

    return changes;
  }

  if (previous.signal === "BUY" && current.signal === "HOLD") {
    changes.push("BUY_TO_HOLD");
  }

  if (previous.signal === "HOLD" && current.signal === "BUY") {
    changes.push("HOLD_TO_BUY");
  }

  if (current.confidence > previous.confidence) {
    changes.push("CONFIDENCE_UP");
  } else if (current.confidence < previous.confidence) {
    changes.push("CONFIDENCE_DOWN");
  }

  if (current.opportunity_score > previous.opportunity_score) {
    changes.push("SCORE_UP");
  } else if (current.opportunity_score < previous.opportunity_score) {
    changes.push("SCORE_DOWN");
  }

  return changes;
}

function computeSignalChanges(scans) {
  const ordered = [...scans].sort(
    (a, b) => new Date(a.generatedAt || a.generated_at) - new Date(b.generatedAt || b.generated_at)
  );
  const changes = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const currentScan = ordered[index];
    const previousScan = ordered[index - 1];
    const currentMap = buildOpportunityMap(currentScan);
    const previousMap = previousScan ? buildOpportunityMap(previousScan) : {};

    Object.values(currentMap).forEach((current) => {
      const previous = previousMap[current.symbol];
      const changeTypes = getChangeTypes(current, previous);

      changeTypes.forEach((changeType) => {
        changes.push({
          change_type: changeType,
          symbol: current.symbol,
          generated_at: current.generated_at,
          scan_id: current.scan_id,
          previous_signal: previous?.signal || null,
          current_signal: current.signal,
          previous_confidence: previous?.confidence ?? null,
          current_confidence: current.confidence,
          previous_score: previous?.opportunity_score ?? null,
          current_score: current.opportunity_score,
          confidence_delta:
            previous?.confidence == null
              ? null
              : Number((current.confidence - previous.confidence).toFixed(2)),
          score_delta:
            previous?.opportunity_score == null
              ? null
              : Number((current.opportunity_score - previous.opportunity_score).toFixed(2)),
        });
      });
    });
  }

  return changes.sort(
    (a, b) => new Date(b.generated_at) - new Date(a.generated_at)
  );
}



  return {
    buildDataHealth,
    computeSignalChanges,
    ensureScanResultsStored,
    normalizeRawOpportunity,
    normalizeScanMetadata,
    normalizeStoredOpportunity,
    readScanResultsWithHistory,
    storedScanSelect: storedScanWithOpportunitiesSelect,
    storedScanWithOpportunitiesSelect,
  };
}

module.exports = createScannerReadService;
