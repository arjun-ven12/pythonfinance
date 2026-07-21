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

const FIELD_GROUPS = Object.freeze({
  template: { label: "Template", section: "settings" },
  objective: { label: "Objective", section: "settings" },
  universeType: { label: "Universe Type", section: "settings" },
  marketBias: { label: "Market", section: "settings" },
  primaryTimeframe: { label: "Primary Timeframe", section: "settings" },
  entryTimeframe: { label: "Entry Timeframe", section: "settings" },
  allowedSectors: { label: "Allowed Sectors", section: "settings" },
  allowedRegimes: { label: "Allowed Regimes", section: "settings" },
  instrumentTypes: { label: "Instrument Types", section: "settings" },
  emaFast: { label: "EMA Fast", section: "indicators" },
  emaSlow: { label: "EMA Slow", section: "indicators" },
  rsiThreshold: { label: "RSI Threshold", section: "indicators" },
  atrStopMultiple: { label: "ATR Stop Multiple", section: "risk" },
  atrTakeProfitMultiple: { label: "ATR Take Profit Multiple", section: "risk" },
  trailingStopAtrMultiple: { label: "Trailing Stop ATR Multiple", section: "risk" },
  riskPerTrade: { label: "Risk Per Trade", section: "positionSizing" },
  sizingMethod: { label: "Position Sizing Method", section: "positionSizing" },
  sizingPreviewCapital: { label: "Preview Capital", section: "positionSizing" },
  capitalSimulation: { label: "Capital Simulation", section: "positionSizing" },
  maxDrawdown: { label: "Max Drawdown", section: "validation" },
  maxPositionSize: { label: "Max Position Size", section: "validation" },
  maxSectorExposure: { label: "Max Sector Exposure", section: "validation" },
  maxDailyLoss: { label: "Max Daily Loss", section: "validation" },
  signalThreshold: { label: "Signal Threshold", section: "validation" },
  regimeFilter: { label: "Regime Filter", section: "risk" },
  newsFilter: { label: "News Filter", section: "risk" },
  marketHoursOnly: { label: "Market Hours Only", section: "risk" },
  earningsFilter: { label: "Earnings Filter", section: "risk" },
  holdingPeriodDays: { label: "Holding Period Days", section: "validation" },
  volatilityMin: { label: "Minimum Volatility", section: "validation" },
  volatilityMax: { label: "Maximum Volatility", section: "validation" },
  liquidityFloor: { label: "Liquidity Floor", section: "validation" },
});

function deepClone(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function toStringValue(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return String(fallback);
  }
  return String(value);
}

function toNumberString(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : String(fallback);
}

function toBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function toStringList(value, fallback = []) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : fallback;
}

function normalizeRegimeOverlays(overlays = {}) {
  if (!overlays || typeof overlays !== "object" || Array.isArray(overlays)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(overlays)
      .filter(([, config]) => config && typeof config === "object" && !Array.isArray(config))
      .map(([regime, config]) => [
        regime,
        Object.fromEntries(
          Object.entries(config)
            .filter(([, value]) => value !== undefined && value !== null && value !== "")
            .map(([key, value]) => [key, Number.isFinite(Number(value)) ? String(value) : value])
        ),
      ])
  );
}

function normalizeRule(rule = {}) {
  return {
    id: String(rule.id || `ai-rule-${Math.random().toString(36).slice(2, 10)}`),
    group: String(rule.group || "Signal"),
    operator: String(rule.operator || "AND"),
    left: String(rule.left || ""),
    comparator: String(rule.comparator || ">"),
    right: rule.right === undefined || rule.right === null ? "" : String(rule.right),
    connector: String(
      rule.connector || (String(rule.group || "").toUpperCase() === "EXIT" ? "MANAGE" : "AND")
    ),
  };
}

