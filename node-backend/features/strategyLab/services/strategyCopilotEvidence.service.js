const EVIDENCE_SOURCE_TYPES = Object.freeze([
  "BACKTEST",
  "WALK_FORWARD",
  "MONTE_CARLO",
  "ROBUSTNESS",
  "MATRIX_REPLAY",
  "PORTFOLIO_SIMULATION",
  "LIFECYCLE",
  "VERSION_HISTORY",
  "MATRIX_CONFIGURATION",
  "ALLOCATION",
  "DEPLOYMENT",
  "SCANNER",
  "PORTFOLIO",
  "VALIDATION",
]);

function stringifyMetricValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function createEvidenceItem({
  sourceType,
  sourceId = null,
  metricName,
  metricValue,
  timestamp = null,
  dateRange = null,
  interpretation,
  strength = "MEDIUM",
}) {
  const normalizedValue = stringifyMetricValue(metricValue);
  if (!sourceType || !metricName || !normalizedValue || !interpretation) {
    return null;
  }

  return {
    sourceType,
    sourceId: sourceId ? String(sourceId) : "",
    metricName: String(metricName),
    metricValue: normalizedValue,
    timestamp: timestamp ? String(timestamp) : "",
    dateRange: dateRange ? String(dateRange) : "",
    interpretation: String(interpretation),
    strength: ["HIGH", "MEDIUM", "LOW"].includes(String(strength)) ? String(strength) : "MEDIUM",
  };
}

function pushEvidence(items, payload) {
  const item = createEvidenceItem(payload);
  if (item) {
    items.push(item);
  }
}

