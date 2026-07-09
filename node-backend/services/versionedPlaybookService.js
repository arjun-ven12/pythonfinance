const prisma = require("./prisma");
const { requireUserId } = require("../repositories/ownership");
const { createAIService } = require("./ai/AIService");

const SECRET_KEY_PATTERN =
  /(api[_-]?key|token|secret|password|database_url|bot[_-]?token)/i;
const EVIDENCE_REQUIREMENTS = Object.freeze({
  minimumTrades: 30,
  minimumRuns: 5,
  minimumPeriodDays: 90,
});
const aiService = createAIService();

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) {
  const valid = values.map(numberOrNull).filter((value) => value !== null);
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitize(item),
      ])
    );
  }
  return value;
}

function equityHistory(portfolio = {}) {
  return Array.isArray(portfolio.equity_history) ? portfolio.equity_history : [];
}

function calculateReturn(portfolio = {}) {
  const startingCash = numberOrNull(portfolio.starting_cash);
  const equity = numberOrNull(portfolio.equity);
  return startingCash && equity !== null
    ? ((equity - startingCash) / startingCash) * 100
    : null;
}

function calculateDrawdown(portfolio = {}) {
  let peak = null;
  let worst = 0;
  equityHistory(portfolio).forEach((point) => {
    const equity = numberOrNull(point.equity);
    if (equity === null) return;
    peak = peak === null ? equity : Math.max(peak, equity);
    if (peak > 0) worst = Math.max(worst, ((peak - equity) / peak) * 100);
  });
  return peak === null ? null : worst;
}

function calculateReturnSeries(portfolio = {}) {
  const history = equityHistory(portfolio);
  const returns = [];
  for (let index = 1; index < history.length; index += 1) {
    const previous = numberOrNull(history[index - 1]?.equity);
    const current = numberOrNull(history[index]?.equity);
    if (previous && current !== null) returns.push((current - previous) / previous);
  }
  return returns;
}

function calculateRiskRatio(portfolio, downsideOnly = false) {
  const returns = calculateReturnSeries(portfolio);
  if (returns.length < 2) return null;
  const mean = average(returns);
  const sample = downsideOnly ? returns.filter((value) => value < 0) : returns;
  if (!sample.length || mean === null) return null;
  const variance = average(sample.map((value) => (value - mean) ** 2));
  const deviation = Math.sqrt(variance || 0);
  return deviation ? (mean / deviation) * Math.sqrt(252) : null;
}

function calculateCagr(portfolio = {}) {
  const history = equityHistory(portfolio);
  if (history.length < 2) return null;
  const start = history[0];
  const end = history.at(-1);
  const startEquity = numberOrNull(start.equity);
  const endEquity = numberOrNull(end.equity);
  const startAt = new Date(start.timestamp || start.date);
  const endAt = new Date(end.timestamp || end.date);
  const years = (endAt - startAt) / (365.25 * 24 * 60 * 60 * 1000);
  if (!startEquity || endEquity === null || years <= 0) return null;
  return (Math.pow(endEquity / startEquity, 1 / years) - 1) * 100;
}

function calculateTradeStats(trades = []) {
  const pnlValues = trades
    .map((trade) => numberOrNull(trade.realizedPnl ?? trade.pnl))
    .filter((value) => value !== null);
  const wins = pnlValues.filter((value) => value > 0);
  const losses = pnlValues.filter((value) => value < 0);
  const grossProfit = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));

  return {
    tradeCount: trades.length,
    winRate: pnlValues.length ? (wins.length / pnlValues.length) * 100 : null,
    expectancy: pnlValues.length ? average(pnlValues) : null,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
  };
}

function getVersionSnapshot(sourceData = {}) {
  const scan = sourceData.scanResults || {};
  const settings = sourceData.executionSettings || {};
  const strategy = scan.active_strategy_config || scan.strategy_profile || {};
  return {
    settingsSnapshot: sanitize({
      ...settings,
      strategy,
      thresholds: {
        signal: scan.trading_horizon?.signal_threshold ?? null,
        score: sourceData.proposedOrders?.score_threshold ?? null,
        alert: sourceData.alerts?.threshold ?? null,
      },
    }),
    riskSnapshot: sanitize(sourceData.safetyStatus?.limits || {}),
    universeSnapshot: sanitize(scan.market_universe_settings || {}),
    executionMode: String(settings.execution_mode || "MANUAL_APPROVAL"),
    horizon: String(
      scan.trading_horizon?.key ||
        scan.trading_horizon?.name ||
        settings.trading_horizon ||
        "SWING"
    ),
    benchmark: String(settings.benchmark || "SPY").toUpperCase(),
  };
}

