const { createAiService, createAiError, sanitizeAiInput } = require("../../features/ai/services/ai.service");
const { createOpenAIClient } = require("../../features/ai/services/ai.client");
const { createPromptRegistry } = require("../../features/ai/services/ai.prompts");

const RESPONSE_SCHEMAS = Object.freeze({
  analyzeStock: {
    name: "stock_analysis",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        rating: { type: "number" },
        confidence: { type: "number" },
        trend: { type: "string", enum: ["Bullish", "Neutral", "Bearish"] },
        summary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        recommendation: { type: "string" },
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
        overallRating: { type: "number" },
        confidence: { type: "number" },
        summary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        actions: { type: "array", items: { type: "string" } },
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
  explainScannerResult: {
    name: "scanner_result_explanation",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        score: { type: "number" },
        confidence: { type: "number" },
        summary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        recommendation: { type: "string" },
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
        confidence: { type: "number" },
        summary: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        warnings: { type: "array", items: { type: "string" } },
        recommendation: { type: "string" },
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
        confidence: { type: "number" },
        summary: { type: "string" },
        keyPoints: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        recommendation: { type: "string" },
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
        answer: { type: "string" },
        confidence: { type: "number" },
        bullets: { type: "array", items: { type: "string" } },
        followUps: { type: "array", items: { type: "string" } },
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
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              area: { type: "string" },
              change: { type: "string" },
              rationale: { type: "string" },
            },
            required: ["area", "change", "rationale"],
          },
        },
        reasoning: { type: "string" },
        expected_impact: { type: "string" },
      },
      required: ["suggested_changes", "reasoning", "expected_impact"],
    },
  },
});

const CACHE_TTLS_MS = Object.freeze({
  analyzeStock: 5 * 60 * 1000,
  explainScannerResult: 5 * 60 * 1000,
  summarizeNews: 5 * 60 * 1000,
  analyzePortfolio: 30 * 1000,
  reviewTrade: 30 * 1000,
  chat: 0,
  playbookRecommendation: 5 * 60 * 1000,
});

function buildLegacyFeatures() {
  return {
    analyzeStock: {
      promptTemplate: "stock-analysis.md",
      schemaName: RESPONSE_SCHEMAS.analyzeStock.name,
      outputSchema: RESPONSE_SCHEMAS.analyzeStock.schema,
      cacheTtlMs: CACHE_TTLS_MS.analyzeStock,
    },
    analyzePortfolio: {
      promptTemplate: "portfolio-analysis.md",
      schemaName: RESPONSE_SCHEMAS.analyzePortfolio.name,
      outputSchema: RESPONSE_SCHEMAS.analyzePortfolio.schema,
      cacheTtlMs: CACHE_TTLS_MS.analyzePortfolio,
    },
    explainScannerResult: {
      promptTemplate: "scanner.md",
      schemaName: RESPONSE_SCHEMAS.explainScannerResult.name,
      outputSchema: RESPONSE_SCHEMAS.explainScannerResult.schema,
      cacheTtlMs: CACHE_TTLS_MS.explainScannerResult,
    },
    reviewTrade: {
      promptTemplate: "trade-review.md",
      schemaName: RESPONSE_SCHEMAS.reviewTrade.name,
      outputSchema: RESPONSE_SCHEMAS.reviewTrade.schema,
      cacheTtlMs: CACHE_TTLS_MS.reviewTrade,
    },
    summarizeNews: {
      promptTemplate: "news-summary.md",
      schemaName: RESPONSE_SCHEMAS.summarizeNews.name,
      outputSchema: RESPONSE_SCHEMAS.summarizeNews.schema,
      cacheTtlMs: CACHE_TTLS_MS.summarizeNews,
    },
    chat: {
      promptTemplate: "chat.md",
      schemaName: RESPONSE_SCHEMAS.chat.name,
      outputSchema: RESPONSE_SCHEMAS.chat.schema,
      cacheTtlMs: CACHE_TTLS_MS.chat,
    },
    playbookRecommendation: {
      promptTemplate: "playbook-recommendation.md",
      schemaName: RESPONSE_SCHEMAS.playbookRecommendation.name,
      outputSchema: RESPONSE_SCHEMAS.playbookRecommendation.schema,
      cacheTtlMs: CACHE_TTLS_MS.playbookRecommendation,
    },
  };
}

function createAIService({
  provider = createOpenAIClient(),
  promptDir,
  now,
} = {}) {
  const aiPlatform = createAiService({
    client: provider,
    promptRegistry: createPromptRegistry({ promptDir }),
    featureRegistry: buildLegacyFeatures(),
    now,
  });

  return {
    isConfigured() {
      return aiPlatform.isConfigured();
    },

    async analyzeStock(userId, payload) {
      return aiPlatform.createFeatureRunner("analyzeStock")(userId, payload);
    },

    async analyzePortfolio(userId, payload) {
      return aiPlatform.createFeatureRunner("analyzePortfolio")(userId, payload);
    },

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
  };
}

module.exports = {
  CACHE_TTLS_MS,
  RESPONSE_SCHEMAS,
  createAIService,
  createAiError,
  sanitizeAiInput,
};
