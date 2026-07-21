const { createAiService, createAiError, sanitizeAiInput } = require("../../features/ai/services/ai.service");
const { createOpenAIClient } = require("../../features/ai/services/ai.client");
const { createAiInvocationStore } = require("../../features/ai/services/ai.invocationStore");
const { createPromptRegistry } = require("../../features/ai/services/ai.prompts");
const {
  EVIDENCE_SOURCE_TYPES,
} = require("../../features/strategyLab/services/strategyCopilotEvidence.service");
const {
  PORTFOLIO_EVIDENCE_SOURCE_TYPES,
} = require("../../features/portfolio/services/portfolioCopilotEvidence.service");
const {
  PORTFOLIO_ACTION_TYPES,
  PORTFOLIO_ACTION_UNITS,
  PORTFOLIO_PROPOSAL_TYPES,
} = require("../../features/portfolio/services/portfolioScenarioContract");
const { RESEARCH_EVIDENCE_SOURCE_TYPES } = require("../../features/research/services/researchEvidence.service");
const { MATRIX_ACTION_TYPES, MATRIX_PROPOSAL_TYPES } = require("../../features/strategyLab/services/matrixScenarioContract");
const strategyJsonContract = require("../../../shared/strategyJson.contract.json");
const {
  validateChatPayload,
  validateNewsPayload,
  validateNewsReasoningPayload,
  validatePlaybookPayload,
  validatePortfolioPayload,
  validatePortfolioCopilotPayload,
  validatePortfolioAdvisorPayload,
  validateResearchCopilotPayload,
  validateMatrixCopilotPayload,
  validateMatrixAdvisorPayload,
  validateScannerPayload,
  validateStrategyCopilotPayload,
  validateStockPayload,
  validateStrategyDraftPayload,
  validateTradePayload,
} = require("../../features/ai/services/ai.inputValidators");

const boundedString = (maxLength = 1200) => ({ type: "string", maxLength });
const score = { type: "number", minimum: 0, maximum: 100 };
const stringList = (maxItems = 8, maxLength = 400) => ({
  type: "array",
  maxItems,
  items: boundedString(maxLength),
});
const indicatorEnum = strategyJsonContract.allowed.indicators;
const timeframeEnum = strategyJsonContract.allowed.timeframes;
const marketEnum = strategyJsonContract.allowed.markets;
const universeEnum = strategyJsonContract.allowed.universeTypes;
const sizingMethodEnum = strategyJsonContract.allowed.sizingMethods;
const regimeEnum = strategyJsonContract.allowed.regimes;
const instrumentTypeEnum = strategyJsonContract.allowed.instrumentTypes;
const strategyTemplates = [
  "Momentum",
  "Trend Following",
  "Mean Reversion",
  "Breakout",
  "Value",
  "Custom",
];
const strategyObjectives = [
  "max_risk_adjusted_return",
  "minimize_drawdown",
  "steady_income",
  "catch_breakouts",
  "custom",
];
const draftRuleLeftEnum = [
  ...indicatorEnum,
  "STOP_LOSS",
  "TAKE_PROFIT",
  "TRAILING_STOP",
  "TIME_EXIT",
  "SIGNAL_EXIT",
];
const draftComparatorEnum = [
  ">",
  ">=",
  "<",
  "<=",
  "==",
  "!=",
  "BETWEEN",
  "CROSSES_ABOVE",
  "CROSSES_BELOW",
  "IS_TRUE",
  "=",
];

function enumString(values) {
  return { type: "string", enum: values };
}

function strategyRuleSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      group: enumString(["Market", "Signal", "Entry", "Validation", "Exit", "Risk"]),
      operator: enumString(["WHEN", "AND", "OR", "NOT", "GROUP", "THEN"]),
      left: enumString(draftRuleLeftEnum),
      comparator: enumString(draftComparatorEnum),
      right: boundedString(80),
      connector: enumString(["AND", "OR", "THEN BUY", "MANAGE"]),
    },
    required: ["group", "operator", "left", "comparator", "right", "connector"],
  };
}

function strategyOverlaySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      emaFast: boundedString(20),
      emaSlow: boundedString(20),
      rsiThreshold: boundedString(20),
      atrStopMultiple: boundedString(20),
      atrTakeProfitMultiple: boundedString(20),
      trailingStopAtrMultiple: boundedString(20),
      riskPerTrade: boundedString(20),
      signalThreshold: boundedString(20),
    },
    required: [
      "emaFast",
      "emaSlow",
      "rsiThreshold",
      "atrStopMultiple",
      "atrTakeProfitMultiple",
      "trailingStopAtrMultiple",
      "riskPerTrade",
      "signalThreshold",
    ],
  };
}

function strategyBuilderDraftSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      objective: enumString(strategyObjectives),
      template: enumString(strategyTemplates),
      universeType: enumString(universeEnum),
      marketBias: enumString(marketEnum),
      primaryTimeframe: enumString(timeframeEnum),
      entryTimeframe: enumString(timeframeEnum),
      sizingMethod: enumString(sizingMethodEnum),
      sizingPreviewCapital: boundedString(20),
      capitalSimulation: boundedString(20),
      maxDrawdown: boundedString(20),
      maxPositionSize: boundedString(20),
      maxSectorExposure: boundedString(20),
      maxDailyLoss: boundedString(20),
      emaFast: boundedString(20),
      emaSlow: boundedString(20),
      rsiThreshold: boundedString(20),
      atrStopMultiple: boundedString(20),
      atrTakeProfitMultiple: boundedString(20),
      trailingStopAtrMultiple: boundedString(20),
      riskPerTrade: boundedString(20),
      signalThreshold: boundedString(20),
      technicalWeight: boundedString(20),
      regimeWeight: boundedString(20),
      newsWeight: boundedString(20),
      openaiWeight: boundedString(20),
      regimeFilter: { type: "boolean" },
      newsFilter: { type: "boolean" },
      marketHoursOnly: { type: "boolean" },
      earningsFilter: { type: "boolean" },
      universeId: boundedString(120),
      universeName: boundedString(120),
      allowedSectors: stringList(12, 80),
      allowedRegimes: {
        type: "array",
        maxItems: 6,
        items: enumString(regimeEnum),
      },
      instrumentTypes: {
        type: "array",
        maxItems: 4,
        items: enumString(instrumentTypeEnum),
      },
      volatilityMin: boundedString(20),
      volatilityMax: boundedString(20),
      liquidityFloor: boundedString(20),
      holdingPeriodDays: boundedString(20),
      regimeOverlays: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(regimeEnum.map((regime) => [regime, strategyOverlaySchema()])),
        required: regimeEnum,
      },
      rules: {
        type: "array",
        maxItems: 12,
        items: strategyRuleSchema(),
      },
    },
    required: [
      "objective",
      "template",
      "universeType",
      "marketBias",
      "primaryTimeframe",
      "entryTimeframe",
      "sizingMethod",
      "sizingPreviewCapital",
      "capitalSimulation",
      "maxDrawdown",
      "maxPositionSize",
      "maxSectorExposure",
      "maxDailyLoss",
      "emaFast",
      "emaSlow",
      "rsiThreshold",
      "atrStopMultiple",
      "atrTakeProfitMultiple",
      "trailingStopAtrMultiple",
      "riskPerTrade",
      "signalThreshold",
      "technicalWeight",
      "regimeWeight",
      "newsWeight",
      "openaiWeight",
      "regimeFilter",
      "newsFilter",
      "marketHoursOnly",
      "earningsFilter",
      "universeId",
      "universeName",
      "allowedSectors",
      "allowedRegimes",
      "instrumentTypes",
      "volatilityMin",
      "volatilityMax",
      "liquidityFloor",
      "holdingPeriodDays",
      "regimeOverlays",
      "rules",
    ],
  };
}

function evidenceItemSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      sourceType: enumString(EVIDENCE_SOURCE_TYPES),
      sourceId: boundedString(160),
      metricName: boundedString(120),
      metricValue: boundedString(160),
      timestamp: boundedString(80),
      dateRange: boundedString(80),
      interpretation: boundedString(400),
      strength: enumString(["HIGH", "MEDIUM", "LOW"]),
    },
    required: [
      "sourceType",
      "sourceId",
      "metricName",
      "metricValue",
      "timestamp",
      "dateRange",
      "interpretation",
      "strength",
    ],
  };
}

function portfolioEvidenceItemSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      sourceType: enumString(PORTFOLIO_EVIDENCE_SOURCE_TYPES),
      sourceId: boundedString(160),
      metricName: boundedString(120),
      metricValue: boundedString(160),
      symbol: boundedString(32),
      strategy: boundedString(160),
      timestamp: boundedString(80),
      dateRange: boundedString(80),
      interpretation: boundedString(400),
      strength: enumString(["HIGH", "MEDIUM", "LOW"]),
    },
    required: [
      "sourceType", "sourceId", "metricName", "metricValue", "symbol", "strategy",
      "timestamp", "dateRange", "interpretation", "strength",
    ],
  };
}