function buildRunData(sourceData = {}, version) {
  const portfolio = sourceData.paperPortfolio || {};
  const trades = sourceData.paperTrades?.trades || [];
  const tradeStats = calculateTradeStats(trades);
  const strategyMetrics =
    version?.strategyRun?.settingsJson?.backtestResult ||
    version?.strategyRun?.settingsJson?.result ||
    {};
  const benchmarkReturn =
    numberOrNull(version?.strategyRun?.benchmarkReturn) ??
    numberOrNull(strategyMetrics.benchmark_return);
  const totalReturn =
    numberOrNull(version?.strategyRun?.returnPct) ?? calculateReturn(portfolio);
  const scan = sourceData.scanResults || {};
  const regime = scan.market_regime || {};

  return {
    scanId: sourceData.latestScanId || null,
    strategyRunId: version?.strategyRunId || null,
    portfolioSnapshotId: sourceData.portfolioSnapshotId || null,
    marketRegime: String(regime.regime_name || regime.regime || "UNKNOWN"),
    benchmark: version?.benchmark || "SPY",
    approvalSummary: sanitize({
      total: sourceData.approvalRequests?.length || 0,
      approved: (sourceData.approvalRequests || []).filter(
        (item) => item.status === "APPROVED"
      ).length,
      rejected: (sourceData.approvalRequests || []).filter(
        (item) => item.status === "REJECTED"
      ).length,
      executed: (sourceData.approvalRequests || []).filter(
        (item) => item.status === "EXECUTED"
      ).length,
    }),
    executionSummary: sanitize({
      proposed: sourceData.proposedOrders?.orders?.length || 0,
      paperTrades: trades.length,
    }),
    totalReturn: round(totalReturn),
    cagr: round(
      numberOrNull(version?.strategyRun?.cagr) ?? calculateCagr(portfolio)
    ),
    sharpe: round(
      numberOrNull(version?.strategyRun?.sharpe) ??
        calculateRiskRatio(portfolio, false),
      4
    ),
    sortino: round(
      numberOrNull(strategyMetrics.sortino) ??
        calculateRiskRatio(portfolio, true),
      4
    ),
    drawdown: round(
      numberOrNull(version?.strategyRun?.maxDrawdown) ??
        calculateDrawdown(portfolio)
    ),
    expectancy: round(
      numberOrNull(version?.strategyRun?.expectancy) ?? tradeStats.expectancy
    ),
    winRate: round(
      numberOrNull(version?.strategyRun?.winRate) ?? tradeStats.winRate
    ),
    trades: numberOrNull(version?.strategyRun?.tradeCount) ?? tradeStats.tradeCount,
    profitFactor: round(
      numberOrNull(strategyMetrics.profit_factor) ?? tradeStats.profitFactor,
      4
    ),
    alpha:
      totalReturn !== null && benchmarkReturn !== null
        ? round(totalReturn - benchmarkReturn)
        : null,
    validationWarnings: sanitize(strategyMetrics.validation_warnings || []),
    overfittingRisk: strategyMetrics.overfitting_risk || null,
    regime: String(regime.regime_name || regime.regime || "UNKNOWN"),
    strongestSector: scan.opportunities?.[0]?.sector || null,
    strongestHorizon: version?.horizon || null,
    confidenceRange: null,
    approvalResultsJson: sanitize(sourceData.approvalRequests || []),
    paperTradesJson: sanitize(sourceData.paperTrades || {}),
    portfolioJson: sanitize(portfolio),
    alertsJson: sanitize(sourceData.alerts || {}),
    raw: sanitize({
      scan_generated_at: scan.generated_at || null,
      benchmark_return: benchmarkReturn,
      sources: sourceData.sources || {},
    }),
  };
}

function groupAverage(runs, keySelector) {
  const groups = new Map();
  runs.forEach((run) => {
    const key = keySelector(run);
    const value = numberOrNull(run.totalReturn);
    if (!key || value === null) return;
    const current = groups.get(key) || [];
    current.push({ id: run.id, value });
    groups.set(key, current);
  });
  return [...groups.entries()]
    .map(([key, values]) => ({
      key,
      value: average(values.map((item) => item.value)),
      runIds: values.map((item) => item.id),
      sampleSize: values.length,
    }))
    .sort((left, right) => right.value - left.value);
}

function getEvidencePeriodDays(runs) {
  if (runs.length < 2) return 0;
  const times = runs
    .map((run) => new Date(run.createdAt).getTime())
    .filter(Number.isFinite);
  return times.length
    ? Math.max(0, (Math.max(...times) - Math.min(...times)) / 86400000)
    : 0;
}

