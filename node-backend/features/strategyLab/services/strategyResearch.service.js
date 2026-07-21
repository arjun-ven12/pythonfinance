const path = require("node:path");

const strategyJsonContract = require(path.join(
  __dirname,
  "../../../../shared/strategyJson.contract.json"
));
const {
  buildEvidenceCatalog,
  buildNoEvidenceLimitation,
  normalizeEvidenceReferences,
} = require("./strategyCopilotEvidence.service");

function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function truncateArray(items = [], limit = 12) {
  return Array.isArray(items) ? items.slice(0, limit) : [];
}

function pickMetrics(source = {}, fields = []) {
  return Object.fromEntries(
    fields
      .filter((field) => source?.[field] !== undefined && source?.[field] !== null)
      .map((field) => [field, source[field]])
  );
}

function diffSettings(previous = {}, next = {}) {
  const keys = [...new Set([...Object.keys(previous || {}), ...Object.keys(next || {})])];
  return keys
    .filter((key) => JSON.stringify(previous?.[key]) !== JSON.stringify(next?.[key]))
    .map((key) => ({
      key,
      before: previous?.[key] ?? null,
      after: next?.[key] ?? null,
    }));
}

function summarizeRun(run = {}) {
  return {
    id: run.id || null,
    createdAt: run.createdAt || null,
    metrics: pickMetrics(run, [
      "returnPct",
      "cagr",
      "sharpe",
      "sortino",
      "maxDrawdown",
      "winRate",
      "expectancy",
      "tradeCount",
      "profitFactor",
      "exposure",
      "avgHoldingPeriodDays",
    ]),
    chartArtifacts: {
      equityCurvePoints: Array.isArray(run.settingsJson?.equity_curve)
        ? run.settingsJson.equity_curve.length
        : 0,
      drawdownCurvePoints: Array.isArray(run.settingsJson?.drawdown_curve)
        ? run.settingsJson.drawdown_curve.length
        : 0,
      tradeLogCount: Array.isArray(run.settingsJson?.completed_trade_log)
        ? run.settingsJson.completed_trade_log.length
        : 0,
      monthlyReturnsCount: Array.isArray(run.settingsJson?.monthly_returns)
        ? run.settingsJson.monthly_returns.length
        : 0,
    },
    costMetrics: pickMetrics(run.settingsJson || {}, [
      "fees_paid",
      "slippage_cost",
      "capital_usage",
      "avg_trade",
    ]),
    regimeBreakdown: truncateArray(
      run.settingsJson?.regime_breakdown || [],
      10
    ),
    sectorBreakdown: truncateArray(
      run.settingsJson?.sector_breakdown || [],
      10
    ),
    validationSummary: run.settingsJson?.validation_summary || null,
    symbolResults: truncateArray(run.settingsJson?.symbol_results || [], 10),
  };
}

function summarizeSweep(sweep = {}) {
  return {
    id: sweep.id || null,
    createdAt: sweep.createdAt || null,
    totalRuns: sweep.totalRuns || 0,
    symbol: sweep.symbol || null,
    period: sweep.period || null,
    topResults: truncateArray(sweep.results || [], 8).map((result) => ({
      rank: result.rank,
      emaFast: result.emaFast,
      emaSlow: result.emaSlow,
      rsiThreshold: result.rsiThreshold,
      sharpe: result.sharpe,
      returnPct: result.returnPct,
      maxDrawdown: result.maxDrawdown,
      winRate: result.winRate,
    })),
  };
}

function summarizeVersion(version = {}) {
  return {
    id: version.id || null,
    version: version.version || null,
    createdAt: version.createdAt || null,
    changeNote: version.changeNote || null,
    evidence: deepClone(version.evidenceJson || {}),
    strategySummary: {
      template: version.settingsJson?.template || null,
      objective: version.settingsJson?.objective || null,
      marketBias: version.settingsJson?.marketBias || null,
      primaryTimeframe: version.settingsJson?.primaryTimeframe || null,
      entryTimeframe: version.settingsJson?.entryTimeframe || null,
      riskPerTrade: version.settingsJson?.riskPerTrade || null,
      emaFast: version.settingsJson?.emaFast || null,
      emaSlow: version.settingsJson?.emaSlow || null,
      rsiThreshold: version.settingsJson?.rsiThreshold || null,
    },
  };
}