function researchEvidenceItemSchema() {
  return { type: "object", additionalProperties: false, properties: {
    sourceType: enumString(RESEARCH_EVIDENCE_SOURCE_TYPES), sourceId: boundedString(200), sourceName: boundedString(160),
    sourceQuality: enumString(["HIGH", "MEDIUM", "LOW"]), symbol: boundedString(32), sector: boundedString(100), theme: boundedString(120),
    metricName: boundedString(120), metricValue: boundedString(500), timestamp: boundedString(80), dateRange: boundedString(100),
    interpretation: boundedString(500), strength: enumString(["HIGH", "MEDIUM", "LOW"]), relevanceScore: score,
  }, required: ["sourceType", "sourceId", "sourceName", "sourceQuality", "symbol", "sector", "theme", "metricName", "metricValue", "timestamp", "dateRange", "interpretation", "strength", "relevanceScore"] };
}

function researchResponseSchema() {
  return { type: "object", additionalProperties: false, properties: {
    executiveSummary: boundedString(1800),
    keyFindings: { type: "array", maxItems: 10, items: { type: "object", additionalProperties: false, properties: {
      priority: { type: "number", minimum: 1, maximum: 10 }, title: boundedString(180), finding: boundedString(700), whyItMatters: boundedString(700),
      affectedSymbols: stringList(12, 32), affectedSectors: stringList(12, 100), classification: enumString(["CONFIRMED_FACT", "PLATFORM_METRIC", "AI_INTERPRETATION", "UNRESOLVED"]),
    }, required: ["priority", "title", "finding", "whyItMatters", "affectedSymbols", "affectedSectors", "classification"] } },
    whyItMatters: stringList(10, 500), evidence: { type: "array", maxItems: 20, items: researchEvidenceItemSchema() },
    relationshipMap: { type: "object", additionalProperties: false, properties: {
      nodes: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, properties: { id: boundedString(100), system: enumString(["NEWS", "MACRO", "MARKET", "REGIME", "SCANNER", "PORTFOLIO", "STRATEGY", "MATRIX", "WATCHLIST", "RISK", "RESEARCH"]), label: boundedString(180), classification: enumString(["FACT", "CALCULATED_METRIC", "PLATFORM_EVIDENCE", "AI_INTERPRETATION", "UNKNOWN"]) }, required: ["id", "system", "label", "classification"] } },
      edges: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, properties: { from: boundedString(100), to: boundedString(100), relationship: boundedString(300), confidence: score }, required: ["from", "to", "relationship", "confidence"] } },
    }, required: ["nodes", "edges"] },
    report: { type: "object", additionalProperties: false, properties: {
      currentSituation: stringList(8, 600), bullCase: stringList(8, 500), bearCase: stringList(8, 500), majorCatalysts: stringList(8, 500), majorRisks: stringList(8, 500), historicalContext: stringList(8, 500), macroEnvironment: stringList(8, 500), sectorAnalysis: stringList(8, 500), relevantCompanies: stringList(12, 300), keyUnknowns: stringList(10, 400),
    }, required: ["currentSituation", "bullCase", "bearCase", "majorCatalysts", "majorRisks", "historicalContext", "macroEnvironment", "sectorAnalysis", "relevantCompanies", "keyUnknowns"] },
    affectedSystems: { type: "object", additionalProperties: false, properties: { portfolio: stringList(12, 400), strategies: stringList(12, 400), matrix: stringList(12, 400), scanner: stringList(12, 400), watchlist: stringList(12, 400) }, required: ["portfolio", "strategies", "matrix", "scanner", "watchlist"] },
    risksAlternativeInterpretations: stringList(10, 500), confidenceScore: score,
    dataFreshness: { type: "object", additionalProperties: false, properties: {
      marketDataTimestamp: boundedString(80), newsTimestamp: boundedString(80), scannerTimestamp: boundedString(80), portfolioSnapshotTimestamp: boundedString(80), regimeTimestamp: boundedString(80), staleSources: stringList(10, 100),
    }, required: ["marketDataTimestamp", "newsTimestamp", "scannerTimestamp", "portfolioSnapshotTimestamp", "regimeTimestamp", "staleSources"] },
    suggestedFollowUpQuestions: stringList(8, 300), limitations: stringList(12, 400),
  }, required: ["executiveSummary", "keyFindings", "whyItMatters", "evidence", "relationshipMap", "report", "affectedSystems", "risksAlternativeInterpretations", "confidenceScore", "dataFreshness", "suggestedFollowUpQuestions", "limitations"] };
}

function researchThesisReviewSchema() {
  return { type: "object", additionalProperties: false, properties: {
    outcome: enumString(["THESIS_STRENGTHENED", "THESIS_WEAKENED", "THESIS_UNCHANGED", "INSUFFICIENT_EVIDENCE"]),
    statement: boundedString(1200), confidenceScore: score, reasoning: stringList(10, 500),
    supportingEvidence: { type: "array", maxItems: 12, items: researchEvidenceItemSchema() },
    opposingEvidence: { type: "array", maxItems: 12, items: researchEvidenceItemSchema() },
    unresolvedQuestions: stringList(10, 400),
    affectedEntities: { type: "object", additionalProperties: false, properties: { symbols: stringList(20, 32), sectors: stringList(20, 100), themes: stringList(20, 120), strategies: stringList(20, 160), matrixCells: stringList(20, 200) }, required: ["symbols", "sectors", "themes", "strategies", "matrixCells"] },
    limitations: stringList(12, 400),
  }, required: ["outcome", "statement", "confidenceScore", "reasoning", "supportingEvidence", "opposingEvidence", "unresolvedQuestions", "affectedEntities", "limitations"] };
}

function matrixCopilotResponseSchema() {
  return { type: "object", additionalProperties: false, properties: {
    executiveSummary: boundedString(1800), keyFindings: stringList(12, 500),
    matrixOverview: { type: "object", additionalProperties: false, properties: { health: enumString(["HEALTHY", "REVIEW", "WEAK", "INSUFFICIENT_EVIDENCE"]), coverageSummary: boundedString(700), allocationSummary: boundedString(700), deploymentSummary: boundedString(700), replaySummary: boundedString(700) }, required: ["health", "coverageSummary", "allocationSummary", "deploymentSummary", "replaySummary"] },
    cellAnalysis: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, properties: { cellKey: boundedString(200), sector: boundedString(100), regime: boundedString(100), status: boundedString(60), strategy: boundedString(160), finding: boundedString(600), evidenceStrength: enumString(["HIGH", "MEDIUM", "LOW", "NONE"]) }, required: ["cellKey", "sector", "regime", "status", "strategy", "finding", "evidenceStrength"] } },
    strategyAnalysis: stringList(15, 500), allocationAnalysis: stringList(12, 500), replayEvidence: stringList(12, 500), portfolioInteraction: stringList(12, 500), currentDeployment: stringList(12, 500), risks: stringList(12, 500),
    evidence: { type: "array", maxItems: 30, items: evidenceItemSchema() }, confidenceScore: score, limitations: stringList(12, 400), suggestedInvestigations: stringList(10, 400),
  }, required: ["executiveSummary", "keyFindings", "matrixOverview", "cellAnalysis", "strategyAnalysis", "allocationAnalysis", "replayEvidence", "portfolioInteraction", "currentDeployment", "risks", "evidence", "confidenceScore", "limitations", "suggestedInvestigations"] };
}

function matrixProposalActionSchema() { return { type: "object", additionalProperties: false, properties: { actionType: enumString(MATRIX_ACTION_TYPES), sector: boundedString(100), regime: boundedString(100), currentStrategyId: boundedString(160), currentStrategyVersionId: boundedString(160), proposedStrategyId: boundedString(160), proposedStrategyVersionId: boundedString(160), currentAllocation: score, proposedAllocation: score, reason: boundedString(600) }, required: ["actionType", "sector", "regime", "currentStrategyId", "currentStrategyVersionId", "proposedStrategyId", "proposedStrategyVersionId", "currentAllocation", "proposedAllocation", "reason"] }; }
function matrixProposalSchema() { return { type: "object", additionalProperties: false, properties: { proposalType: enumString(MATRIX_PROPOSAL_TYPES), title: boundedString(200), objective: boundedString(800), deploymentSetId: boundedString(160), actions: { type: "array", minItems: 1, maxItems: 30, items: matrixProposalActionSchema() }, assumptions: stringList(10, 400), evidence: { type: "array", maxItems: 20, items: evidenceItemSchema() }, confidence: score }, required: ["proposalType", "title", "objective", "deploymentSetId", "actions", "assumptions", "evidence", "confidence"] }; }
function matrixRecommendationSchema() { return { type: "object", additionalProperties: false, properties: { executiveSummary: boundedString(1400), concern: boundedString(800), recommendation: boundedString(1200), proposedActions: { type: "array", maxItems: 12, items: matrixProposalActionSchema() }, rationale: stringList(10, 500), expectedBenefits: stringList(10, 500), potentialDownsides: stringList(10, 500), assumptions: stringList(10, 400), requiredValidation: stringList(10, 400), replayAvailable: { type: "boolean" }, evidence: { type: "array", maxItems: 20, items: evidenceItemSchema() }, confidenceScore: score, limitations: stringList(10, 400) }, required: ["executiveSummary", "concern", "recommendation", "proposedActions", "rationale", "expectedBenefits", "potentialDownsides", "assumptions", "requiredValidation", "replayAvailable", "evidence", "confidenceScore", "limitations"] }; }
function matrixScenarioInterpretationSchema() { return { type: "object", additionalProperties: false, properties: { executiveSummary: boundedString(1400), matrixConcernObjective: boundedString(800), recommendation: boundedString(1000), proposedCellChanges: stringList(20, 500), comparisonFindings: stringList(15, 500), replayEvidence: stringList(12, 500), portfolioImpact: stringList(12, 500), benefits: stringList(10, 500), risksTradeoffs: stringList(12, 500), evidence: { type: "array", maxItems: 25, items: evidenceItemSchema() }, confidenceScore: score, limitations: stringList(12, 400), availableUserActions: stringList(8, 400) }, required: ["executiveSummary", "matrixConcernObjective", "recommendation", "proposedCellChanges", "comparisonFindings", "replayEvidence", "portfolioImpact", "benefits", "risksTradeoffs", "evidence", "confidenceScore", "limitations", "availableUserActions"] }; }
function matrixAlternativeComparisonSchema() { return { type: "object", additionalProperties: false, properties: { executiveSummary: boundedString(1400), rankings: { type: "array", minItems: 1, maxItems: 5, items: { type: "object", additionalProperties: false, properties: { proposalIndex: { type: "number", minimum: 0, maximum: 4 }, title: boundedString(200), rationale: boundedString(700), riskImpact: boundedString(500), portfolioImpact: boundedString(500), turnover: boundedString(300), implementationComplexity: enumString(["LOW", "MEDIUM", "HIGH"]), evidenceQuality: enumString(["LOW", "MEDIUM", "HIGH"]), confidenceScore: score, tradeoffs: stringList(8, 400) }, required: ["proposalIndex", "title", "rationale", "riskImpact", "portfolioImpact", "turnover", "implementationComplexity", "evidenceQuality", "confidenceScore", "tradeoffs"] } }, evidence: { type: "array", maxItems: 25, items: evidenceItemSchema() }, limitations: stringList(12, 400) }, required: ["executiveSummary", "rankings", "evidence", "limitations"] }; }

function portfolioCopilotSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: boundedString(1800),
      keyFindings: stringList(10, 400),
      reasoning: stringList(10, 400),
      evidence: { type: "array", maxItems: 12, items: portfolioEvidenceItemSchema() },
      confidenceScore: score,
      dataLimitations: stringList(10, 300),
      suggestedNextQuestion: boundedString(500),
      claimClassification: {
        type: "object",
        additionalProperties: false,
        properties: {
          facts: stringList(10, 300),
          platformMetrics: stringList(10, 300),
          interpretations: stringList(10, 300),
          unavailableInformation: stringList(10, 300),
        },
        required: ["facts", "platformMetrics", "interpretations", "unavailableInformation"],
      },
    },
    required: [
      "summary", "keyFindings", "reasoning", "evidence", "confidenceScore",
      "dataLimitations", "suggestedNextQuestion", "claimClassification",
    ],
  };
}

function portfolioProposalActionSchema() {
  return {
    type: "object", additionalProperties: false,
    properties: {
      actionType: enumString(PORTFOLIO_ACTION_TYPES), symbol: boundedString(32), sector: boundedString(100), industry: boundedString(120),
      strategyId: boundedString(160),
      matrixCell: { type: "object", additionalProperties: false, properties: { id: boundedString(160), sector: boundedString(100), regime: boundedString(100) }, required: ["id", "sector", "regime"] },
      currentValue: { type: "number", minimum: 0 }, proposedValue: { type: "number", minimum: 0 },
      unit: enumString(PORTFOLIO_ACTION_UNITS),
      targetWeights: { type: "array", maxItems: 50, items: { type: "object", additionalProperties: false, properties: { symbol: boundedString(32), weightPct: { type: "number", minimum: 0, maximum: 100 } }, required: ["symbol", "weightPct"] } },
    },
    required: ["actionType", "symbol", "sector", "industry", "strategyId", "matrixCell", "currentValue", "proposedValue", "unit", "targetWeights"],
  };
}

function portfolioProposalSchema() {
  return {
    type: "object", additionalProperties: false,
    properties: {
      proposalType: enumString(PORTFOLIO_PROPOSAL_TYPES), title: boundedString(180), objective: boundedString(600),
      actions: { type: "array", minItems: 1, maxItems: 20, items: portfolioProposalActionSchema() },
      proposalId: boundedString(160), assumptions: stringList(10, 300), rationale: stringList(10, 400), reasoning: stringList(10, 400),
      requiredApprovals: stringList(8, 120),
      evidence: { type: "array", maxItems: 12, items: portfolioEvidenceItemSchema() },
      confidence: score, expectedBenefit: boundedString(600), potentialDownside: boundedString(600), simulationAvailable: { type: "boolean" },
    },
    required: ["proposalType", "title", "objective", "proposalId", "actions", "assumptions", "rationale", "reasoning", "requiredApprovals", "evidence", "confidence", "expectedBenefit", "potentialDownside", "simulationAvailable"],
  };
}

function portfolioRecommendationSchema() {
  return {
    type: "object", additionalProperties: false,
    properties: {
      summary: boundedString(1600), portfolioConcernOrObjective: boundedString(800),
      recommendations: { type: "array", minItems: 1, maxItems: 3, items: portfolioProposalSchema() },
      evidence: { type: "array", maxItems: 12, items: portfolioEvidenceItemSchema() }, confidenceScore: score,
      dataModelLimitations: stringList(10, 300), availableUserActions: stringList(8, 300),
    },
    required: ["summary", "portfolioConcernOrObjective", "recommendations", "evidence", "confidenceScore", "dataModelLimitations", "availableUserActions"],
  };
}

function portfolioScenarioInterpretationSchema() {
  return {
    type: "object", additionalProperties: false,
    properties: {
      summary: boundedString(1600), portfolioConcernOrObjective: boundedString(800), recommendation: boundedString(900),
      proposedActions: stringList(20, 300), evidence: { type: "array", maxItems: 16, items: portfolioEvidenceItemSchema() },
      expectedBenefits: stringList(10, 300), risksTradeoffs: stringList(10, 300), confidenceScore: score,
      dataModelLimitations: stringList(12, 300), availableUserActions: stringList(8, 300),
    },
    required: ["summary", "portfolioConcernOrObjective", "recommendation", "proposedActions", "evidence", "expectedBenefits", "risksTradeoffs", "confidenceScore", "dataModelLimitations", "availableUserActions"],
  };
}

function portfolioProposalComparisonSchema() {
  return {
    type: "object", additionalProperties: false,
    properties: {
      ...portfolioScenarioInterpretationSchema().properties,
      rankedOptions: { type: "array", minItems: 2, maxItems: 3, items: { type: "object", additionalProperties: false, properties: {
        rank: { type: "number", minimum: 1, maximum: 3 }, title: boundedString(180), expectedImpact: boundedString(500),
        riskReduction: boundedString(500), portfolioDisruption: boundedString(500), turnoverPct: { type: "number", minimum: 0 }, confidence: score, tradeoffs: stringList(6, 300),
      }, required: ["rank", "title", "expectedImpact", "riskReduction", "portfolioDisruption", "turnoverPct", "confidence", "tradeoffs"] } },
    },
    required: [...portfolioScenarioInterpretationSchema().required, "rankedOptions"],
  };
}

function reasoningBreakdownSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      evidenceBackedStatements: stringList(8, 300),
      inferences: stringList(8, 300),
      suggestions: stringList(8, 300),
      unknowns: stringList(8, 300),
    },
    required: [
      "evidenceBackedStatements",
      "inferences",
      "suggestions",
      "unknowns",
    ],
  };
}

function advisoryFieldsSchema() {
  return {
    summary: boundedString(1800),
    recommendation: boundedString(1200),
    reasoning: stringList(10, 400),
    evidence: {
      type: "array",
      maxItems: 12,
      items: evidenceItemSchema(),
    },
    confidenceScore: score,
    limitations: stringList(10, 300),
    nextAction: boundedString(600),
    reasoningBreakdown: reasoningBreakdownSchema(),
  };
}

function advisoryRequiredFields() {
  return [
    "summary",
    "recommendation",
    "reasoning",
    "evidence",
    "confidenceScore",
    "limitations",
    "nextAction",
    "reasoningBreakdown",
  ];
}

function uniqueRequired(...groups) {
  return [...new Set(groups.flat())];
}

function strategyExplanationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      ...advisoryFieldsSchema(),
      summary: boundedString(1600),
      philosophy: boundedString(1600),
      indicators: stringList(12, 300),
      entryRules: stringList(12, 300),
      exitRules: stringList(12, 300),
      validationRules: stringList(12, 300),
      riskRules: stringList(12, 300),
      positionSizing: boundedString(800),
      expectedMarketConditions: stringList(10, 300),
      strengths: stringList(10, 300),
      weaknesses: stringList(10, 300),
      confidenceScore: score,
    },
    required: uniqueRequired(advisoryRequiredFields(), [
      "summary",
      "philosophy",
      "indicators",
      "entryRules",
      "exitRules",
      "validationRules",
      "riskRules",
      "positionSizing",
      "expectedMarketConditions",
      "strengths",
      "weaknesses",
      "confidenceScore",
    ]),
  };
}

function strategyReviewFindingSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      severity: enumString(["HIGH", "MEDIUM", "LOW"]),
      category: boundedString(80),
      finding: boundedString(500),
      impact: boundedString(500),
    },
    required: ["severity", "category", "finding", "impact"],
  };
}

const RESPONSE_SCHEMAS = Object.freeze({
  analyzeStock: {
    name: "stock_analysis",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        rating: score,
        confidence: score,
        trend: { type: "string", enum: ["Bullish", "Neutral", "Bearish"] },
        summary: boundedString(),
        strengths: stringList(),
        risks: stringList(),
        recommendation: boundedString(800),
      },
      required: [
        "rating",
        "confidence",
        "trend",
        "summary",
        "strengths",
        "risks",
        "recommendation",
      ],
    },
  },
  analyzePortfolio: {
    name: "portfolio_analysis",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        overallRating: score,
        confidence: score,
        summary: boundedString(),
        strengths: stringList(),
        risks: stringList(),
        actions: stringList(10),
      },
      required: [
        "overallRating",
        "confidence",
        "summary",
        "strengths",
        "risks",
        "actions",
      ],
    },
  },
  portfolioCopilotOverview: {
    name: "portfolio_copilot_overview",
    schema: portfolioCopilotSchema(),
  },
  portfolioCopilotQuestion: {
    name: "portfolio_copilot_question",
    schema: portfolioCopilotSchema(),
  },
  portfolioRecommendation: { name: "portfolio_recommendation", schema: portfolioRecommendationSchema() },
  portfolioScenarioProposal: { name: "portfolio_scenario_proposal", schema: portfolioProposalSchema() },
  portfolioScenarioInterpretation: { name: "portfolio_scenario_interpretation", schema: portfolioScenarioInterpretationSchema() },
  portfolioProposalComparison: { name: "portfolio_proposal_comparison", schema: portfolioProposalComparisonSchema() },
  marketResearchOverview: { name: "market_research_overview", schema: researchResponseSchema() },
  symbolResearch: { name: "symbol_research", schema: researchResponseSchema() },
  sectorResearch: { name: "sector_research", schema: researchResponseSchema() },
  scannerResearchExplanation: { name: "scanner_research_explanation", schema: researchResponseSchema() },
  watchlistResearchSummary: { name: "watchlist_research_summary", schema: researchResponseSchema() },
  upcomingEventsSummary: { name: "upcoming_events_summary", schema: researchResponseSchema() },
  deepResearch: { name: "deep_research", schema: researchResponseSchema() },
  marketImpact: { name: "market_impact", schema: researchResponseSchema() },
  portfolioImpact: { name: "portfolio_impact", schema: researchResponseSchema() },
  strategyImpact: { name: "strategy_impact", schema: researchResponseSchema() },
  matrixImpact: { name: "matrix_impact", schema: researchResponseSchema() },
  scannerImpact: { name: "scanner_impact", schema: researchResponseSchema() },
  comparisonResearch: { name: "comparison_research", schema: researchResponseSchema() },
  themeResearch: { name: "theme_research", schema: researchResponseSchema() },
  companyResearch: { name: "company_research", schema: researchResponseSchema() },
  researchProjectReport: { name: "research_project_report", schema: researchResponseSchema() },
  researchProjectQuestion: { name: "research_project_question", schema: researchResponseSchema() },
  researchThesisReview: { name: "research_thesis_review", schema: researchThesisReviewSchema() },
  researchChangeAnalysis: { name: "research_change_analysis", schema: researchResponseSchema() },
  researchProjectComparison: { name: "research_project_comparison", schema: researchResponseSchema() },
  matrixAudit: { name: "matrix_audit", schema: matrixCopilotResponseSchema() },
  matrixExplanation: { name: "matrix_explanation", schema: matrixCopilotResponseSchema() },
  matrixReplayAnalysis: { name: "matrix_replay_analysis", schema: matrixCopilotResponseSchema() },
  matrixDeploymentAnalysis: { name: "matrix_deployment_analysis", schema: matrixCopilotResponseSchema() },
  matrixAllocationAnalysis: { name: "matrix_allocation_analysis", schema: matrixCopilotResponseSchema() },
  matrixCoverageAnalysis: { name: "matrix_coverage_analysis", schema: matrixCopilotResponseSchema() },
  matrixRiskAnalysis: { name: "matrix_risk_analysis", schema: matrixCopilotResponseSchema() },
  matrixQuestionAnswer: { name: "matrix_question_answer", schema: matrixCopilotResponseSchema() },
  matrixRecommendation: { name: "matrix_recommendation", schema: matrixRecommendationSchema() },
  matrixScenarioProposal: { name: "matrix_scenario_proposal", schema: matrixProposalSchema() },
  matrixScenarioInterpretation: { name: "matrix_scenario_interpretation", schema: matrixScenarioInterpretationSchema() },
  matrixAlternativeComparison: { name: "matrix_alternative_comparison", schema: matrixAlternativeComparisonSchema() },
  explainScannerResult: {
    name: "scanner_result_explanation",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        score,
        confidence: score,
        summary: boundedString(),
        strengths: stringList(),
        risks: stringList(),
        recommendation: boundedString(800),
      },
      required: [
        "score",
        "confidence",
        "summary",
        "strengths",
        "risks",
        "recommendation",
      ],
    },
  },
  reviewTrade: {
    name: "trade_review",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        approval: { type: "string", enum: ["APPROVE", "WATCH", "REJECT"] },
        confidence: score,
        summary: boundedString(),
        strengths: stringList(),
        risks: stringList(),
        warnings: stringList(10),
        recommendation: boundedString(800),
      },
      required: [
        "approval",
        "confidence",
        "summary",
        "strengths",
        "risks",
        "warnings",
        "recommendation",
      ],
    },
  },
  summarizeNews: {
    name: "news_summary",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        sentiment: { type: "string", enum: ["Positive", "Neutral", "Negative"] },
        confidence: score,
        summary: boundedString(),
        keyPoints: stringList(10),
        risks: stringList(),
        recommendation: boundedString(800),
      },
      required: [
        "sentiment",
        "confidence",
        "summary",
        "keyPoints",
        "risks",
        "recommendation",
      ],
    },
  },
  chat: {
    name: "chat_response",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: boundedString(2000),
        confidence: score,
        bullets: stringList(8),
        followUps: stringList(5, 250),
      },
      required: ["answer", "confidence", "bullets", "followUps"],
    },
  },
  playbookRecommendation: {
    name: "playbook_recommendation",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        suggested_changes: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              area: boundedString(120),
              change: boundedString(800),
              rationale: boundedString(800),
            },
            required: ["area", "change", "rationale"],
          },
        },
        reasoning: boundedString(2000),
        expected_impact: boundedString(1200),
      },
      required: ["suggested_changes", "reasoning", "expected_impact"],
    },
  },
  newsReasoning: {
    name: "news_reasoning",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        news_summary: boundedString(1200),
        risk_level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
        sentiment: { type: "string", enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] },
        confidence_adjustment: { type: "number", minimum: -25, maximum: 15 },
        allow_trade: { type: "boolean" },
        reasoning: boundedString(1200),
      },
      required: [
        "news_summary",
        "risk_level",
        "sentiment",
        "confidence_adjustment",
        "allow_trade",
        "reasoning",
      ],
    },
  },
  generateStrategyDraft: {
    name: "strategy_draft",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...advisoryFieldsSchema(),
        status: enumString(["READY", "NEEDS_CLARIFICATION", "UNSUPPORTED"]),
        title: boundedString(140),
        description: boundedString(1200),
        tradingStyle: boundedString(60),
        marketType: enumString(marketEnum),
        timeframe: {
          type: "object",
          additionalProperties: false,
          properties: {
            primary: enumString(timeframeEnum),
            entry: enumString(timeframeEnum),
          },
          required: ["primary", "entry"],
        },
        entryRules: stringList(10, 300),
        exitRules: stringList(10, 300),
        validationRules: stringList(10, 300),
        riskRules: stringList(10, 300),
        positionSizing: boundedString(600),
        assumptions: stringList(10, 300),
        potentialRisks: stringList(10, 300),
        missingInformation: stringList(10, 300),
        unsupportedElements: stringList(10, 300),
        confidenceScore: score,
        explanation: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: boundedString(1400),
            indicatorRationale: stringList(10, 300),
            entryRationale: stringList(10, 300),
            exitRationale: stringList(10, 300),
            strengths: stringList(10, 300),
            weaknesses: stringList(10, 300),
          },
          required: [
            "summary",
            "indicatorRationale",
            "entryRationale",
            "exitRationale",
            "strengths",
            "weaknesses",
          ],
        },
        builderDraft: strategyBuilderDraftSchema(),
      },
      required: uniqueRequired(advisoryRequiredFields(), [
        "status",
        "title",
        "description",
        "tradingStyle",
        "marketType",
        "timeframe",
        "entryRules",
        "exitRules",
        "validationRules",
        "riskRules",
        "positionSizing",
        "assumptions",
        "potentialRisks",
        "missingInformation",
        "unsupportedElements",
        "confidenceScore",
        "explanation",
        "builderDraft",
      ]),
    },
  },
  explainStrategy: {
    name: "strategy_explanation",
    schema: strategyExplanationSchema(),
  },
  reviewStrategy: {
    name: "strategy_review",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...advisoryFieldsSchema(),
        summary: boundedString(1600),
        findings: {
          type: "array",
          maxItems: 12,
          items: strategyReviewFindingSchema(),
        },
        conflictingRules: stringList(10, 300),
        overlyRestrictiveLogic: stringList(10, 300),
        missingExits: stringList(10, 300),
        riskManagementIssues: stringList(10, 300),
        duplicateConditions: stringList(10, 300),
        unusedIndicators: stringList(10, 300),
        recommendations: stringList(10, 300),
        confidenceScore: score,
      },
      required: uniqueRequired(advisoryRequiredFields(), [
        "summary",
        "findings",
        "conflictingRules",
        "overlyRestrictiveLogic",
        "missingExits",
        "riskManagementIssues",
        "duplicateConditions",
        "unusedIndicators",
        "recommendations",
        "confidenceScore",
      ]),
    },
  },
  compareStrategiesCopilot: {
    name: "strategy_comparison_copilot",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...advisoryFieldsSchema(),
        summary: boundedString(1600),
        differences: stringList(12, 300),
        advantagesLeft: stringList(10, 300),
        advantagesRight: stringList(10, 300),
        disadvantagesLeft: stringList(10, 300),
        disadvantagesRight: stringList(10, 300),
        complexityComparison: boundedString(800),
        riskComparison: boundedString(800),
        marketSuitability: boundedString(800),
        tradeFrequency: boundedString(800),
        expectedHoldingPeriod: boundedString(800),
        confidenceScore: score,
      },
      required: uniqueRequired(advisoryRequiredFields(), [
        "summary",
        "differences",
        "advantagesLeft",
        "advantagesRight",
        "disadvantagesLeft",
        "disadvantagesRight",
        "complexityComparison",
        "riskComparison",
        "marketSuitability",
        "tradeFrequency",
        "expectedHoldingPeriod",
        "confidenceScore",
      ]),
    },
  },
  answerStrategyQuestion: {
    name: "strategy_question_answer",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...advisoryFieldsSchema(),
        answer: boundedString(2000),
        reasoning: stringList(10, 300),
        implications: stringList(10, 300),
        confidenceScore: score,
      },
      required: uniqueRequired(advisoryRequiredFields(), [
        "answer",
        "reasoning",
        "implications",
        "confidenceScore",
      ]),
    },
  },
  proposeStrategyEdit: {
    name: "strategy_edit_proposal",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...advisoryFieldsSchema(),
        status: enumString(["READY", "NEEDS_CLARIFICATION", "UNSUPPORTED"]),
        title: boundedString(140),
        description: boundedString(1200),
        summaryOfChanges: boundedString(1400),
        reason: boundedString(1200),
        expectedImpact: boundedString(1200),
        possibleDownsides: stringList(10, 300),
        tradeoffs: stringList(10, 300),
        assumptions: stringList(10, 300),
        missingInformation: stringList(10, 300),
        unsupportedElements: stringList(10, 300),
        changeHighlights: stringList(12, 300),
        confidenceScore: score,
        explanation: strategyExplanationSchema(),
        builderDraft: strategyBuilderDraftSchema(),
      },
      required: uniqueRequired(advisoryRequiredFields(), [
        "status",
        "title",
        "description",
        "summaryOfChanges",
        "reason",
        "expectedImpact",
        "possibleDownsides",
        "tradeoffs",
        "assumptions",
        "missingInformation",
        "unsupportedElements",
        "changeHighlights",
        "confidenceScore",
        "explanation",
        "builderDraft",
      ]),
    },
  },
  generateStrategyResearchReport: {
    name: "strategy_research_report",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...advisoryFieldsSchema(),
        executiveSummary: boundedString(1800),
        performanceSummary: boundedString(1800),
        strengths: stringList(12, 300),
        weaknesses: stringList(12, 300),
        riskAssessment: stringList(12, 300),
        regimeAnalysis: stringList(12, 300),
        robustnessReview: stringList(12, 300),
        executionAnalysis: stringList(12, 300),
        capitalUsage: stringList(10, 300),
        failureModes: stringList(10, 300),
        researchRecommendations: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              recommendation: boundedString(400),
              confidence: score,
              evidence: stringList(6, 240),
              limitations: stringList(4, 240),
            },
            required: ["recommendation", "confidence", "evidence", "limitations"],
          },
        },
        supportingMetrics: stringList(12, 300),
        knownLimitations: stringList(10, 300),
        confidenceScore: score,
      },
      required: uniqueRequired(advisoryRequiredFields(), [
        "executiveSummary",
        "performanceSummary",
        "strengths",
        "weaknesses",
        "riskAssessment",
        "regimeAnalysis",
        "robustnessReview",
        "executionAnalysis",
        "capitalUsage",
        "failureModes",
        "researchRecommendations",
        "supportingMetrics",
        "knownLimitations",
        "confidenceScore",
      ]),
    },
  },
  answerStrategyResearchQuestion: {
    name: "strategy_research_question_answer",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...advisoryFieldsSchema(),
        answer: boundedString(2200),
        supportingMetrics: stringList(10, 300),
        nextResearchSteps: stringList(8, 300),
      },
      required: uniqueRequired(advisoryRequiredFields(), [
        "answer",
        "supportingMetrics",
        "nextResearchSteps",
      ]),
    },
  },
  compareStrategyVersions: {
    name: "strategy_version_comparison",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...advisoryFieldsSchema(),
        executiveSummary: boundedString(1600),
        ruleChanges: stringList(12, 300),
        performanceDifferences: stringList(12, 300),
        riskDifferences: stringList(12, 300),
        tradeFrequency: boundedString(800),
        marketSuitability: boundedString(800),
        executionComplexity: boundedString(800),
        robustness: boundedString(800),
        regressions: stringList(10, 300),
        improvements: stringList(10, 300),
        supportingMetrics: stringList(12, 300),
        knownLimitations: stringList(8, 300),
        confidenceScore: score,
      },
      required: uniqueRequired(advisoryRequiredFields(), [
        "executiveSummary",
        "ruleChanges",
        "performanceDifferences",
        "riskDifferences",
        "tradeFrequency",
        "marketSuitability",
        "executionComplexity",
        "robustness",
        "regressions",
        "improvements",
        "supportingMetrics",
        "knownLimitations",
        "confidenceScore",
      ]),
    },
  },
});