function calculateEvidence(runs = []) {
  const totalTrades = runs.reduce(
    (sum, run) => sum + (numberOrNull(run.trades) || 0),
    0
  );
  const periodDays = getEvidencePeriodDays(runs);
  const checks = {
    trades: totalTrades >= EVIDENCE_REQUIREMENTS.minimumTrades,
    runs: runs.length >= EVIDENCE_REQUIREMENTS.minimumRuns,
    period: periodDays >= EVIDENCE_REQUIREMENTS.minimumPeriodDays,
  };
  const score = Math.round(
    Math.min(1, totalTrades / EVIDENCE_REQUIREMENTS.minimumTrades) * 35 +
      Math.min(1, runs.length / EVIDENCE_REQUIREMENTS.minimumRuns) * 30 +
      Math.min(1, periodDays / EVIDENCE_REQUIREMENTS.minimumPeriodDays) * 35
  );
  return {
    eligible: Object.values(checks).every(Boolean),
    score,
    totalTrades,
    runCount: runs.length,
    periodDays: round(periodDays, 1),
    checks,
    requirements: EVIDENCE_REQUIREMENTS,
    warnings: [
      !checks.trades
        ? `At least ${EVIDENCE_REQUIREMENTS.minimumTrades} trades are required.`
        : null,
      !checks.runs
        ? `At least ${EVIDENCE_REQUIREMENTS.minimumRuns} runs are required.`
        : null,
      !checks.period
        ? `At least ${EVIDENCE_REQUIREMENTS.minimumPeriodDays} days of evidence are required.`
        : null,
    ].filter(Boolean),
  };
}

function reliabilityForSample(sampleSize) {
  if (sampleSize >= 20) return "HIGH";
  if (sampleSize >= 10) return "MEDIUM";
  return "LOW";
}

function buildDeterministicInsights(runs = []) {
  const evidence = calculateEvidence(runs);
  if (!evidence.eligible) return { evidence, insights: [] };

  const regimes = groupAverage(runs, (run) => run.marketRegime || run.regime);
  const sectors = groupAverage(runs, (run) => run.strongestSector);
  const averageAlpha = average(runs.map((run) => run.alpha));
  const overfitRuns = runs.filter(
    (run) => String(run.overfittingRisk || "").toUpperCase() === "HIGH"
  );
  const insights = [];

  const addGrouped = (type, title, group, formula) => {
    if (!group) return;
    insights.push({
      type,
      insightType: type,
      title,
      explanation: `${group.key} produced an average recorded return of ${round(
        group.value
      )}% across ${group.sampleSize} supporting runs.`,
      sampleSize: group.sampleSize,
      reliability: reliabilityForSample(group.sampleSize),
      formula,
      supportingRunIds: group.runIds,
      value: group.key,
      confidence: Math.min(1, group.sampleSize / 20),
      metadata: { averageReturn: round(group.value) },
    });
  };

  addGrouped(
    "BEST_REGIME",
    "Best market regime",
    regimes[0],
    "argmax(regime mean(totalReturn))"
  );
  addGrouped(
    "WORST_REGIME",
    "Worst market regime",
    regimes.at(-1),
    "argmin(regime mean(totalReturn))"
  );
  addGrouped(
    "STRONGEST_SECTOR",
    "Strongest sector",
    sectors[0],
    "argmax(sector mean(totalReturn))"
  );
  addGrouped(
    "WEAKEST_SECTOR",
    "Weakest sector",
    sectors.at(-1),
    "argmin(sector mean(totalReturn))"
  );

  if (averageAlpha !== null) {
    insights.push({
      type: "BENCHMARK_ALPHA",
      insightType: "BENCHMARK_ALPHA",
      title: "Benchmark alpha",
      explanation: `Mean strategy alpha across eligible runs is ${round(
        averageAlpha
      )} percentage points.`,
      sampleSize: runs.filter((run) => numberOrNull(run.alpha) !== null).length,
      reliability: reliabilityForSample(runs.length),
      formula: "mean(strategyReturn - benchmarkReturn)",
      supportingRunIds: runs.map((run) => run.id),
      value: `${round(averageAlpha)}%`,
      confidence: Math.min(1, runs.length / 20),
      metadata: { averageAlpha: round(averageAlpha) },
    });
  }

  insights.push({
    type: "OVERFIT_DIAGNOSTIC",
    insightType: "OVERFIT_DIAGNOSTIC",
    title: "Overfitting diagnostic",
    explanation: overfitRuns.length
      ? `${overfitRuns.length} of ${runs.length} runs carry a HIGH overfitting warning.`
      : "No eligible run carries a HIGH overfitting warning.",
    sampleSize: runs.length,
    reliability: reliabilityForSample(runs.length),
    formula: "count(overfittingRisk = HIGH) / eligible runs",
    supportingRunIds: runs.map((run) => run.id),
    value: overfitRuns.length ? "WARNING" : "CLEAR",
    confidence: Math.min(1, runs.length / 20),
    metadata: { highRiskRuns: overfitRuns.length },
  });

  return { evidence, insights };
}