function buildEvidenceCatalog(experiment = {}, extras = {}) {
  const items = [];
  const latestRun = experiment?.runs?.[0] || null;
  const latestWalkForward = extras.walkForwardResult?.walkForwardRun || experiment?.walkForwardRuns?.[0] || null;
  const latestStress = extras.stressResult?.stressResult || experiment?.stressResults?.[0] || null;
  const robustness = extras.robustnessResult || experiment?.settingsJson?.robustness || null;
  const latestVersion = experiment?.versions?.[0] || null;
  const lifecycle = extras.lifecycle || null;
  const matrixReplay = extras.matrixReplay || null;
  const portfolioSimulation = extras.portfolioSimulation || null;

  if (latestRun) {
    pushEvidence(items, {
      sourceType: "BACKTEST",
      sourceId: latestRun.id,
      metricName: "ReturnPct",
      metricValue: latestRun.returnPct,
      timestamp: latestRun.createdAt,
      interpretation: "Latest saved backtest total return.",
      strength: "HIGH",
    });
    pushEvidence(items, {
      sourceType: "BACKTEST",
      sourceId: latestRun.id,
      metricName: "Sharpe",
      metricValue: latestRun.sharpe,
      timestamp: latestRun.createdAt,
      interpretation: "Latest saved backtest Sharpe ratio.",
      strength: "HIGH",
    });
    pushEvidence(items, {
      sourceType: "BACKTEST",
      sourceId: latestRun.id,
      metricName: "MaxDrawdown",
      metricValue: latestRun.maxDrawdown,
      timestamp: latestRun.createdAt,
      interpretation: "Latest saved backtest maximum drawdown.",
      strength: "HIGH",
    });
    pushEvidence(items, {
      sourceType: "BACKTEST",
      sourceId: latestRun.id,
      metricName: "WinRate",
      metricValue: latestRun.winRate,
      timestamp: latestRun.createdAt,
      interpretation: "Latest saved backtest win rate.",
      strength: "MEDIUM",
    });
    pushEvidence(items, {
      sourceType: "BACKTEST",
      sourceId: latestRun.id,
      metricName: "TradeCount",
      metricValue: latestRun.tradeCount,
      timestamp: latestRun.createdAt,
      interpretation: "Latest saved backtest completed trade count.",
      strength: "HIGH",
    });
    pushEvidence(items, {
      sourceType: "BACKTEST",
      sourceId: latestRun.id,
      metricName: "ProfitFactor",
      metricValue: latestRun.profitFactor ?? latestRun.settingsJson?.profit_factor,
      timestamp: latestRun.createdAt,
      interpretation: "Latest saved backtest profit factor.",
      strength: "MEDIUM",
    });
  }

  if (latestWalkForward) {
    pushEvidence(items, {
      sourceType: "WALK_FORWARD",
      sourceId: latestWalkForward.id,
      metricName: "OOSReturn",
      metricValue: latestWalkForward.oosReturn,
      timestamp: latestWalkForward.createdAt,
      interpretation: "Most recent walk-forward out-of-sample return.",
      strength: "HIGH",
    });
    pushEvidence(items, {
      sourceType: "WALK_FORWARD",
      sourceId: latestWalkForward.id,
      metricName: "StabilityScore",
      metricValue: latestWalkForward.stabilityScore,
      timestamp: latestWalkForward.createdAt,
      interpretation: "Most recent walk-forward stability score.",
      strength: "HIGH",
    });
    pushEvidence(items, {
      sourceType: "WALK_FORWARD",
      sourceId: latestWalkForward.id,
      metricName: "OutOfRegimePass",
      metricValue: latestWalkForward.summaryJson?.outOfRegimeStability?.pass,
      timestamp: latestWalkForward.createdAt,
      interpretation: "Whether the latest walk-forward out-of-regime check passed.",
      strength: "HIGH",
    });
  }

  if (latestStress) {
    pushEvidence(items, {
      sourceType: "MONTE_CARLO",
      sourceId: latestStress.id,
      metricName: "MedianReturn",
      metricValue: latestStress.medianReturn,
      timestamp: latestStress.createdAt,
      interpretation: "Median Monte Carlo return from the latest stress run.",
      strength: "MEDIUM",
    });
    pushEvidence(items, {
      sourceType: "MONTE_CARLO",
      sourceId: latestStress.id,
      metricName: "WorstReturn",
      metricValue: latestStress.worstReturn,
      timestamp: latestStress.createdAt,
      interpretation: "Worst Monte Carlo return from the latest stress run.",
      strength: "MEDIUM",
    });
    pushEvidence(items, {
      sourceType: "MONTE_CARLO",
      sourceId: latestStress.id,
      metricName: "Probability20Drawdown",
      metricValue: latestStress.probability20Drawdown,
      timestamp: latestStress.createdAt,
      interpretation: "Probability of a 20% drawdown from the latest Monte Carlo stress run.",
      strength: "MEDIUM",
    });
  }

  if (robustness) {
    pushEvidence(items, {
      sourceType: "ROBUSTNESS",
      sourceId: experiment?.id || null,
      metricName: "Score",
      metricValue: robustness.score,
      timestamp: latestRun?.createdAt || latestVersion?.createdAt || null,
      interpretation: "Most recent robustness score stored in Strategy Lab.",
      strength: "HIGH",
    });
    pushEvidence(items, {
      sourceType: "ROBUSTNESS",
      sourceId: experiment?.id || null,
      metricName: "Rating",
      metricValue: robustness.rating,
      timestamp: latestRun?.createdAt || latestVersion?.createdAt || null,
      interpretation: "Most recent robustness rating stored in Strategy Lab.",
      strength: "MEDIUM",
    });
    pushEvidence(items, {
      sourceType: "ROBUSTNESS",
      sourceId: experiment?.id || null,
      metricName: "ParameterSensitivity",
      metricValue: robustness.parameterSensitivity,
      timestamp: latestRun?.createdAt || latestVersion?.createdAt || null,
      interpretation: "Most recent robustness parameter sensitivity reading.",
      strength: "MEDIUM",
    });
  }

  if (matrixReplay?.result?.metrics || matrixReplay?.metrics) {
    const metrics = matrixReplay.result?.metrics || matrixReplay.metrics;
    pushEvidence(items, {
      sourceType: "MATRIX_REPLAY",
      sourceId: matrixReplay.id || experiment?.id || null,
      metricName: "CombinedReturn",
      metricValue: metrics.combinedReturn ?? metrics.returnPct ?? metrics.totalReturnPct,
      interpretation: "Latest matrix replay combined return metric.",
      strength: "MEDIUM",
    });
    pushEvidence(items, {
      sourceType: "MATRIX_REPLAY",
      sourceId: matrixReplay.id || experiment?.id || null,
      metricName: "CombinedDrawdown",
      metricValue: metrics.combinedDrawdown ?? metrics.maxDrawdown,
      interpretation: "Latest matrix replay combined drawdown metric.",
      strength: "MEDIUM",
    });
  }

  if (portfolioSimulation?.metrics) {
    pushEvidence(items, {
      sourceType: "PORTFOLIO_SIMULATION",
      sourceId: portfolioSimulation.generatedAt || experiment?.id || null,
      metricName: "CombinedReturn",
      metricValue: portfolioSimulation.metrics.combinedReturn,
      interpretation: "Latest strategy portfolio simulation combined return.",
      strength: "MEDIUM",
    });
    pushEvidence(items, {
      sourceType: "PORTFOLIO_SIMULATION",
      sourceId: portfolioSimulation.generatedAt || experiment?.id || null,
      metricName: "CombinedSharpe",
      metricValue: portfolioSimulation.metrics.combinedSharpe,
      interpretation: "Latest strategy portfolio simulation combined Sharpe ratio.",
      strength: "MEDIUM",
    });
    pushEvidence(items, {
      sourceType: "PORTFOLIO_SIMULATION",
      sourceId: portfolioSimulation.generatedAt || experiment?.id || null,
      metricName: "Correlation",
      metricValue: portfolioSimulation.metrics.correlation,
      interpretation: "Latest strategy portfolio simulation average correlation.",
      strength: "LOW",
    });
  }

  if (lifecycle) {
    pushEvidence(items, {
      sourceType: "LIFECYCLE",
      sourceId: lifecycle.experimentId || experiment?.id || null,
      metricName: "Status",
      metricValue: lifecycle.status,
      interpretation: "Current lifecycle status from the Strategy Lab dashboard.",
      strength: "HIGH",
    });
    pushEvidence(items, {
      sourceType: "LIFECYCLE",
      sourceId: lifecycle.experimentId || experiment?.id || null,
      metricName: "ValidationHitRate",
      metricValue: lifecycle.realizedPerformance?.hitRate,
      interpretation: "Current realized validation hit rate from lifecycle tracking.",
      strength: "MEDIUM",
    });
    pushEvidence(items, {
      sourceType: "LIFECYCLE",
      sourceId: lifecycle.experimentId || experiment?.id || null,
      metricName: "RealizedReturn",
      metricValue: lifecycle.realizedPerformance?.realizedReturn,
      interpretation: "Current realized validation return from lifecycle tracking.",
      strength: "MEDIUM",
    });
  }

  if (latestVersion) {
    pushEvidence(items, {
      sourceType: "VERSION_HISTORY",
      sourceId: latestVersion.id,
      metricName: "LatestVersion",
      metricValue: latestVersion.version,
      timestamp: latestVersion.createdAt,
      interpretation: "Most recent saved strategy version number.",
      strength: "HIGH",
    });
    pushEvidence(items, {
      sourceType: "VERSION_HISTORY",
      sourceId: latestVersion.id,
      metricName: "ChangeNote",
      metricValue: latestVersion.changeNote,
      timestamp: latestVersion.createdAt,
      interpretation: "Most recent saved strategy version change note.",
      strength: "MEDIUM",
    });
  }

  return items;
}