const CACHE_TTLS_MS = Object.freeze({
  analyzeStock: 5 * 60 * 1000,
  explainScannerResult: 5 * 60 * 1000,
  summarizeNews: 5 * 60 * 1000,
  analyzePortfolio: 30 * 1000,
  portfolioCopilotOverview: 30 * 1000,
  portfolioCopilotQuestion: 30 * 1000,
  portfolioRecommendation: 60 * 1000,
  portfolioScenarioProposal: 60 * 1000,
  portfolioScenarioInterpretation: 60 * 1000,
  portfolioProposalComparison: 60 * 1000,
  marketResearchOverview: 2 * 60 * 1000, symbolResearch: 2 * 60 * 1000, sectorResearch: 2 * 60 * 1000,
  scannerResearchExplanation: 2 * 60 * 1000, watchlistResearchSummary: 2 * 60 * 1000, upcomingEventsSummary: 2 * 60 * 1000,
  deepResearch: 5 * 60 * 1000, marketImpact: 2 * 60 * 1000, portfolioImpact: 2 * 60 * 1000, strategyImpact: 2 * 60 * 1000, matrixImpact: 2 * 60 * 1000, scannerImpact: 2 * 60 * 1000, comparisonResearch: 5 * 60 * 1000, themeResearch: 5 * 60 * 1000, companyResearch: 5 * 60 * 1000,
  researchProjectReport: 2 * 60 * 1000, researchProjectQuestion: 0, researchThesisReview: 0, researchChangeAnalysis: 0, researchProjectComparison: 2 * 60 * 1000,
  matrixAudit: 60 * 1000, matrixExplanation: 60 * 1000, matrixReplayAnalysis: 60 * 1000, matrixDeploymentAnalysis: 60 * 1000, matrixAllocationAnalysis: 60 * 1000, matrixCoverageAnalysis: 60 * 1000, matrixRiskAnalysis: 60 * 1000, matrixQuestionAnswer: 0,
  matrixRecommendation: 60 * 1000, matrixScenarioProposal: 60 * 1000, matrixScenarioInterpretation: 60 * 1000, matrixAlternativeComparison: 60 * 1000,
  reviewTrade: 30 * 1000,
  chat: 0,
  playbookRecommendation: 5 * 60 * 1000,
  newsReasoning: 5 * 60 * 1000,
  generateStrategyDraft: 5 * 60 * 1000,
  explainStrategy: 2 * 60 * 1000,
  reviewStrategy: 2 * 60 * 1000,
  compareStrategiesCopilot: 2 * 60 * 1000,
  answerStrategyQuestion: 2 * 60 * 1000,
  proposeStrategyEdit: 2 * 60 * 1000,
  generateStrategyResearchReport: 2 * 60 * 1000,
  answerStrategyResearchQuestion: 2 * 60 * 1000,
  compareStrategyVersions: 2 * 60 * 1000,
});