async function createVersionWithClient(db, userId, playbook, data) {
  const latest = await db.playbookVersion.findFirst({
    where: { userId, playbookId: playbook.id },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return db.playbookVersion.create({
    data: {
      userId,
      playbookId: playbook.id,
      versionNumber: (latest?.versionNumber || 0) + 1,
      strategyExperimentId: data.strategyExperimentId || null,
      strategyRunId: data.strategyRunId || null,
      settingsSnapshot: sanitize(data.settingsSnapshot || {}),
      riskSnapshot: sanitize(data.riskSnapshot || {}),
      universeSnapshot: sanitize(data.universeSnapshot || {}),
      executionMode: data.executionMode || "MANUAL_APPROVAL",
      horizon: data.horizon || "SWING",
      benchmark: data.benchmark || "SPY",
      createdBy: userId,
      changeNote: data.changeNote || null,
    },
  });
}

async function ensureDefaultPlaybook(userId, sourceData = {}) {
  const ownerId = requireUserId(userId);
  return prisma.run(async (db) => {
    const existing = await db.playbook.findFirst({
      where: { userId: ownerId },
      orderBy: { createdAt: "asc" },
      include: { activeVersion: true },
    });
    if (existing?.activeVersion) return existing;

    return db.$transaction(async (tx) => {
      const playbook =
        existing ||
        (await tx.playbook.create({
          data: {
            userId: ownerId,
            name: "Default Trading Playbook",
            description:
              "Versioned operating record for strategy evidence, risk, approvals, and execution.",
          },
        }));
      const version = await createVersionWithClient(tx, ownerId, playbook, {
        ...getVersionSnapshot(sourceData),
        changeNote: existing
          ? "Initialized versioned history"
          : "Initial playbook version",
      });
      await tx.playbook.update({
        where: { id: playbook.id },
        data: { activeVersionId: version.id },
      });
      return tx.playbook.findUnique({
        where: { id: playbook.id },
        include: { activeVersion: true },
      });
    });
  });
}

async function createVersion(userId, playbookId, data) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.$transaction(async (tx) => {
      const playbook = await tx.playbook.findFirst({
        where: { id: playbookId, userId: ownerId },
      });
      if (!playbook) throw Object.assign(new Error("Playbook not found."), { statusCode: 404 });

      if (data.strategyExperimentId) {
        const strategy = await tx.strategyExperiment.findFirst({
          where: { id: data.strategyExperimentId, userId: ownerId },
        });
        if (!strategy) throw Object.assign(new Error("Strategy not found."), { statusCode: 404 });
      }
      if (data.strategyRunId) {
        const run = await tx.strategyRun.findFirst({
          where: { id: data.strategyRunId, userId: ownerId },
        });
        if (!run) throw Object.assign(new Error("Strategy run not found."), { statusCode: 404 });
      }
      return createVersionWithClient(tx, ownerId, playbook, data);
    })
  );
}

async function createPlaybook(userId, data = {}) {
  const ownerId = requireUserId(userId);
  const name = String(data.name || "").trim();
  if (!name) {
    throw Object.assign(new Error("Playbook name is required."), { statusCode: 400 });
  }
  return prisma.run((db) =>
    db.$transaction(async (tx) => {
      const playbook = await tx.playbook.create({
        data: {
          userId: ownerId,
          name,
          description: String(data.description || "").trim() || null,
        },
      });
      const version = await createVersionWithClient(tx, ownerId, playbook, {
        settingsSnapshot: data.settingsSnapshot || {},
        riskSnapshot: data.riskSnapshot || {},
        universeSnapshot: data.universeSnapshot || {},
        executionMode: data.executionMode || "MANUAL_APPROVAL",
        horizon: data.horizon || "SWING",
        benchmark: data.benchmark || "SPY",
        strategyExperimentId: data.strategyExperimentId || null,
        strategyRunId: data.strategyRunId || null,
        changeNote: data.changeNote || "Initial playbook version",
      });
      await tx.playbook.update({
        where: { id: playbook.id },
        data: { activeVersionId: version.id },
      });
      return { ...playbook, activeVersionId: version.id, activeVersion: version };
    })
  );
}

async function listPlaybooks(userId) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.playbook.findMany({
      where: { userId: ownerId },
      include: { activeVersion: true },
      orderBy: { updatedAt: "desc" },
    })
  );
}