function normalizeBuilderSettings(builderDraft = {}, existingSettings = {}, prompt = "") {
  return {
    ...deepClone(existingSettings || {}),
    objective: toStringValue(builderDraft.objective, existingSettings.objective || "max_risk_adjusted_return"),
    template: toStringValue(builderDraft.template, existingSettings.template || "Custom"),
    universeType: toStringValue(builderDraft.universeType, existingSettings.universeType || "CUSTOM_SCREEN"),
    marketBias: toStringValue(builderDraft.marketBias, existingSettings.marketBias || "US"),
    primaryTimeframe: toStringValue(builderDraft.primaryTimeframe, existingSettings.primaryTimeframe || "1D"),
    entryTimeframe: toStringValue(builderDraft.entryTimeframe, existingSettings.entryTimeframe || "1D"),
    sizingMethod: toStringValue(builderDraft.sizingMethod, existingSettings.sizingMethod || "risk_per_trade"),
    sizingPreviewCapital: toNumberString(builderDraft.sizingPreviewCapital, existingSettings.sizingPreviewCapital || 50000),
    capitalSimulation: toNumberString(builderDraft.capitalSimulation, existingSettings.capitalSimulation || existingSettings.sizingPreviewCapital || 50000),
    maxDrawdown: toNumberString(builderDraft.maxDrawdown, existingSettings.maxDrawdown || 12),
    maxPositionSize: toNumberString(builderDraft.maxPositionSize, existingSettings.maxPositionSize || 8),
    maxSectorExposure: toNumberString(builderDraft.maxSectorExposure, existingSettings.maxSectorExposure || 30),
    maxDailyLoss: toNumberString(builderDraft.maxDailyLoss, existingSettings.maxDailyLoss || 3),
    robustnessMode: Boolean(existingSettings.robustnessMode),
    strategyPrompt: String(prompt || existingSettings.strategyPrompt || ""),
    emaFast: toNumberString(builderDraft.emaFast, existingSettings.emaFast || 20),
    emaSlow: toNumberString(builderDraft.emaSlow, existingSettings.emaSlow || 50),
    rsiThreshold: toNumberString(builderDraft.rsiThreshold, existingSettings.rsiThreshold || 55),
    atrStopMultiple: toNumberString(builderDraft.atrStopMultiple, existingSettings.atrStopMultiple || 1.5),
    atrTakeProfitMultiple: toNumberString(builderDraft.atrTakeProfitMultiple, existingSettings.atrTakeProfitMultiple || 8),
    trailingStopAtrMultiple: toNumberString(builderDraft.trailingStopAtrMultiple, existingSettings.trailingStopAtrMultiple || 2),
    riskPerTrade: toNumberString(builderDraft.riskPerTrade, existingSettings.riskPerTrade || 0.01),
    signalThreshold: toNumberString(builderDraft.signalThreshold, existingSettings.signalThreshold || 60),
    technicalWeight: toNumberString(builderDraft.technicalWeight, existingSettings.technicalWeight || 0.45),
    regimeWeight: toNumberString(builderDraft.regimeWeight, existingSettings.regimeWeight || 0.25),
    newsWeight: toNumberString(builderDraft.newsWeight, existingSettings.newsWeight || 0.15),
    openaiWeight: toNumberString(builderDraft.openaiWeight, existingSettings.openaiWeight || 0.15),
    regimeFilter: toBoolean(builderDraft.regimeFilter, existingSettings.regimeFilter ?? true),
    newsFilter: toBoolean(builderDraft.newsFilter, existingSettings.newsFilter ?? false),
    marketHoursOnly: toBoolean(builderDraft.marketHoursOnly, existingSettings.marketHoursOnly ?? true),
    earningsFilter: toBoolean(builderDraft.earningsFilter, existingSettings.earningsFilter ?? true),
    universeId: toStringValue(builderDraft.universeId, existingSettings.universeId || ""),
    universeName: toStringValue(builderDraft.universeName, existingSettings.universeName || ""),
    allowedSectors: toStringList(builderDraft.allowedSectors, String(existingSettings.allowedSectors || "").split(",").map((item) => item.trim()).filter(Boolean)).join(", "),
    allowedRegimes: toStringList(builderDraft.allowedRegimes, String(existingSettings.allowedRegimes || "").split(",").map((item) => item.trim()).filter(Boolean)).join(", "),
    instrumentTypes: toStringList(builderDraft.instrumentTypes, String(existingSettings.instrumentTypes || "").split(",").map((item) => item.trim()).filter(Boolean)).join(", "),
    volatilityMin: toNumberString(builderDraft.volatilityMin, existingSettings.volatilityMin || 0),
    volatilityMax: toNumberString(builderDraft.volatilityMax, existingSettings.volatilityMax || 0.03),
    liquidityFloor: toNumberString(builderDraft.liquidityFloor, existingSettings.liquidityFloor || 1000000),
    holdingPeriodDays: toNumberString(builderDraft.holdingPeriodDays, existingSettings.holdingPeriodDays || 15),
    regimeOverlays: normalizeRegimeOverlays(builderDraft.regimeOverlays || existingSettings.regimeOverlays || {}),
    allocationMatrix: deepClone(existingSettings.allocationMatrix || {}),
    rules: (Array.isArray(builderDraft.rules) ? builderDraft.rules : existingSettings.rules || []).map(normalizeRule),
  };
}

function describeRule(rule = {}) {
  const left = String(rule.left || "Rule");
  const comparator = String(rule.comparator || ">");
  const right = String(rule.right || "");
  return `${left} ${comparator}${right ? ` ${right}` : ""}`.trim();
}

