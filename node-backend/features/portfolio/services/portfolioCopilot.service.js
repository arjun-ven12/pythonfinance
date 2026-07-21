const {
  normalizePortfolioEvidenceReferences,
} = require("./portfolioCopilotEvidence.service");

function normalizeConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed > 0 && parsed <= 1 ? parsed * 100 : parsed)));
}

function createPortfolioCopilotService({ aiService, contextService }) {
  function assertConfigured() {
    if (!aiService?.isConfigured?.()) {
      const error = new Error("AI Portfolio Copilot is not configured.");
      error.statusCode = 503;
      throw error;
    }
  }

  function validateRequest(request = {}, workflow) {
    if (workflow === "QUESTION" && !String(request.question || "").trim()) {
      const error = new Error("A portfolio question is required.");
      error.statusCode = 400;
      throw error;
    }
    if (String(request.question || "").length > 2000) {
      const error = new Error("Portfolio question must be 2000 characters or fewer.");
      error.statusCode = 400;
      throw error;
    }
    for (const field of ["symbols", "strategyIds"]) {
      if (request[field] !== undefined && (!Array.isArray(request[field]) || request[field].length > 20)) {
        const error = new Error(`${field} must be an array with at most 20 values.`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  async function run(userId, request, workflow) {
    assertConfigured();
    validateRequest(request, workflow);
    const context = await contextService.buildContext(userId, { ...request, workflow });
    const output = workflow === "OVERVIEW"
      ? await aiService.generatePortfolioOverview(userId, context)
      : await aiService.answerPortfolioQuestion(userId, context);
    const evidence = normalizePortfolioEvidenceReferences(output.evidence, context.availableEvidence);
    const limitations = [...new Set([
      ...(output.dataLimitations || []),
      ...(context.limitations || []),
      ...(evidence.length ? [] : ["Insufficient evidence available."]),
    ])];
    let confidenceScore = normalizeConfidence(output.confidenceScore);
    if (context.freshness.stale) confidenceScore = Math.min(confidenceScore, 60);
    if (context.tradingState.reconciliation?.matched === false) confidenceScore = Math.min(confidenceScore, 55);
    if (!evidence.length) confidenceScore = Math.min(confidenceScore, 35);
    return {
      generatedAt: new Date().toISOString(),
      provider: context.provider,
      executionMode: context.executionMode,
      freshness: context.freshness,
      response: {
        summary: String(output.summary || ""),
        keyFindings: Array.isArray(output.keyFindings) ? output.keyFindings.map(String) : [],
        reasoning: Array.isArray(output.reasoning) ? output.reasoning.map(String) : [],
        evidence,
        confidenceScore,
        dataLimitations: limitations,
        suggestedNextQuestion: String(output.suggestedNextQuestion || ""),
        claimClassification: output.claimClassification || {
          facts: [], platformMetrics: [], interpretations: [], unavailableInformation: [],
        },
        historicalContextUsed: output.historicalContextUsed,
      },
    };
  }

  return {
    generateOverview(userId, request = {}) {
      return run(userId, { ...request, question: "Explain my portfolio." }, "OVERVIEW");
    },
    ask(userId, request = {}) {
      return run(userId, request, "QUESTION");
    },
  };
}

module.exports = { createPortfolioCopilotService, normalizeConfidence };