async function syncPlaybook(userId, sourceData, requestedPlaybookId) {
  const ownerId = requireUserId(userId);
  const ensured = requestedPlaybookId
    ? null
    : await ensureDefaultPlaybook(ownerId, sourceData);
  return prisma.run((db) =>
    db.$transaction(async (tx) => {
      const playbook = await tx.playbook.findFirst({
        where: {
          id: requestedPlaybookId || ensured.id,
          userId: ownerId,
        },
        include: {
          activeVersion: {
            include: { strategyRun: true },
          },
        },
      });
      if (!playbook?.activeVersion) {
        throw Object.assign(new Error("Playbook has no active version."), {
          statusCode: 409,
        });
      }

      const latestScan = await tx.scan.findFirst({
        where: { userId: ownerId },
        orderBy: { generatedAt: "desc" },
        select: { id: true },
      });
      const run = await tx.playbookRun.create({
        data: {
          userId: ownerId,
          playbookId: playbook.id,
          playbookVersionId: playbook.activeVersion.id,
          ...buildRunData(
            { ...sourceData, latestScanId: latestScan?.id || null },
            playbook.activeVersion
          ),
        },
      });
      const runs = await tx.playbookRun.findMany({
        where: {
          userId: ownerId,
          playbookVersionId: playbook.activeVersion.id,
        },
        orderBy: { createdAt: "asc" },
      });
      const evidenceResult = buildDeterministicInsights(runs);
      if (evidenceResult.insights.length) {
        await tx.playbookInsight.createMany({
          data: evidenceResult.insights.map((insight) => ({
            userId: ownerId,
            playbookId: playbook.id,
            playbookVersionId: playbook.activeVersion.id,
            insightType: insight.insightType,
            type: insight.type,
            title: insight.title,
            value: insight.value,
            confidence: insight.confidence,
            explanation: insight.explanation,
            metadata: insight.metadata,
            formula: insight.formula,
            sampleSize: insight.sampleSize,
            reliability: insight.reliability,
            supportingRunIds: insight.supportingRunIds,
          })),
        });
      }
      return { playbook, run, evidence: evidenceResult.evidence };
    })
  );
}