function buildRuleDiff(beforeRules = [], afterRules = []) {
  const beforeSet = new Set(beforeRules.map((rule) => JSON.stringify(rule)));
  const afterSet = new Set(afterRules.map((rule) => JSON.stringify(rule)));

  const added = afterRules
    .filter((rule) => !beforeSet.has(JSON.stringify(rule)))
    .map(describeRule);
  const removed = beforeRules
    .filter((rule) => !afterSet.has(JSON.stringify(rule)))
    .map(describeRule);

  const changed = [];
  const length = Math.min(beforeRules.length, afterRules.length);
  for (let index = 0; index < length; index += 1) {
    if (JSON.stringify(beforeRules[index]) !== JSON.stringify(afterRules[index])) {
      changed.push({
        before: describeRule(beforeRules[index]),
        after: describeRule(afterRules[index]),
      });
    }
  }

  return { added, removed, changed };
}

function buildSettingsDiff(beforeSettings = {}, afterSettings = {}) {
  return Object.entries(FIELD_GROUPS).flatMap(([field, meta]) => {
    const before = beforeSettings[field];
    const after = afterSettings[field];
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return [];
    }
    return [{
      field,
      label: meta.label,
      section: meta.section,
      before: before ?? null,
      after: after ?? null,
    }];
  });
}

function buildStrategyDiff(beforeForm, afterForm) {
  const settingsChanges = buildSettingsDiff(beforeForm.settings || {}, afterForm.settings || {});
  const ruleDiff = buildRuleDiff(beforeForm.settings?.rules || [], afterForm.settings?.rules || []);

  return {
    summary: [
      ...settingsChanges.map((change) => `${change.label}: ${String(change.before)} -> ${String(change.after)}`),
      ...ruleDiff.added.map((rule) => `Added rule: ${rule}`),
      ...ruleDiff.removed.map((rule) => `Removed rule: ${rule}`),
      ...ruleDiff.changed.map((change) => `Changed rule: ${change.before} -> ${change.after}`),
    ],
    settingsChanges,
    indicatorChanges: settingsChanges.filter((change) => change.section === "indicators"),
    validationChanges: settingsChanges.filter((change) => change.section === "validation"),
    riskChanges: settingsChanges.filter((change) => change.section === "risk"),
    positionSizingChanges: settingsChanges.filter((change) => change.section === "positionSizing"),
    rulesAdded: ruleDiff.added,
    rulesRemoved: ruleDiff.removed,
    rulesChanged: ruleDiff.changed,
  };
}

function toExperimentForm(experiment = {}, compiledSettings) {
  return {
    name: String(experiment.name || ""),
    description: String(experiment.description || ""),
    status: String(experiment.status || "DRAFT"),
    settings: deepClone(compiledSettings || experiment.settingsJson || {}),
  };
}

function buildStrategyContext(experiment = {}) {
  const latestRun = Array.isArray(experiment.runs) ? experiment.runs[0] : null;
  const latestVersion = Array.isArray(experiment.versions) ? experiment.versions[0] : null;

  return {
    id: experiment.id,
    name: experiment.name,
    description: experiment.description,
    status: experiment.status,
    latestVersion: latestVersion
      ? {
          id: latestVersion.id,
          version: latestVersion.version,
          changeNote: latestVersion.changeNote || "",
          createdAt: latestVersion.createdAt || null,
        }
      : null,
    latestRun: latestRun
      ? {
          id: latestRun.id,
          createdAt: latestRun.createdAt,
          returnPct: latestRun.returnPct,
          sharpe: latestRun.sharpe,
          maxDrawdown: latestRun.maxDrawdown,
          winRate: latestRun.winRate,
          expectancy: latestRun.expectancy,
          tradeCount: latestRun.tradeCount,
        }
      : null,
    strategyJson: deepClone(experiment.settingsJson?.strategyJson || null),
    settings: deepClone(experiment.settingsJson || null),
  };
}