function buildResearchContext(experiment = {}, extras = {}) {
  const latestRun = experiment.runs?.[0] || null;
  const latestWalkForward = experiment.walkForwardRuns?.[0] || null;
  const latestStress = experiment.stressResults?.[0] || null;
  const latestVersion = experiment.versions?.[0] || null;

  return {
    strategy: {
      id: experiment.id,
      name: experiment.name,
      description: experiment.description || "",
      status: experiment.status || "DRAFT",
      settings: deepClone(experiment.settingsJson || {}),
      latestVersion: summarizeVersion(latestVersion || {}),
    },
    latestBacktest: latestRun ? summarizeRun(latestRun) : null,
    robustness: deepClone(experiment.settingsJson?.robustness || null),
    deploymentReadiness: deepClone(experiment.settingsJson?.deploymentReadiness || null),
    latestWalkForward: latestWalkForward
      ? {
          id: latestWalkForward.id,
          createdAt: latestWalkForward.createdAt,
          oosReturn: latestWalkForward.oosReturn,
          oosSharpe: latestWalkForward.oosSharpe,
          oosDrawdown: latestWalkForward.oosDrawdown,
          stabilityScore: latestWalkForward.stabilityScore,
          summary: deepClone(latestWalkForward.summaryJson || {}),
          segments: truncateArray(latestWalkForward.segments || [], 12),
        }
      : null,
    latestStressTest: latestStress
      ? {
          id: latestStress.id,
          createdAt: latestStress.createdAt,
          bestReturn: latestStress.bestReturn,
          medianReturn: latestStress.medianReturn,
          worstReturn: latestStress.worstReturn,
          probability20Drawdown: latestStress.probability20Drawdown,
        }
      : null,
    latestSweep: experiment.parameterSweeps?.[0]
      ? summarizeSweep(experiment.parameterSweeps[0])
      : null,
    memory: deepClone(extras.memory || null),
    lifecycle: deepClone(extras.lifecycle || null),
    matrixReplay: deepClone(extras.matrixReplay || null),
    portfolioSimulation: deepClone(extras.portfolioSimulation || null),
    regimeAnalysis: deepClone(extras.regimeAnalysis || null),
    explicitWalkForwardResult: deepClone(extras.walkForwardResult || null),
    explicitStressResult: deepClone(extras.stressResult || null),
    explicitRobustnessResult: deepClone(extras.robustnessResult || null),
    chartAvailability: {
      equityCurve: Boolean(latestRun?.settingsJson?.equity_curve?.length),
      drawdownCurve: Boolean(latestRun?.settingsJson?.drawdown_curve?.length),
      tradeDistribution: Boolean(latestRun?.settingsJson?.completed_trade_log?.length),
      monthlyReturns: Boolean(latestRun?.settingsJson?.monthly_returns?.length),
      walkForward: Boolean(latestWalkForward),
      monteCarlo: Boolean(latestStress || extras.stressResult),
      matrixReplay: Boolean(extras.matrixReplay),
      allocationResults: Boolean(extras.portfolioSimulation),
    },
  };
}

function dedupeList(items = []) {
  return [...new Set((items || []).filter(Boolean).map((item) => String(item)))];
}

function normalizeConfidenceScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  if (parsed > 0 && parsed <= 1) {
    return Math.round(parsed * 100);
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function extractAdvisory(output = {}, availableEvidence = []) {
  const evidence = normalizeEvidenceReferences(output.evidence || [], availableEvidence);
  return {
    summary: String(output.summary || ""),
    recommendation: String(output.recommendation || ""),
    reasoning: Array.isArray(output.reasoning) ? output.reasoning.map(String) : [],
    evidence,
    confidenceScore: normalizeConfidenceScore(output.confidenceScore),
    limitations: dedupeList([
      ...(Array.isArray(output.limitations) ? output.limitations : []),
      ...buildNoEvidenceLimitation(evidence),
    ]),
    nextAction: String(output.nextAction || ""),
    reasoningBreakdown: output.reasoningBreakdown || {
      evidenceBackedStatements: [],
      inferences: [],
      suggestions: [],
      unknowns: evidence.length ? [] : ["Insufficient evidence available."],
    },
  };
}

function createStrategyResearchService({
  aiService,
}) {
  function assertConfigured() {
    if (!aiService?.isConfigured?.()) {
      const error = new Error("AI strategy research copilot is not configured.");
      error.statusCode = 503;
      throw error;
    }
  }

  async function generateResearchReport(userId, experiment, extras = {}) {
    assertConfigured();
    const availableEvidence = buildEvidenceCatalog(experiment, extras);
    const report = await aiService.generateStrategyResearchReport(userId, {
      workflow: "RESEARCH_REPORT",
      context: buildResearchContext(experiment, extras),
      availableEvidence,
    });
    return {
      generatedAt: new Date().toISOString(),
      strategyId: experiment.id,
      advisory: extractAdvisory(report, availableEvidence),
      report,
      historicalContextUsed: report.historicalContextUsed,
      contractSchemaVersion: strategyJsonContract.schemaVersion,
    };
  }

  async function answerResearchQuestion(userId, experiment, question, extras = {}) {
    assertConfigured();
    const availableEvidence = buildEvidenceCatalog(experiment, extras);
    const answer = await aiService.answerStrategyResearchQuestion(userId, {
      workflow: "RESEARCH_QA",
      question,
      context: buildResearchContext(experiment, extras),
      availableEvidence,
    });
    return {
      generatedAt: new Date().toISOString(),
      strategyId: experiment.id,
      question: String(question || ""),
      advisory: extractAdvisory(answer, availableEvidence),
      answer,
      historicalContextUsed: answer.historicalContextUsed,
      contractSchemaVersion: strategyJsonContract.schemaVersion,
    };
  }

  async function compareVersions(userId, experiment, leftVersion, rightVersion, extras = {}) {
    assertConfigured();
    const availableEvidence = [
      ...buildEvidenceCatalog(
        { ...experiment, versions: [leftVersion], runs: experiment.runs || [] },
        { lifecycle: null, ...extras }
      ),
      ...buildEvidenceCatalog(
        { ...experiment, versions: [rightVersion], runs: experiment.runs || [] },
        { lifecycle: null, ...extras }
      ),
    ];
    const comparison = await aiService.compareStrategyVersions(userId, {
      workflow: "VERSION_COMPARE",
      strategy: {
        id: experiment.id,
        name: experiment.name,
      },
      leftVersion: {
        ...summarizeVersion(leftVersion),
        validation: deepClone(extras.leftValidation || null),
      },
      rightVersion: {
        ...summarizeVersion(rightVersion),
        validation: deepClone(extras.rightValidation || null),
      },
      changedFields: diffSettings(leftVersion.settingsJson || {}, rightVersion.settingsJson || {}),
      availableEvidence,
    });
    return {
      generatedAt: new Date().toISOString(),
      strategyId: experiment.id,
      leftVersionId: leftVersion.id,
      rightVersionId: rightVersion.id,
      advisory: extractAdvisory(comparison, availableEvidence),
      comparison,
      historicalContextUsed: comparison.historicalContextUsed,
      contractSchemaVersion: strategyJsonContract.schemaVersion,
    };
  }

  return {
    answerResearchQuestion,
    compareVersions,
    generateResearchReport,
  };
}

module.exports = {
  buildResearchContext,
  createStrategyResearchService,
  diffSettings,
};
