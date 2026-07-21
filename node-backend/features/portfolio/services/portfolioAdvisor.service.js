const {
  buildScenarioEvidence,
  normalizePortfolioEvidenceReferences,
} = require("./portfolioCopilotEvidence.service");
const { validatePortfolioProposal } = require("./portfolioScenarioContract");
const { normalizeConfidence } = require("./portfolioCopilot.service");
const { randomUUID } = require("node:crypto");

function uniqueStrings(items = []) {
  return [...new Set(items.filter(Boolean).map(String))];
}

function confidenceForContext(value, context, hasEvidence = true) {
  let score = normalizeConfidence(value);
  if (context.freshness?.stale) score = Math.min(score, 60);
  if (context.tradingState?.reconciliation?.matched === false) score = Math.min(score, 55);
  if (!hasEvidence) score = Math.min(score, 35);
  return score;
}

function createPortfolioAdvisorService({ aiService, contextService, scenarioService }) {
  function normalizeProposalMetadata(proposal = {}) {
    return {
      ...proposal,
      proposalId: String(proposal.proposalId || randomUUID()),
      reasoning: Array.isArray(proposal.reasoning) ? proposal.reasoning : proposal.rationale || [],
      requiredApprovals: Array.isArray(proposal.requiredApprovals) && proposal.requiredApprovals.length
        ? proposal.requiredApprovals
        : ["USER_REVIEW", "PORTFOLIO_APPROVAL"],
    };
  }

  function validatePreferences(preferences) {
    if (!preferences) return;
    const percentFields = ["targetVolatility", "targetCash", "targetDrawdown", "allowedTurnoverPct"];
    for (const field of percentFields) {
      if (preferences[field] !== undefined && (!Number.isFinite(Number(preferences[field])) || Number(preferences[field]) < 0 || Number(preferences[field]) > 100)) {
        const error = new Error(`${field} must be between 0 and 100.`); error.statusCode = 400; throw error;
      }
    }
    if (preferences.maximumTransactionCost !== undefined && Number(preferences.maximumTransactionCost) < 0) { const error = new Error("maximumTransactionCost cannot be negative."); error.statusCode = 400; throw error; }
  }
  function assertConfigured() {
    if (!aiService?.isConfigured?.()) {
      const error = new Error("AI Portfolio Advisor is not configured.");
      error.statusCode = 503;
      throw error;
    }
  }

  function assertQuestion(question) {
    const value = String(question || "").trim();
    if (!value) {
      const error = new Error("A portfolio objective or scenario question is required.");
      error.statusCode = 400;
      throw error;
    }
    if (value.length > 2000) {
      const error = new Error("Portfolio request must be 2000 characters or fewer.");
      error.statusCode = 400;
      throw error;
    }
    return value;
  }

  async function recommend(userId, request = {}) {
    assertConfigured();
    const question = assertQuestion(request.question);
    validatePreferences(request.preferences);
    const context = await contextService.buildContext(userId, { ...request, question, workflow: "RECOMMEND" });
    const output = await aiService.generatePortfolioRecommendations(userId, { ...context, workflow: "RECOMMEND" });
    const recommendations = (output.recommendations || []).map((rawProposal) => {
      const proposal = normalizeProposalMetadata(rawProposal);
      validatePortfolioProposal(proposal, context, { allowUnresolvedAdds: true });
      const evidence = normalizePortfolioEvidenceReferences(proposal.evidence, context.availableEvidence);
      return { ...proposal, evidence, confidence: confidenceForContext(proposal.confidence, context, evidence.length > 0) };
    });
    const evidence = normalizePortfolioEvidenceReferences(output.evidence, context.availableEvidence);
    return {
      generatedAt: new Date().toISOString(), provider: context.provider, executionMode: context.executionMode,
      freshness: context.freshness, advisoryOnly: true, noChangesApplied: true,
      response: {
        summary: String(output.summary || ""), portfolioConcernOrObjective: String(output.portfolioConcernOrObjective || question),
        recommendations, evidence, confidenceScore: confidenceForContext(output.confidenceScore, context, evidence.length > 0),
        dataModelLimitations: uniqueStrings([...(output.dataModelLimitations || []), ...(context.limitations || [])]),
        availableUserActions: uniqueStrings(output.availableUserActions || []).filter((item) => !/execute|place order|approve/i.test(item)),
        historicalContextUsed: output.historicalContextUsed,
      },
    };
  }

  async function scenario(userId, request = {}) {
    assertConfigured();
    validatePreferences(request.preferences);
    const question = request.proposal ? String(request.question || request.proposal.objective || "Simulate this proposal.") : assertQuestion(request.question);
    const context = await contextService.buildContext(userId, { ...request, question, workflow: "PROPOSE_SCENARIO" });
    const proposal = normalizeProposalMetadata(request.proposal || await aiService.generatePortfolioScenarioProposal(userId, { ...context, workflow: "PROPOSE_SCENARIO" }));
    validatePortfolioProposal(proposal, context, { allowUnresolvedAdds: true });
    const proposalEvidence = normalizePortfolioEvidenceReferences(proposal.evidence || [], context.availableEvidence);
    const comparison = await scenarioService.simulate({ userId, context, proposal });
    const scenarioEvidence = buildScenarioEvidence(comparison, proposal);
    const availableEvidence = [...context.availableEvidence, ...scenarioEvidence];
    const output = await aiService.interpretPortfolioScenario(userId, {
      ...context, workflow: "INTERPRET_SCENARIO", proposal: { ...proposal, evidence: proposalEvidence },
      deterministicComparison: comparison, scenarioEvidence, availableEvidence,
    });
    const evidence = normalizePortfolioEvidenceReferences(output.evidence, availableEvidence);
    return {
      generatedAt: new Date().toISOString(), provider: context.provider, executionMode: context.executionMode,
      freshness: context.freshness, advisoryOnly: true, noChangesApplied: true,
      proposal: { ...proposal, evidence: proposalEvidence }, comparison,
      response: {
        summary: String(output.summary || ""), portfolioConcernOrObjective: String(output.portfolioConcernOrObjective || proposal.objective),
        recommendation: String(output.recommendation || ""), proposedActions: output.proposedActions || [], evidence,
        expectedBenefits: output.expectedBenefits || [], risksTradeoffs: output.risksTradeoffs || [],
        confidenceScore: confidenceForContext(output.confidenceScore, context, evidence.length > 0),
        dataModelLimitations: uniqueStrings([...(output.dataModelLimitations || []), ...(context.limitations || []), ...comparison.unsupportedMetrics.map((metric) => `${metric} is unavailable for this simulation method.`)]),
        availableUserActions: uniqueStrings(output.availableUserActions || []).filter((item) => !/execute|place order|approve/i.test(item)),
        historicalContextUsed: output.historicalContextUsed,
      },
    };
  }

  async function compare(userId, request = {}) {
    assertConfigured();
    if (!Array.isArray(request.proposals) || request.proposals.length < 2 || request.proposals.length > 3) {
      const error = new Error("Compare requires two or three structured proposals.");
      error.statusCode = 400;
      throw error;
    }
    const context = await contextService.buildContext(userId, { ...request, question: request.question || "Compare portfolio proposals.", workflow: "COMPARE_PROPOSALS" });
    const options = [];
    for (const rawProposal of request.proposals) {
      const proposal = normalizeProposalMetadata(rawProposal);
      validatePortfolioProposal(proposal, context, { allowUnresolvedAdds: true });
      options.push({ proposal, comparison: await scenarioService.simulate({ userId, context, proposal }) });
    }
    const scenarioEvidence = options.flatMap((option) => buildScenarioEvidence(option.comparison, option.proposal));
    const availableEvidence = [...context.availableEvidence, ...scenarioEvidence];
    const output = await aiService.comparePortfolioProposals(userId, {
      ...context, workflow: "COMPARE_PROPOSALS", options, scenarioEvidence, availableEvidence,
    });
    const evidence = normalizePortfolioEvidenceReferences(output.evidence, availableEvidence);
    return {
      generatedAt: new Date().toISOString(), provider: context.provider, executionMode: context.executionMode,
      freshness: context.freshness, advisoryOnly: true, noChangesApplied: true, options,
      response: {
        ...output, evidence, confidenceScore: confidenceForContext(output.confidenceScore, context, evidence.length > 0),
        dataModelLimitations: uniqueStrings([...(output.dataModelLimitations || []), ...(context.limitations || [])]),
        availableUserActions: uniqueStrings(output.availableUserActions || []).filter((item) => !/execute|place order|approve/i.test(item)),
        historicalContextUsed: output.historicalContextUsed,
      },
    };
  }

  return { compare, recommend, scenario };
}

module.exports = { confidenceForContext, createPortfolioAdvisorService };
