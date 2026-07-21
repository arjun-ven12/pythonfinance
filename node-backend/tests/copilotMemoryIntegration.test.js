const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { createAIService } = require("../services/ai/AIService");
const { createNoopAiInvocationStore } = require("../features/ai/services/ai.invocationStore");

function portfolioOutput() {
  return {
    summary: "The current portfolio is concentrated.",
    keyFindings: [],
    reasoning: [],
    evidence: [],
    confidenceScore: 50,
    dataLimitations: ["Current evidence is limited."],
    suggestedNextQuestion: "Review concentration history.",
    claimClassification: { facts: [], platformMetrics: [], interpretations: [], unavailableInformation: [] },
  };
}

test("central AI service injects shared memory context into copilot prompts and returns disclosure metadata", async () => {
  let providerRequest;
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore: createNoopAiInvocationStore(),
    provider: {
      isConfigured: () => true,
      requestStructuredOutput: async (request) => { providerRequest = request; return { provider: "OPENAI", model: "gpt-5.4", output: portfolioOutput() }; },
    },
  });
  let memoryRequest;
  aiService.setMemoryContextService({
    enrichCopilotPayload: async (request) => {
      memoryRequest = request;
      const context = { status: "PARTIAL_CONTEXT", mode: "RELEVANT_HISTORY", notice: "Historical context is supporting evidence.", memories: [{ title: "Prior drawdown review", summary: "Concentration increased drawdown.", category: "RISK", importance: 85, timestamp: "2026-06-01", linkedEntities: [], outcome: "NEGATIVE_OUTCOME", confidence: 80, retrievalReason: ["same portfolio objective"] }], tokenEstimate: 80, omittedCount: 0 };
      return { payload: { ...request.payload, relevantHistoricalContext: context }, historicalContextUsed: { ...context, memories: context.memories.map(({ summary, ...item }) => item) } };
    },
  });

  const result = await aiService.answerPortfolioQuestion("user-1", {
    workflow: "QUESTION",
    question: "Why is drawdown rising?",
    provider: "INTERNAL_PAPER",
    account: {},
    positions: [],
    availableEvidence: [],
  });

  assert.equal(memoryRequest.userId, "user-1");
  assert.equal(memoryRequest.featureType, "portfolioCopilotQuestion");
  assert.equal(providerRequest.input.relevantHistoricalContext.memories[0].title, "Prior drawdown review");
  assert.match(providerRequest.instructions, /Historical Memory Instructions/);
  assert.equal(result.historicalContextUsed.memories[0].summary, undefined);
});