const RESEARCH_MODEL_CONFIG = Object.freeze({
  timeoutMs: Math.max(30_000, Math.min(180_000, Number.parseInt(process.env.OPENAI_RESEARCH_TIMEOUT_MS, 10) || 90_000)),
});

function buildLegacyFeatures() {
  return {
    analyzeStock: {
      promptTemplate: "stock-analysis.md",
      schemaName: RESPONSE_SCHEMAS.analyzeStock.name,
      outputSchema: RESPONSE_SCHEMAS.analyzeStock.schema,
      cacheTtlMs: CACHE_TTLS_MS.analyzeStock,
      validateInput: validateStockPayload,
    },
    analyzePortfolio: {
      promptTemplate: "portfolio-analysis.md",
      schemaName: RESPONSE_SCHEMAS.analyzePortfolio.name,
      outputSchema: RESPONSE_SCHEMAS.analyzePortfolio.schema,
      cacheTtlMs: CACHE_TTLS_MS.analyzePortfolio,
      validateInput: validatePortfolioPayload,
    },
    portfolioCopilotOverview: {
      promptTemplate: { type: "file", file: "portfolio-copilot.md", version: "v1" },
      promptVersion: "v1",
      schemaName: RESPONSE_SCHEMAS.portfolioCopilotOverview.name,
      outputSchema: RESPONSE_SCHEMAS.portfolioCopilotOverview.schema,
      cacheTtlMs: CACHE_TTLS_MS.portfolioCopilotOverview,
      validateInput: validatePortfolioCopilotPayload,
    },
    portfolioCopilotQuestion: {
      promptTemplate: { type: "file", file: "portfolio-copilot.md", version: "v1" },
      promptVersion: "v1",
      schemaName: RESPONSE_SCHEMAS.portfolioCopilotQuestion.name,
      outputSchema: RESPONSE_SCHEMAS.portfolioCopilotQuestion.schema,
      cacheTtlMs: CACHE_TTLS_MS.portfolioCopilotQuestion,
      validateInput: validatePortfolioCopilotPayload,
    },
    portfolioRecommendation: {
      promptTemplate: { type: "file", file: "portfolio-advisor.md", version: "v1" }, promptVersion: "v1",
      schemaName: RESPONSE_SCHEMAS.portfolioRecommendation.name, outputSchema: RESPONSE_SCHEMAS.portfolioRecommendation.schema,
      cacheTtlMs: CACHE_TTLS_MS.portfolioRecommendation, validateInput: validatePortfolioAdvisorPayload,
    },
    portfolioScenarioProposal: {
      promptTemplate: { type: "file", file: "portfolio-advisor.md", version: "v1" }, promptVersion: "v1",
      schemaName: RESPONSE_SCHEMAS.portfolioScenarioProposal.name, outputSchema: RESPONSE_SCHEMAS.portfolioScenarioProposal.schema,
      cacheTtlMs: CACHE_TTLS_MS.portfolioScenarioProposal, validateInput: validatePortfolioAdvisorPayload,
    },
    portfolioScenarioInterpretation: {
      promptTemplate: { type: "file", file: "portfolio-advisor.md", version: "v1" }, promptVersion: "v1",
      schemaName: RESPONSE_SCHEMAS.portfolioScenarioInterpretation.name, outputSchema: RESPONSE_SCHEMAS.portfolioScenarioInterpretation.schema,
      cacheTtlMs: CACHE_TTLS_MS.portfolioScenarioInterpretation, validateInput: validatePortfolioAdvisorPayload,
    },
    portfolioProposalComparison: {
      promptTemplate: { type: "file", file: "portfolio-advisor.md", version: "v1" }, promptVersion: "v1",
      schemaName: RESPONSE_SCHEMAS.portfolioProposalComparison.name, outputSchema: RESPONSE_SCHEMAS.portfolioProposalComparison.schema,
      cacheTtlMs: CACHE_TTLS_MS.portfolioProposalComparison, validateInput: validatePortfolioAdvisorPayload,
    },
    marketResearchOverview: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.marketResearchOverview.name, outputSchema: RESPONSE_SCHEMAS.marketResearchOverview.schema, cacheTtlMs: CACHE_TTLS_MS.marketResearchOverview, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    symbolResearch: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.symbolResearch.name, outputSchema: RESPONSE_SCHEMAS.symbolResearch.schema, cacheTtlMs: CACHE_TTLS_MS.symbolResearch, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    sectorResearch: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.sectorResearch.name, outputSchema: RESPONSE_SCHEMAS.sectorResearch.schema, cacheTtlMs: CACHE_TTLS_MS.sectorResearch, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    scannerResearchExplanation: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.scannerResearchExplanation.name, outputSchema: RESPONSE_SCHEMAS.scannerResearchExplanation.schema, cacheTtlMs: CACHE_TTLS_MS.scannerResearchExplanation, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    watchlistResearchSummary: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.watchlistResearchSummary.name, outputSchema: RESPONSE_SCHEMAS.watchlistResearchSummary.schema, cacheTtlMs: CACHE_TTLS_MS.watchlistResearchSummary, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    upcomingEventsSummary: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.upcomingEventsSummary.name, outputSchema: RESPONSE_SCHEMAS.upcomingEventsSummary.schema, cacheTtlMs: CACHE_TTLS_MS.upcomingEventsSummary, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    deepResearch: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v2" }, promptVersion: "v2", schemaName: RESPONSE_SCHEMAS.deepResearch.name, outputSchema: RESPONSE_SCHEMAS.deepResearch.schema, cacheTtlMs: CACHE_TTLS_MS.deepResearch, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    marketImpact: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v2" }, promptVersion: "v2", schemaName: RESPONSE_SCHEMAS.marketImpact.name, outputSchema: RESPONSE_SCHEMAS.marketImpact.schema, cacheTtlMs: CACHE_TTLS_MS.marketImpact, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    portfolioImpact: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v2" }, promptVersion: "v2", schemaName: RESPONSE_SCHEMAS.portfolioImpact.name, outputSchema: RESPONSE_SCHEMAS.portfolioImpact.schema, cacheTtlMs: CACHE_TTLS_MS.portfolioImpact, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    strategyImpact: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v2" }, promptVersion: "v2", schemaName: RESPONSE_SCHEMAS.strategyImpact.name, outputSchema: RESPONSE_SCHEMAS.strategyImpact.schema, cacheTtlMs: CACHE_TTLS_MS.strategyImpact, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixImpact: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v2" }, promptVersion: "v2", schemaName: RESPONSE_SCHEMAS.matrixImpact.name, outputSchema: RESPONSE_SCHEMAS.matrixImpact.schema, cacheTtlMs: CACHE_TTLS_MS.matrixImpact, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    scannerImpact: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v2" }, promptVersion: "v2", schemaName: RESPONSE_SCHEMAS.scannerImpact.name, outputSchema: RESPONSE_SCHEMAS.scannerImpact.schema, cacheTtlMs: CACHE_TTLS_MS.scannerImpact, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    comparisonResearch: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v2" }, promptVersion: "v2", schemaName: RESPONSE_SCHEMAS.comparisonResearch.name, outputSchema: RESPONSE_SCHEMAS.comparisonResearch.schema, cacheTtlMs: CACHE_TTLS_MS.comparisonResearch, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    themeResearch: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v2" }, promptVersion: "v2", schemaName: RESPONSE_SCHEMAS.themeResearch.name, outputSchema: RESPONSE_SCHEMAS.themeResearch.schema, cacheTtlMs: CACHE_TTLS_MS.themeResearch, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    companyResearch: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v2" }, promptVersion: "v2", schemaName: RESPONSE_SCHEMAS.companyResearch.name, outputSchema: RESPONSE_SCHEMAS.companyResearch.schema, cacheTtlMs: CACHE_TTLS_MS.companyResearch, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    researchProjectReport: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v3" }, promptVersion: "v3", schemaName: RESPONSE_SCHEMAS.researchProjectReport.name, outputSchema: RESPONSE_SCHEMAS.researchProjectReport.schema, cacheTtlMs: CACHE_TTLS_MS.researchProjectReport, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    researchProjectQuestion: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v3" }, promptVersion: "v3", schemaName: RESPONSE_SCHEMAS.researchProjectQuestion.name, outputSchema: RESPONSE_SCHEMAS.researchProjectQuestion.schema, cacheTtlMs: 0, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    researchThesisReview: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v3" }, promptVersion: "v3", schemaName: RESPONSE_SCHEMAS.researchThesisReview.name, outputSchema: RESPONSE_SCHEMAS.researchThesisReview.schema, cacheTtlMs: 0, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    researchChangeAnalysis: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v3" }, promptVersion: "v3", schemaName: RESPONSE_SCHEMAS.researchChangeAnalysis.name, outputSchema: RESPONSE_SCHEMAS.researchChangeAnalysis.schema, cacheTtlMs: 0, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    researchProjectComparison: { promptTemplate: { type: "file", file: "research-copilot.md", version: "v3" }, promptVersion: "v3", schemaName: RESPONSE_SCHEMAS.researchProjectComparison.name, outputSchema: RESPONSE_SCHEMAS.researchProjectComparison.schema, cacheTtlMs: CACHE_TTLS_MS.researchProjectComparison, validateInput: validateResearchCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixAudit: { promptTemplate: { type: "file", file: "matrix-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixAudit.name, outputSchema: RESPONSE_SCHEMAS.matrixAudit.schema, cacheTtlMs: CACHE_TTLS_MS.matrixAudit, validateInput: validateMatrixCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixExplanation: { promptTemplate: { type: "file", file: "matrix-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixExplanation.name, outputSchema: RESPONSE_SCHEMAS.matrixExplanation.schema, cacheTtlMs: CACHE_TTLS_MS.matrixExplanation, validateInput: validateMatrixCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixReplayAnalysis: { promptTemplate: { type: "file", file: "matrix-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixReplayAnalysis.name, outputSchema: RESPONSE_SCHEMAS.matrixReplayAnalysis.schema, cacheTtlMs: CACHE_TTLS_MS.matrixReplayAnalysis, validateInput: validateMatrixCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixDeploymentAnalysis: { promptTemplate: { type: "file", file: "matrix-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixDeploymentAnalysis.name, outputSchema: RESPONSE_SCHEMAS.matrixDeploymentAnalysis.schema, cacheTtlMs: CACHE_TTLS_MS.matrixDeploymentAnalysis, validateInput: validateMatrixCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixAllocationAnalysis: { promptTemplate: { type: "file", file: "matrix-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixAllocationAnalysis.name, outputSchema: RESPONSE_SCHEMAS.matrixAllocationAnalysis.schema, cacheTtlMs: CACHE_TTLS_MS.matrixAllocationAnalysis, validateInput: validateMatrixCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixCoverageAnalysis: { promptTemplate: { type: "file", file: "matrix-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixCoverageAnalysis.name, outputSchema: RESPONSE_SCHEMAS.matrixCoverageAnalysis.schema, cacheTtlMs: CACHE_TTLS_MS.matrixCoverageAnalysis, validateInput: validateMatrixCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixRiskAnalysis: { promptTemplate: { type: "file", file: "matrix-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixRiskAnalysis.name, outputSchema: RESPONSE_SCHEMAS.matrixRiskAnalysis.schema, cacheTtlMs: CACHE_TTLS_MS.matrixRiskAnalysis, validateInput: validateMatrixCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixQuestionAnswer: { promptTemplate: { type: "file", file: "matrix-copilot.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixQuestionAnswer.name, outputSchema: RESPONSE_SCHEMAS.matrixQuestionAnswer.schema, cacheTtlMs: 0, validateInput: validateMatrixCopilotPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixRecommendation: { promptTemplate: { type: "file", file: "matrix-advisor.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixRecommendation.name, outputSchema: RESPONSE_SCHEMAS.matrixRecommendation.schema, cacheTtlMs: CACHE_TTLS_MS.matrixRecommendation, validateInput: validateMatrixAdvisorPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixScenarioProposal: { promptTemplate: { type: "file", file: "matrix-advisor.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixScenarioProposal.name, outputSchema: RESPONSE_SCHEMAS.matrixScenarioProposal.schema, cacheTtlMs: CACHE_TTLS_MS.matrixScenarioProposal, validateInput: validateMatrixAdvisorPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixScenarioInterpretation: { promptTemplate: { type: "file", file: "matrix-advisor.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixScenarioInterpretation.name, outputSchema: RESPONSE_SCHEMAS.matrixScenarioInterpretation.schema, cacheTtlMs: CACHE_TTLS_MS.matrixScenarioInterpretation, validateInput: validateMatrixAdvisorPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    matrixAlternativeComparison: { promptTemplate: { type: "file", file: "matrix-advisor.md", version: "v1" }, promptVersion: "v1", schemaName: RESPONSE_SCHEMAS.matrixAlternativeComparison.name, outputSchema: RESPONSE_SCHEMAS.matrixAlternativeComparison.schema, cacheTtlMs: CACHE_TTLS_MS.matrixAlternativeComparison, validateInput: validateMatrixAdvisorPayload, modelConfig: RESEARCH_MODEL_CONFIG },
    explainScannerResult: {
      promptTemplate: "scanner.md",
      schemaName: RESPONSE_SCHEMAS.explainScannerResult.name,
      outputSchema: RESPONSE_SCHEMAS.explainScannerResult.schema,
      cacheTtlMs: CACHE_TTLS_MS.explainScannerResult,
      validateInput: validateScannerPayload,
    },
    reviewTrade: {
      promptTemplate: "trade-review.md",
      schemaName: RESPONSE_SCHEMAS.reviewTrade.name,
      outputSchema: RESPONSE_SCHEMAS.reviewTrade.schema,
      cacheTtlMs: CACHE_TTLS_MS.reviewTrade,
      validateInput: validateTradePayload,
    },
    summarizeNews: {
      promptTemplate: "news-summary.md",
      schemaName: RESPONSE_SCHEMAS.summarizeNews.name,
      outputSchema: RESPONSE_SCHEMAS.summarizeNews.schema,
      cacheTtlMs: CACHE_TTLS_MS.summarizeNews,
      validateInput: validateNewsPayload,
    },
    chat: {
      promptTemplate: "chat.md",
      schemaName: RESPONSE_SCHEMAS.chat.name,
      outputSchema: RESPONSE_SCHEMAS.chat.schema,
      cacheTtlMs: CACHE_TTLS_MS.chat,
      validateInput: validateChatPayload,
    },
    playbookRecommendation: {
      promptTemplate: "playbook-recommendation.md",
      schemaName: RESPONSE_SCHEMAS.playbookRecommendation.name,
      outputSchema: RESPONSE_SCHEMAS.playbookRecommendation.schema,
      cacheTtlMs: CACHE_TTLS_MS.playbookRecommendation,
      validateInput: validatePlaybookPayload,
    },
    newsReasoning: {
      promptTemplate: "news-reasoning.md",
      schemaName: RESPONSE_SCHEMAS.newsReasoning.name,
      outputSchema: RESPONSE_SCHEMAS.newsReasoning.schema,
      cacheTtlMs: CACHE_TTLS_MS.newsReasoning,
      validateInput: validateNewsReasoningPayload,
    },
    generateStrategyDraft: {
      promptTemplate: "strategy-draft.md",
      schemaName: RESPONSE_SCHEMAS.generateStrategyDraft.name,
      outputSchema: RESPONSE_SCHEMAS.generateStrategyDraft.schema,
      cacheTtlMs: CACHE_TTLS_MS.generateStrategyDraft,
      validateInput: validateStrategyDraftPayload,
    },
    explainStrategy: {
      promptTemplate: "strategy-copilot.md",
      schemaName: RESPONSE_SCHEMAS.explainStrategy.name,
      outputSchema: RESPONSE_SCHEMAS.explainStrategy.schema,
      cacheTtlMs: CACHE_TTLS_MS.explainStrategy,
      validateInput: validateStrategyCopilotPayload,
    },
    reviewStrategy: {
      promptTemplate: "strategy-copilot.md",
      schemaName: RESPONSE_SCHEMAS.reviewStrategy.name,
      outputSchema: RESPONSE_SCHEMAS.reviewStrategy.schema,
      cacheTtlMs: CACHE_TTLS_MS.reviewStrategy,
      validateInput: validateStrategyCopilotPayload,
    },
    compareStrategiesCopilot: {
      promptTemplate: "strategy-copilot.md",
      schemaName: RESPONSE_SCHEMAS.compareStrategiesCopilot.name,
      outputSchema: RESPONSE_SCHEMAS.compareStrategiesCopilot.schema,
      cacheTtlMs: CACHE_TTLS_MS.compareStrategiesCopilot,
      validateInput: validateStrategyCopilotPayload,
    },
    answerStrategyQuestion: {
      promptTemplate: "strategy-copilot.md",
      schemaName: RESPONSE_SCHEMAS.answerStrategyQuestion.name,
      outputSchema: RESPONSE_SCHEMAS.answerStrategyQuestion.schema,
      cacheTtlMs: CACHE_TTLS_MS.answerStrategyQuestion,
      validateInput: validateStrategyCopilotPayload,
    },
    proposeStrategyEdit: {
      promptTemplate: "strategy-copilot.md",
      schemaName: RESPONSE_SCHEMAS.proposeStrategyEdit.name,
      outputSchema: RESPONSE_SCHEMAS.proposeStrategyEdit.schema,
      cacheTtlMs: CACHE_TTLS_MS.proposeStrategyEdit,
      validateInput: validateStrategyCopilotPayload,
    },
    generateStrategyResearchReport: {
      promptTemplate: "strategy-research.md",
      schemaName: RESPONSE_SCHEMAS.generateStrategyResearchReport.name,
      outputSchema: RESPONSE_SCHEMAS.generateStrategyResearchReport.schema,
      cacheTtlMs: CACHE_TTLS_MS.generateStrategyResearchReport,
      validateInput: validateStrategyCopilotPayload,
    },
    answerStrategyResearchQuestion: {
      promptTemplate: "strategy-research.md",
      schemaName: RESPONSE_SCHEMAS.answerStrategyResearchQuestion.name,
      outputSchema: RESPONSE_SCHEMAS.answerStrategyResearchQuestion.schema,
      cacheTtlMs: CACHE_TTLS_MS.answerStrategyResearchQuestion,
      validateInput: validateStrategyCopilotPayload,
    },
    compareStrategyVersions: {
      promptTemplate: "strategy-research.md",
      schemaName: RESPONSE_SCHEMAS.compareStrategyVersions.name,
      outputSchema: RESPONSE_SCHEMAS.compareStrategyVersions.schema,
      cacheTtlMs: CACHE_TTLS_MS.compareStrategyVersions,
      validateInput: validateStrategyCopilotPayload,
    },
  };
}

function createAIService({
  provider = createOpenAIClient(),
  invocationStore = createAiInvocationStore(),
  governanceConfig,
  promptDir,
  now,
} = {}) {
  const aiPlatform = createAiService({
    client: provider,
    invocationStore,
    promptRegistry: createPromptRegistry({ promptDir }),
    featureRegistry: buildLegacyFeatures(),
    governanceConfig,
    now,
  });

  let memoryContextService = null;

  async function runCopilotFeature(featureType, userId, payload = {}) {
    let enrichedPayload = payload;
    let historicalContextUsed = {
      status: "NO_RELEVANT_MEMORY",
      mode: "OFF",
      notice: "No relevant historical context available.",
      memories: [],
      tokenEstimate: 0,
      omittedCount: 0,
    };
    if (memoryContextService?.enrichCopilotPayload) {
      const enriched = await memoryContextService.enrichCopilotPayload({
        userId,
        featureType,
        payload,
      });
      enrichedPayload = enriched.payload;
      historicalContextUsed = enriched.historicalContextUsed;
    }
    const result = await aiPlatform.createFeatureRunner(featureType)(userId, enrichedPayload);
    return { ...result, historicalContextUsed };
  }

  return {
    setMemoryContextService(service) {
      memoryContextService = service;
    },

    isConfigured() {
      return aiPlatform.isConfigured();
    },

    async analyzeStock(userId, payload) {
      return aiPlatform.createFeatureRunner("analyzeStock")(userId, payload);
    },

    async analyzePortfolio(userId, payload) {
      return aiPlatform.createFeatureRunner("analyzePortfolio")(userId, payload);
    },

    async generatePortfolioOverview(userId, payload) {
      return runCopilotFeature("portfolioCopilotOverview", userId, payload);
    },

    async answerPortfolioQuestion(userId, payload) {
      return runCopilotFeature("portfolioCopilotQuestion", userId, payload);
    },

    async generatePortfolioRecommendations(userId, payload) { return runCopilotFeature("portfolioRecommendation", userId, payload); },
    async generatePortfolioScenarioProposal(userId, payload) { return runCopilotFeature("portfolioScenarioProposal", userId, payload); },
    async interpretPortfolioScenario(userId, payload) { return runCopilotFeature("portfolioScenarioInterpretation", userId, payload); },
    async comparePortfolioProposals(userId, payload) { return runCopilotFeature("portfolioProposalComparison", userId, payload); },
    async marketResearchOverview(userId, payload) { return runCopilotFeature("marketResearchOverview", userId, payload); },
    async symbolResearch(userId, payload) { return runCopilotFeature("symbolResearch", userId, payload); },
    async sectorResearch(userId, payload) { return runCopilotFeature("sectorResearch", userId, payload); },
    async scannerResearchExplanation(userId, payload) { return runCopilotFeature("scannerResearchExplanation", userId, payload); },
    async watchlistResearchSummary(userId, payload) { return runCopilotFeature("watchlistResearchSummary", userId, payload); },
    async upcomingEventsSummary(userId, payload) { return runCopilotFeature("upcomingEventsSummary", userId, payload); },
    async deepResearch(userId, payload) { return runCopilotFeature("deepResearch", userId, payload); },
    async marketImpact(userId, payload) { return runCopilotFeature("marketImpact", userId, payload); },
    async portfolioImpact(userId, payload) { return runCopilotFeature("portfolioImpact", userId, payload); },
    async strategyImpact(userId, payload) { return runCopilotFeature("strategyImpact", userId, payload); },
    async matrixImpact(userId, payload) { return runCopilotFeature("matrixImpact", userId, payload); },
    async scannerImpact(userId, payload) { return runCopilotFeature("scannerImpact", userId, payload); },
    async comparisonResearch(userId, payload) { return runCopilotFeature("comparisonResearch", userId, payload); },
    async themeResearch(userId, payload) { return runCopilotFeature("themeResearch", userId, payload); },
    async companyResearch(userId, payload) { return runCopilotFeature("companyResearch", userId, payload); },
    async researchProjectReport(userId, payload) { return runCopilotFeature("researchProjectReport", userId, payload); },
    async researchProjectQuestion(userId, payload) { return runCopilotFeature("researchProjectQuestion", userId, payload); },
    async researchThesisReview(userId, payload) { return runCopilotFeature("researchThesisReview", userId, payload); },
    async researchChangeAnalysis(userId, payload) { return runCopilotFeature("researchChangeAnalysis", userId, payload); },
    async researchProjectComparison(userId, payload) { return runCopilotFeature("researchProjectComparison", userId, payload); },
    async matrixAudit(userId, payload) { return runCopilotFeature("matrixAudit", userId, payload); },
    async matrixExplanation(userId, payload) { return runCopilotFeature("matrixExplanation", userId, payload); },
    async matrixReplayAnalysis(userId, payload) { return runCopilotFeature("matrixReplayAnalysis", userId, payload); },
    async matrixDeploymentAnalysis(userId, payload) { return runCopilotFeature("matrixDeploymentAnalysis", userId, payload); },
    async matrixAllocationAnalysis(userId, payload) { return runCopilotFeature("matrixAllocationAnalysis", userId, payload); },
    async matrixCoverageAnalysis(userId, payload) { return runCopilotFeature("matrixCoverageAnalysis", userId, payload); },
    async matrixRiskAnalysis(userId, payload) { return runCopilotFeature("matrixRiskAnalysis", userId, payload); },
    async matrixQuestionAnswer(userId, payload) { return runCopilotFeature("matrixQuestionAnswer", userId, payload); },
    async matrixRecommendation(userId, payload) { return runCopilotFeature("matrixRecommendation", userId, payload); },
    async matrixScenarioProposal(userId, payload) { return runCopilotFeature("matrixScenarioProposal", userId, payload); },
    async matrixScenarioInterpretation(userId, payload) { return runCopilotFeature("matrixScenarioInterpretation", userId, payload); },
    async matrixAlternativeComparison(userId, payload) { return runCopilotFeature("matrixAlternativeComparison", userId, payload); },

    async explainScannerResult(userId, payload) {
      return aiPlatform.createFeatureRunner("explainScannerResult")(userId, payload);
    },

    async reviewTrade(userId, payload) {
      return aiPlatform.createFeatureRunner("reviewTrade")(userId, payload);
    },

    async summarizeNews(userId, payload) {
      return aiPlatform.createFeatureRunner("summarizeNews")(userId, payload);
    },

    async chat(userId, payload) {
      return aiPlatform.createFeatureRunner("chat")(userId, payload);
    },

    async generatePlaybookRecommendation(userId, payload) {
      return aiPlatform.createFeatureRunner("playbookRecommendation")(userId, payload);
    },

    async reasonAboutNews(userId, payload) {
      return aiPlatform.createFeatureRunner("newsReasoning")(userId, payload);
    },

    async generateStrategyDraft(userId, payload) {
      return runCopilotFeature("generateStrategyDraft", userId, payload);
    },

    async explainStrategy(userId, payload) {
      return runCopilotFeature("explainStrategy", userId, payload);
    },

    async reviewStrategy(userId, payload) {
      return runCopilotFeature("reviewStrategy", userId, payload);
    },

    async compareStrategiesCopilot(userId, payload) {
      return runCopilotFeature("compareStrategiesCopilot", userId, payload);
    },

    async answerStrategyQuestion(userId, payload) {
      return runCopilotFeature("answerStrategyQuestion", userId, payload);
    },

    async proposeStrategyEdit(userId, payload) {
      return runCopilotFeature("proposeStrategyEdit", userId, payload);
    },

    async generateStrategyResearchReport(userId, payload) {
      return runCopilotFeature("generateStrategyResearchReport", userId, payload);
    },

    async answerStrategyResearchQuestion(userId, payload) {
      return runCopilotFeature("answerStrategyResearchQuestion", userId, payload);
    },

    async compareStrategyVersions(userId, payload) {
      return runCopilotFeature("compareStrategyVersions", userId, payload);
    },

    async getDiagnostics(args) {
      const durable = await aiPlatform.getDiagnostics(args);
      return {
        durable,
        runtime: aiPlatform.getMetricsSnapshot(),
        governance: aiPlatform.getGovernanceSnapshot(),
      };
    },

    getGovernanceSnapshot() {
      return aiPlatform.getGovernanceSnapshot();
    },
  };
}

module.exports = {
  CACHE_TTLS_MS,
  RESPONSE_SCHEMAS,
  createAIService,
  createAiError,
  sanitizeAiInput,
};