function createEmptyProposalResponse(review, prompt) {
  const availableEvidence = [];
  return {
    generatedAt: new Date().toISOString(),
    prompt: String(prompt || ""),
    status: String(review.status || "UNSUPPORTED"),
    canApprove: false,
    review,
    historicalContextUsed: review.historicalContextUsed,
    advisory: extractAdvisory(review, availableEvidence),
    diff: null,
    draft: null,
    contractSchemaVersion: strategyJsonContract.schemaVersion,
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

function createStrategyCopilotService({
  aiService,
  buildStrategyExperimentSettings,
  validateStrategyDsl,
}) {
  function assertConfigured() {
    if (!aiService?.isConfigured?.()) {
      const error = new Error("AI strategy copilot is not configured.");
      error.statusCode = 503;
      throw error;
    }
  }

  function compileExperimentForm(form) {
    const compiledSettings = buildStrategyExperimentSettings({
      name: form.name,
      description: form.description,
      status: form.status,
      settings: form.settings,
    });
    validateStrategyDsl(compiledSettings.strategyJson);
    return {
      ...form,
      settings: compiledSettings,
    };
  }

  async function explainStrategy(userId, experiment) {
    assertConfigured();
    const availableEvidence = buildEvidenceCatalog(experiment);
    const review = await aiService.explainStrategy(userId, {
      workflow: "EXPLAIN",
      strategy: buildStrategyContext(experiment),
      availableEvidence,
    });
    return {
      generatedAt: new Date().toISOString(),
      strategyId: experiment.id,
      advisory: extractAdvisory(review, availableEvidence),
      explanation: review,
      historicalContextUsed: review.historicalContextUsed,
      contractSchemaVersion: strategyJsonContract.schemaVersion,
    };
  }

  async function reviewStrategy(userId, experiment) {
    assertConfigured();
    const availableEvidence = buildEvidenceCatalog(experiment);
    const review = await aiService.reviewStrategy(userId, {
      workflow: "REVIEW",
      strategy: buildStrategyContext(experiment),
      availableEvidence,
    });
    return {
      generatedAt: new Date().toISOString(),
      strategyId: experiment.id,
      advisory: extractAdvisory(review, availableEvidence),
      review,
      historicalContextUsed: review.historicalContextUsed,
      contractSchemaVersion: strategyJsonContract.schemaVersion,
    };
  }

  async function answerStrategyQuestion(userId, experiment, question) {
    assertConfigured();
    const availableEvidence = buildEvidenceCatalog(experiment);
    const answer = await aiService.answerStrategyQuestion(userId, {
      workflow: "QUESTION",
      question,
      strategy: buildStrategyContext(experiment),
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

  async function compareStrategies(userId, leftExperiment, rightExperiment) {
    assertConfigured();
    const availableEvidence = [
      ...buildEvidenceCatalog(leftExperiment),
      ...buildEvidenceCatalog(rightExperiment),
    ];
    const comparison = await aiService.compareStrategiesCopilot(userId, {
      workflow: "COMPARE",
      leftStrategy: buildStrategyContext(leftExperiment),
      rightStrategy: buildStrategyContext(rightExperiment),
      availableEvidence,
    });
    return {
      generatedAt: new Date().toISOString(),
      leftStrategyId: leftExperiment.id,
      rightStrategyId: rightExperiment.id,
      advisory: extractAdvisory(comparison, availableEvidence),
      comparison,
      historicalContextUsed: comparison.historicalContextUsed,
      contractSchemaVersion: strategyJsonContract.schemaVersion,
    };
  }

  async function proposeStrategyEdit(userId, experiment, prompt) {
    assertConfigured();

    const currentCompiledSettings = buildStrategyExperimentSettings({
      name: experiment.name,
      description: experiment.description,
      status: experiment.status,
      settings: experiment.settingsJson || {},
    });
    const currentForm = toExperimentForm(experiment, currentCompiledSettings);
    const availableEvidence = buildEvidenceCatalog({
      ...experiment,
      settingsJson: currentCompiledSettings,
    });

    const review = await aiService.proposeStrategyEdit(userId, {
      workflow: "MODIFY",
      prompt,
      strategy: buildStrategyContext({
        ...experiment,
        settingsJson: currentCompiledSettings,
      }),
      availableEvidence,
    });

    if (String(review.status || "").toUpperCase() !== "READY" || (review.unsupportedElements || []).length > 0) {
      return createEmptyProposalResponse(review, prompt);
    }

    const nextSettings = normalizeBuilderSettings(
      review.builderDraft || {},
      currentCompiledSettings,
      prompt
    );
    if (!nextSettings.rules?.length) {
      throw new Error("AI strategy proposal did not include executable rules.");
    }

    const nextForm = compileExperimentForm({
      name: String(review.title || experiment.name || "AI Strategy Proposal"),
      description: String(review.description || experiment.description || ""),
      status: String(experiment.status || "DRAFT"),
      settings: nextSettings,
    });
    const diff = buildStrategyDiff(currentForm, nextForm);

    return {
      generatedAt: new Date().toISOString(),
      prompt: String(prompt || ""),
      status: "READY",
      canApprove: true,
      advisory: extractAdvisory(review, availableEvidence),
      review,
      historicalContextUsed: review.historicalContextUsed,
      diff,
      draft: {
        before: currentForm,
        after: nextForm,
        strategyJson: nextForm.settings.strategyJson,
        dslValidation: nextForm.settings.dslValidation,
      },
      contractSchemaVersion: strategyJsonContract.schemaVersion,
    };
  }

  return {
    answerStrategyQuestion,
    compareStrategies,
    explainStrategy,
    proposeStrategyEdit,
    reviewStrategy,
  };
}

module.exports = {
  createStrategyCopilotService,
};