async function getPlaybookDashboard(userId, _sourceData = {}, playbookId) {
  const ownerId = requireUserId(userId);
  const ensured = playbookId ? null : await ensureDefaultPlaybook(ownerId, _sourceData);
  return prisma.run(async (db) => {
    const playbook = await db.playbook.findFirst({
      where: { id: playbookId || ensured.id, userId: ownerId },
      include: { activeVersion: true },
    });
    if (!playbook) throw Object.assign(new Error("Playbook not found."), { statusCode: 404 });

    const [versions, runs, insights, recommendations, exports] = await Promise.all([
      db.playbookVersion.findMany({
        where: { userId: ownerId, playbookId: playbook.id },
        orderBy: { versionNumber: "desc" },
      }),
      db.playbookRun.findMany({
        where: { userId: ownerId, playbookId: playbook.id },
        orderBy: { createdAt: "desc" },
        take: 250,
      }),
      db.playbookInsight.findMany({
        where: {
          userId: ownerId,
          playbookId: playbook.id,
          playbookVersionId: playbook.activeVersionId,
          reliability: { not: "LEGACY_UNVERIFIED" },
        },
        orderBy: { generatedAt: "desc" },
        take: 100,
      }),
      db.playbookRecommendation.findMany({
        where: {
          userId: ownerId,
          playbookVersion: { playbookId: playbook.id },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.playbookExport.findMany({
        where: { userId: ownerId, playbookId: playbook.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    const activeRuns = runs.filter(
      (run) => run.playbookVersionId === playbook.activeVersionId
    );
    const evidence = calculateEvidence(activeRuns);
    const latestRun = activeRuns[0] || null;
    const orderedRuns = activeRuns.slice().reverse();
    const versionCards = versions.map((version) => {
      const versionRuns = runs.filter(
        (run) => run.playbookVersionId === version.id
      );
      const latest = versionRuns[0] || null;
      return {
        ...version,
        isActive: version.id === playbook.activeVersionId,
        return: latest?.totalReturn ?? null,
        sharpe: latest?.sharpe ?? null,
        evidenceScore: calculateEvidence(versionRuns).score,
        runCount: versionRuns.length,
      };
    });

    return {
      generated_at: new Date().toISOString(),
      dataSource: "PRISMA",
      degradedMode: false,
      playbook,
      active_version: playbook.activeVersion,
      overview: {
        description: playbook.description,
        active_settings: playbook.activeVersion?.settingsSnapshot || {},
        execution_mode: playbook.activeVersion?.executionMode || "UNKNOWN",
        horizon: playbook.activeVersion?.horizon || "UNKNOWN",
        versions: versions.length,
        runs: activeRuns.length,
        evidence_score: evidence.score,
        deployment_readiness: evidence.eligible ? "EVIDENCE_READY" : "BUILDING_EVIDENCE",
      },
      evidence,
      performance: {
        total_return: latestRun?.totalReturn ?? null,
        cagr: latestRun?.cagr ?? null,
        sharpe: latestRun?.sharpe ?? null,
        sortino: latestRun?.sortino ?? null,
        drawdown: latestRun?.drawdown ?? null,
        expectancy: latestRun?.expectancy ?? null,
        trades: latestRun?.trades ?? null,
        profit_factor: latestRun?.profitFactor ?? null,
        alpha: latestRun?.alpha ?? null,
        equity_curve: orderedRuns.map((run) => ({
          label: new Date(run.createdAt).toLocaleDateString(),
          value: run.totalReturn,
        })),
        drawdown_curve: orderedRuns.map((run) => ({
          label: new Date(run.createdAt).toLocaleDateString(),
          drawdown: run.drawdown,
        })),
      },
      versions: versionCards,
      snapshots: versionCards,
      recent_runs: runs,
      insights,
      recommendations,
      exports,
      audit_trail: [
        ...versions.map((version) => ({
          type: version.id === playbook.activeVersionId ? "ACTIVE_VERSION" : "VERSION",
          title: `Version ${version.versionNumber}: ${version.changeNote || "No change note"}`,
          created_at: version.createdAt,
        })),
        ...runs.map((run) => ({
          type: "RUN",
          title: `Evidence run ${run.id}`,
          created_at: run.createdAt,
        })),
        ...recommendations.map((item) => ({
          type: `RECOMMENDATION_${item.status}`,
          title: `${item.source} recommendation`,
          created_at: item.createdAt,
        })),
        ...exports.map((item) => ({
          type: "EXPORT",
          title: `${item.format.toUpperCase()} export`,
          created_at: item.createdAt,
        })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    };
  });
}

async function rebuildEvidence(userId, playbookId, versionId) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.$transaction(async (tx) => {
      const version = await tx.playbookVersion.findFirst({
        where: {
          id: versionId,
          playbookId,
          userId: ownerId,
        },
      });
      if (!version) {
        throw Object.assign(new Error("Playbook version not found."), {
          statusCode: 404,
        });
      }
      const runs = await tx.playbookRun.findMany({
        where: { userId: ownerId, playbookVersionId: version.id },
        orderBy: { createdAt: "asc" },
      });
      const result = buildDeterministicInsights(runs);
      if (result.insights.length) {
        await tx.playbookInsight.createMany({
          data: result.insights.map((insight) => ({
            userId: ownerId,
            playbookId,
            playbookVersionId: version.id,
            insightType: insight.insightType,
            type: insight.type,
            title: insight.title,
            value: insight.value,
            confidence: insight.confidence,
            explanation: insight.explanation,
            metadata: insight.metadata,
            formula: insight.formula,
            sampleSize: insight.sampleSize,
            reliability: insight.reliability,
            supportingRunIds: insight.supportingRunIds,
          })),
        });
      }
      return result;
    })
  );
}

function deepDiff(left, right, path = "") {
  const keys = new Set([
    ...Object.keys(left && typeof left === "object" ? left : {}),
    ...Object.keys(right && typeof right === "object" ? right : {}),
  ]);
  return [...keys].flatMap((key) => {
    const nextPath = path ? `${path}.${key}` : key;
    const before = left?.[key];
    const after = right?.[key];
    if (
      before &&
      after &&
      typeof before === "object" &&
      typeof after === "object" &&
      !Array.isArray(before) &&
      !Array.isArray(after)
    ) {
      return deepDiff(before, after, nextPath);
    }
    return JSON.stringify(before) === JSON.stringify(after)
      ? []
      : [{ path: nextPath, before: before ?? null, after: after ?? null }];
  });
}

async function compareVersions(userId, playbookId, leftId, rightId) {
  const ownerId = requireUserId(userId);
  const versions = await prisma.run((db) =>
    db.playbookVersion.findMany({
      where: {
        userId: ownerId,
        playbookId,
        id: { in: [leftId, rightId] },
      },
    })
  );
  if (versions.length !== 2) {
    throw Object.assign(new Error("Both Playbook versions are required."), {
      statusCode: 404,
    });
  }
  const left = versions.find((version) => version.id === leftId);
  const right = versions.find((version) => version.id === rightId);
  return {
    left,
    right,
    differences: [
      ...deepDiff(left.settingsSnapshot, right.settingsSnapshot, "settings"),
      ...deepDiff(left.riskSnapshot, right.riskSnapshot, "risk"),
      ...deepDiff(left.universeSnapshot, right.universeSnapshot, "universe"),
      ...(left.executionMode === right.executionMode
        ? []
        : [{ path: "executionMode", before: left.executionMode, after: right.executionMode }]),
      ...(left.horizon === right.horizon
        ? []
        : [{ path: "horizon", before: left.horizon, after: right.horizon }]),
    ],
  };
}

async function cloneVersionWithClient(
  tx,
  ownerId,
  playbookId,
  versionId,
  action,
  note
) {
  const playbook = await tx.playbook.findFirst({
    where: { id: playbookId, userId: ownerId },
  });
  const source = await tx.playbookVersion.findFirst({
    where: { id: versionId, playbookId, userId: ownerId },
  });
  if (!playbook || !source) {
    throw Object.assign(new Error("Playbook version not found."), { statusCode: 404 });
  }
  const version = await createVersionWithClient(tx, ownerId, playbook, {
    ...source,
    changeNote:
      note ||
      `${action === "PROMOTE" ? "Promoted" : "Restored"} from version ${
        source.versionNumber
      }`,
  });
  if (action === "PROMOTE") {
    await tx.playbook.update({
      where: { id: playbook.id },
      data: { activeVersionId: version.id },
    });
  }
  return {
    version,
    active: action === "PROMOTE",
    message:
      action === "PROMOTE"
        ? `Version ${version.versionNumber} is now active.`
        : `Draft version ${version.versionNumber} created. Review it before promotion.`,
  };
}

async function cloneVersion(userId, playbookId, versionId, action, note) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.$transaction((tx) =>
      cloneVersionWithClient(
        tx,
        ownerId,
        playbookId,
        versionId,
        action,
        note
      )
    )
  );
}

async function createPlaybookSnapshot(userId, sourceData, playbookId) {
  const ownerId = requireUserId(userId);
  const playbook = playbookId
    ? await prisma.run((db) =>
        db.playbook.findFirst({ where: { id: playbookId, userId: ownerId } })
      )
    : await ensureDefaultPlaybook(ownerId, sourceData);
  if (!playbook) throw Object.assign(new Error("Playbook not found."), { statusCode: 404 });
  return createVersion(ownerId, playbook.id, {
    ...getVersionSnapshot(sourceData),
    changeNote: "Saved from current strategy and runtime settings",
  });
}

async function getSnapshot(userId, versionId) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.playbookVersion.findFirst({ where: { id: versionId, userId: ownerId } })
  );
}

async function generateAiPlaybookRecommendation(userId, _sourceData, playbookId) {
  const ownerId = requireUserId(userId);
  if (!aiService.isConfigured()) {
    return { generated: false, stored: false, error: "OPENAI_API_KEY is not configured." };
  }
  const dashboard = await getPlaybookDashboard(ownerId, {}, playbookId);
  if (!dashboard.active_version) {
    return { generated: false, stored: false, error: "No active Playbook version." };
  }
  if (!dashboard.evidence.eligible) {
    return {
      generated: false,
      stored: false,
      error: "Evidence thresholds must be met before requesting an AI review.",
      evidence: dashboard.evidence,
    };
  }
  const input = sanitize({
    playbook: {
      name: dashboard.playbook.name,
      description: dashboard.playbook.description,
      activeVersion: dashboard.active_version.versionNumber,
    },
    aggregatedMetrics: dashboard.performance,
    strategySummary: dashboard.active_version.settingsSnapshot,
    validatedInsights: dashboard.insights.map((insight) => ({
      type: insight.type,
      title: insight.title,
      explanation: insight.explanation,
      sampleSize: insight.sampleSize,
      reliability: insight.reliability,
      formula: insight.formula,
    })),
  });
  try {
    const proposal = await aiService.generatePlaybookRecommendation(ownerId, input);
    const recommendation = await prisma.run((db) =>
      db.playbookRecommendation.create({
        data: {
          userId: ownerId,
          playbookVersionId: dashboard.active_version.id,
          source: "OPENAI",
          proposal: sanitize({
            suggested_changes: proposal.suggested_changes,
            reasoning: proposal.reasoning,
            expected_impact: proposal.expected_impact,
          }),
        },
      })
    );
    return { generated: true, stored: true, recommendation };
  } catch (error) {
    return {
      generated: false,
      stored: false,
      error: error.message,
    };
  }
}

async function reviewRecommendation(userId, recommendationId, action, note) {
  const ownerId = requireUserId(userId);
  const statusByAction = { accept: "ACCEPTED", reject: "REJECTED" };
  const status = statusByAction[action];
  if (!status) throw Object.assign(new Error("Invalid review action."), { statusCode: 400 });
  return prisma.run(async (db) => {
    const item = await db.playbookRecommendation.findFirst({
      where: { id: recommendationId, userId: ownerId },
    });
    if (!item) throw Object.assign(new Error("Recommendation not found."), { statusCode: 404 });
    if (item.status !== "PENDING_REVIEW") {
      throw Object.assign(new Error("Recommendation has already been reviewed."), {
        statusCode: 409,
      });
    }
    return db.playbookRecommendation.update({
      where: { id: item.id },
      data: {
        status,
        note: note || null,
        acceptedAt: status === "ACCEPTED" ? new Date() : null,
        rejectedAt: status === "REJECTED" ? new Date() : null,
      },
    });
  });
}

async function convertRecommendationToDraft(userId, recommendationId, note) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.$transaction(async (tx) => {
      const item = await tx.playbookRecommendation.findFirst({
        where: { id: recommendationId, userId: ownerId },
        include: { playbookVersion: { include: { playbook: true } } },
      });
      if (!item) throw Object.assign(new Error("Recommendation not found."), { statusCode: 404 });
      if (!["PENDING_REVIEW", "ACCEPTED"].includes(item.status)) {
        throw Object.assign(new Error("Recommendation cannot be converted."), {
          statusCode: 409,
        });
      }
      const source = item.playbookVersion;
      const suggested =
        item.proposal?.suggested_settings ||
        item.proposal?.suggested_changes ||
        {};
      const version = await createVersionWithClient(
        tx,
        ownerId,
        source.playbook,
        {
          ...source,
          settingsSnapshot: {
            ...source.settingsSnapshot,
            recommendationDraft: sanitize(suggested),
          },
          changeNote:
            note ||
            `Draft created from recommendation ${item.id}; no live settings changed`,
        }
      );
      await tx.playbookRecommendation.update({
        where: { id: item.id },
        data: {
          status: "CONVERTED_TO_DRAFT",
          acceptedAt: item.acceptedAt || new Date(),
          note: note || item.note,
        },
      });
      return { version, active: false };
    })
  );
}

function exportPlaybook(dashboard, format) {
  const payload = sanitize({
    playbook: dashboard.playbook,
    activeVersion: dashboard.active_version,
    versions: dashboard.versions,
    evidence: dashboard.evidence,
    performance: dashboard.performance,
    insights: dashboard.insights,
    recommendations: dashboard.recommendations,
    recentRuns: dashboard.recent_runs,
    auditTimeline: dashboard.audit_trail,
  });
  if (format === "json") {
    return {
      contentType: "application/json",
      filename: "playbook-report.json",
      body: JSON.stringify(payload, null, 2),
    };
  }
  if (format === "csv") {
    const rows = [
      ["section", "title", "value", "detail"],
      ["playbook", "name", payload.playbook.name, ""],
      ["evidence", "score", payload.evidence.score, payload.evidence.warnings.join("; ")],
      ...payload.versions.map((version) => [
        "version",
        `Version ${version.versionNumber}`,
        version.isActive ? "ACTIVE" : "DRAFT",
        version.changeNote || "",
      ]),
      ...payload.insights.map((insight) => [
        "insight",
        insight.title,
        insight.value || "",
        `${insight.formula || ""}; sample=${insight.sampleSize || 0}`,
      ]),
    ];
    return {
      contentType: "text/csv",
      filename: "playbook-report.csv",
      body: rows
        .map((row) =>
          row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")
        )
        .join("\n"),
    };
  }
  return {
    contentType: "text/markdown",
    filename: "playbook-report.md",
    body: [
      `# ${payload.playbook.name}`,
      "",
      payload.playbook.description || "",
      "",
      `- Active version: ${payload.activeVersion?.versionNumber || "None"}`,
      `- Evidence score: ${payload.evidence.score}/100`,
      `- Deployment readiness: ${payload.overview?.deployment_readiness || (payload.evidence.eligible ? "Evidence ready" : "Building evidence")}`,
      "",
      "## Versions",
      ...payload.versions.map(
        (version) =>
          `- Version ${version.versionNumber}${version.isActive ? " (active)" : ""}: ${version.changeNote || "No note"}`
      ),
      "",
      "## Deterministic Insights",
      ...(payload.insights.length
        ? payload.insights.map(
            (insight) =>
              `- **${insight.title}**: ${insight.explanation} Formula: ${insight.formula}. Sample: ${insight.sampleSize}.`
          )
        : ["- Evidence requirements are not met; no insights generated."]),
    ].join("\n"),
  };
}

async function recordPlaybookExport(userId, playbookId, exported, format, metadata = {}) {
  const ownerId = requireUserId(userId);
  return prisma.run((db) =>
    db.playbookExport.create({
      data: {
        userId: ownerId,
        playbookId,
        format,
        filename: exported.filename,
        metadata: sanitize(metadata),
      },
    })
  );
}

module.exports = {
  _test: {
    cloneVersionWithClient,
    createVersionWithClient,
    deepDiff,
  },
  EVIDENCE_REQUIREMENTS,
  buildDeterministicInsights,
  calculateEvidence,
  compareVersions,
  convertRecommendationToDraft,
  createPlaybook,
  createPlaybookSnapshot,
  createVersion,
  ensureDefaultPlaybook,
  exportPlaybook,
  generateAiPlaybookRecommendation,
  getPlaybookDashboard,
  getSnapshot,
  listPlaybooks,
  promoteVersion: (userId, playbookId, versionId, note) =>
    cloneVersion(userId, playbookId, versionId, "PROMOTE", note),
  recordPlaybookExport,
  rebuildEvidence,
  restoreVersion: (userId, playbookId, versionId, note) =>
    cloneVersion(userId, playbookId, versionId, "RESTORE", note),
  reviewRecommendation,
  syncPlaybook,
};