function createEvidenceCatalog(items = []) {
  return new Map(
    items.map((item) => [
      `${item.sourceType}::${item.sourceId || ""}::${item.metricName}`,
      item,
    ])
  );
}

function normalizeEvidenceReferences(responseEvidence = [], availableEvidence = []) {
  if (!Array.isArray(responseEvidence) || responseEvidence.length === 0) {
    return [];
  }

  const catalog = createEvidenceCatalog(availableEvidence);
  return responseEvidence.map((item) => {
    const key = `${item?.sourceType || ""}::${item?.sourceId || ""}::${item?.metricName || ""}`;
    const match = catalog.get(key);
    if (!match) {
      const error = new Error(`AI cited unavailable evidence: ${key}.`);
      error.statusCode = 502;
      error.code = "AI_EVIDENCE_VALIDATION_ERROR";
      throw error;
    }

    if (String(item.metricValue) !== String(match.metricValue)) {
      const error = new Error(`AI cited mismatched evidence value for ${key}.`);
      error.statusCode = 502;
      error.code = "AI_EVIDENCE_VALIDATION_ERROR";
      throw error;
    }

    return {
      ...match,
      interpretation: String(item.interpretation || match.interpretation),
      strength: match.strength,
    };
  });
}

function buildNoEvidenceLimitation(evidence = []) {
  return evidence.length === 0 ? ["Insufficient evidence available."] : [];
}

module.exports = {
  EVIDENCE_SOURCE_TYPES,
  buildEvidenceCatalog,
  buildNoEvidenceLimitation,
  createEvidenceItem,
  normalizeEvidenceReferences,
};
