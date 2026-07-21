const { normalizeResearchEvidenceReferences } = require("./researchEvidence.service");

const FEATURE_METHODS = Object.freeze({
  MARKET_OVERVIEW: "marketResearchOverview", QUESTION: "marketResearchOverview",
  SYMBOL_RESEARCH: "symbolResearch", SECTOR_RESEARCH: "sectorResearch",
  SCANNER_EXPLANATION: "scannerResearchExplanation", WATCHLIST_SUMMARY: "watchlistResearchSummary",
  UPCOMING_EVENTS: "upcomingEventsSummary",
  DEEP_RESEARCH: "deepResearch", MARKET_IMPACT: "marketImpact", PORTFOLIO_IMPACT: "portfolioImpact",
  STRATEGY_IMPACT: "strategyImpact", MATRIX_IMPACT: "matrixImpact", SCANNER_IMPACT: "scannerImpact",
  COMPARISON_RESEARCH: "comparisonResearch", THEME_RESEARCH: "themeResearch", COMPANY_RESEARCH: "companyResearch",
});

function normalizeResearchScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed > 0 && parsed <= 1 ? parsed * 100 : parsed)));
}

function confidence(value, context, hasEvidence) {
  let score = normalizeResearchScore(value);
  if (context.freshness?.staleSources?.length) score = Math.min(score, 65);
  if (!hasEvidence) score = Math.min(score, 30);
  return score;
}

function createResearchCopilotService({ aiService, contextService }) {
  async function run(userId, request = {}, workflow = "QUESTION") {
    if (!aiService?.isConfigured?.()) { const error = new Error("AI Research Copilot is not configured."); error.statusCode = 503; throw error; }
    const question = String(request.question || "").trim();
    if (workflow !== "MARKET_OVERVIEW" && !question && !request.symbol && !request.sector && !request.theme) { const error = new Error("A research question, symbol, sector, or theme is required."); error.statusCode = 400; throw error; }
    if (question.length > 2000) { const error = new Error("Research question must be 2000 characters or fewer."); error.statusCode = 400; throw error; }
    const context = await contextService.build(userId, { ...request, workflow });
    const method = FEATURE_METHODS[workflow] || FEATURE_METHODS.QUESTION;
    const output = await aiService[method](userId, context);
    if (output.relationshipMap?.edges) output.relationshipMap.edges = output.relationshipMap.edges.map((edge) => ({ ...edge, confidence: normalizeResearchScore(edge.confidence) }));
    const evidence = normalizeResearchEvidenceReferences(output.evidence, context.availableEvidence);
    return {
      generatedAt: new Date().toISOString(), workflow, researchOnly: true,
      freshness: context.freshness,
      response: {
        executiveSummary: String(output.executiveSummary || ""),
        keyFindings: output.keyFindings || [], whyItMatters: output.whyItMatters || [], evidence,
        relationshipMap: output.relationshipMap || { nodes: [], edges: [] },
        report: output.report || { currentSituation: [], bullCase: [], bearCase: [], majorCatalysts: [], majorRisks: [], historicalContext: [], macroEnvironment: [], sectorAnalysis: [], relevantCompanies: [], keyUnknowns: [] },
        affectedSystems: output.affectedSystems || { portfolio: [], strategies: [], matrix: [], scanner: [], watchlist: [] },
        risksAlternativeInterpretations: output.risksAlternativeInterpretations || [],
        confidenceScore: confidence(output.confidenceScore, context, evidence.length > 0),
        dataFreshness: output.dataFreshness || context.freshness,
        suggestedFollowUpQuestions: output.suggestedFollowUpQuestions || [],
        limitations: [...new Set([...(output.limitations || []), ...(context.limitations || []), ...(evidence.length ? [] : ["Insufficient evidence available."])])],
        historicalContextUsed: output.historicalContextUsed,
      },
    };
  }
  return { run };
}

module.exports = { FEATURE_METHODS, createResearchCopilotService, normalizeResearchScore };
