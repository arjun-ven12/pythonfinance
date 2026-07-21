const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { RESPONSE_SCHEMAS, createAIService } = require("../services/ai/AIService");
const { createNoopAiInvocationStore } = require("../features/ai/services/ai.invocationStore");

function buildEmptyRegimeOverlays() {
  const emptyOverlay = {
    emaFast: "",
    emaSlow: "",
    rsiThreshold: "",
    atrStopMultiple: "",
    atrTakeProfitMultiple: "",
    trailingStopAtrMultiple: "",
    riskPerTrade: "",
    signalThreshold: "",
  };

  return {
    BULL_LOW_VOL: { ...emptyOverlay },
    BULL_HIGH_VOL: { ...emptyOverlay },
    SIDEWAYS: { ...emptyOverlay },
    BEAR_LOW_VOL: { ...emptyOverlay },
    BEAR_HIGH_VOL: { ...emptyOverlay },
    RISK_OFF: { ...emptyOverlay },
  };
}

function collectDuplicateRequiredFields(schema, path = "root", duplicates = []) {
  if (!schema || typeof schema !== "object") {
    return duplicates;
  }

  if (Array.isArray(schema.required)) {
    const seen = new Set();
    const repeated = [];
    schema.required.forEach((field) => {
      if (seen.has(field)) {
        repeated.push(field);
        return;
      }
      seen.add(field);
    });
    if (repeated.length) {
      duplicates.push({ path, fields: repeated });
    }
  }

  if (schema.properties && typeof schema.properties === "object") {
    Object.entries(schema.properties).forEach(([key, value]) => {
      collectDuplicateRequiredFields(value, `${path}.properties.${key}`, duplicates);
    });
  }

  if (schema.items) {
    collectDuplicateRequiredFields(schema.items, `${path}.items`, duplicates);
  }

  return duplicates;
}

function collectMissingRequiredCoverage(schema, path = "root", issues = []) {
  if (!schema || typeof schema !== "object") {
    return issues;
  }

  if (schema.type === "object" && schema.properties && typeof schema.properties === "object") {
    const properties = Object.keys(schema.properties);
    const required = Array.isArray(schema.required) ? schema.required : [];
    const missing = properties.filter((key) => !required.includes(key));
    if (missing.length) {
      issues.push({ path, missing });
    }

    Object.entries(schema.properties).forEach(([key, value]) => {
      collectMissingRequiredCoverage(value, `${path}.properties.${key}`, issues);
    });
  }

  if (schema.items) {
    collectMissingRequiredCoverage(schema.items, `${path}.items`, issues);
  }

  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    collectMissingRequiredCoverage(
      schema.additionalProperties,
      `${path}.additionalProperties`,
      issues
    );
  }

  return issues;
}

test("Strategy copilot response schemas do not duplicate required fields", () => {
  const duplicates = Object.entries(RESPONSE_SCHEMAS).flatMap(([name, entry]) =>
    collectDuplicateRequiredFields(entry.schema, name)
  );

  assert.deepEqual(duplicates, []);
});

test("Strategy copilot response schemas require every declared object property", () => {
  const issues = Object.entries(RESPONSE_SCHEMAS).flatMap(([name, entry]) =>
    collectMissingRequiredCoverage(entry.schema, name)
  );

  assert.deepEqual(issues, []);
});

test("AI service caches stock analysis responses per user and payload", async () => {
  let callCount = 0;
  const captured = [];
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore: createNoopAiInvocationStore(),
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput(args) {
        callCount += 1;
        captured.push(args);
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            rating: 84,
            confidence: 91,
            trend: "Bullish",
            summary: "Momentum remains constructive.",
            strengths: ["Relative strength"],
            risks: ["Event risk"],
            recommendation: "Watch for confirmation.",
          },
        };
      },
    },
  });

  const payload = {
    symbol: "AMD",
    brokerAccountId: "ACC-12345",
  };

  const first = await aiService.analyzeStock("user-1", payload);
  const second = await aiService.analyzeStock("user-1", payload);

  assert.equal(callCount, 1);
  assert.equal(first.meta.cached, false);
  assert.equal(second.meta.cached, true);
  assert.equal(captured[0].input.brokerAccountId, "[REDACTED]");
  assert.match(captured[0].instructions, /\[REDACTED\]/);
});

test("AI service does not cache chat responses", async () => {
  let callCount = 0;
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore: createNoopAiInvocationStore(),
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        callCount += 1;
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            answer: "Here is the answer.",
            confidence: 76,
            bullets: ["One", "Two"],
            followUps: ["Next question"],
          },
        };
      },
    },
  });

  await aiService.chat("user-1", { messages: [{ role: "user", content: "Hi" }] });
  await aiService.chat("user-1", { messages: [{ role: "user", content: "Hi" }] });

  assert.equal(callCount, 2);
});

test("Research Copilot uses the feature-specific extended timeout", async () => {
  let capturedModelConfig;
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"), invocationStore: createNoopAiInvocationStore(),
    provider: { isConfigured: () => true, async requestStructuredOutput(args) { capturedModelConfig = args.modelConfig; throw new Error("stop after config capture"); } },
  });
  await assert.rejects(aiService.deepResearch("user-1", { workflow: "DEEP_RESEARCH", question: "Research semiconductors", availableEvidence: [] }), /stop after config capture/);
  const expected = Math.max(30_000, Math.min(180_000, Number.parseInt(process.env.OPENAI_RESEARCH_TIMEOUT_MS, 10) || 90_000));
  assert.equal(capturedModelConfig.timeoutMs, expected);
});

test("AI service dedupes identical concurrent requests and records invocation metadata", async () => {
  let callCount = 0;
  const invocationStore = createNoopAiInvocationStore();
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore,
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        callCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          rawId: "resp_dedupe",
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          output: {
            rating: 84,
            confidence: 91,
            trend: "Bullish",
            summary: "Momentum remains constructive.",
            strengths: ["Relative strength"],
            risks: ["Event risk"],
            recommendation: "Watch for confirmation.",
          },
        };
      },
    },
  });

  const [first, second] = await Promise.all([
    aiService.analyzeStock("user-1", { symbol: "AMD" }),
    aiService.analyzeStock("user-1", { symbol: "AMD" }),
  ]);

  assert.equal(callCount, 1);
  assert.equal(first.rating, second.rating);
  assert.equal(invocationStore._records.length, 1);
  assert.equal(invocationStore._records[0].providerResponseId, "resp_dedupe");
  assert.equal(invocationStore._records[0].promptVersion, "v1");
  assert.ok(invocationStore._records[0].promptHash);
  assert.ok(invocationStore._records[0].schemaHash);
  assert.ok(invocationStore._records[0].inputHash);
});

test("AI service enforces user token budgets before provider calls", async () => {
  let callCount = 0;
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore: {
      async getDailyUsage() {
        return { totalTokens: 100, estimatedCostUsd: 0 };
      },
      async create() {},
      async diagnostics() {
        return { totals: {}, byFeature: {} };
      },
    },
    governanceConfig: {
      dailyTokenLimitPerUser: 50,
      dailyCostLimitPerUser: 10,
      maxConcurrentRequestsPerUser: 2,
      maxConcurrentRequestsGlobal: 8,
      cacheMaxEntries: 10,
    },
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        callCount += 1;
        return {};
      },
    },
  });

  await assert.rejects(
    () => aiService.analyzeStock("user-1", { symbol: "AMD" }),
    /AI daily token budget exceeded/
  );
  assert.equal(callCount, 0);
});

test("AI service enforces feature token budgets before provider calls", async () => {
  let callCount = 0;
  const invocationStore = createNoopAiInvocationStore();
  await invocationStore.create({
    userId: "user-1",
    featureType: "chat",
    totalTokens: 25,
    estimatedCostUsd: 0,
    status: "SUCCESS",
  });
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore,
    governanceConfig: {
      dailyTokenLimitPerUser: 1000,
      dailyCostLimitPerUser: 10,
      maxConcurrentRequestsPerUser: 2,
      maxConcurrentRequestsGlobal: 8,
      cacheMaxEntries: 10,
      featureDailyBudgets: {
        chat: { tokenLimit: 20, costLimit: 10 },
      },
    },
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        callCount += 1;
        return {};
      },
    },
  });

  await assert.rejects(
    () => aiService.chat("user-1", { messages: [{ role: "user", content: "Hi" }] }),
    /AI daily token budget exceeded for chat/
  );
  assert.equal(callCount, 0);
  assert.equal(invocationStore._records.at(-1).errorCategory, "feature_token_budget_exceeded");
});

test("AI service uses configurable input/output pricing", async () => {
  const invocationStore = createNoopAiInvocationStore();
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore,
    governanceConfig: {
      dailyTokenLimitPerUser: 1000,
      dailyCostLimitPerUser: 10,
      maxConcurrentRequestsPerUser: 2,
      maxConcurrentRequestsGlobal: 8,
      cacheMaxEntries: 10,
      inputCostPer1M: 1,
      outputCostPer1M: 3,
      featureDailyBudgets: {},
    },
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        return {
          provider: "OPENAI",
          model: "test-model",
          usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
          output: {
            answer: "Here is the answer.",
            confidence: 76,
            bullets: [],
            followUps: [],
          },
        };
      },
    },
  });

  await aiService.chat("user-1", { messages: [{ role: "user", content: "Hi" }] });
  assert.equal(invocationStore._records.at(-1).estimatedCostUsd, 0.0007);
});

test("AI service rejects out-of-bounds structured outputs", async () => {
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore: createNoopAiInvocationStore(),
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            rating: 120,
            confidence: 91,
            trend: "Bullish",
            summary: "Momentum remains constructive.",
            strengths: ["Relative strength"],
            risks: ["Event risk"],
            recommendation: "Watch for confirmation.",
          },
        };
      },
    },
  });

  await assert.rejects(
    () => aiService.analyzeStock("user-1", { symbol: "AMD" }),
    /must be <= 100/
  );
});

test("AI service supports structured strategy draft generation", async () => {
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore: createNoopAiInvocationStore(),
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            summary: "This draft encodes a simple RSI recovery swing idea.",
            recommendation: "Review the generated draft and validate the assumptions before saving it.",
            reasoning: ["The prompt explicitly requested RSI recovery logic in an uptrend."],
            evidence: [],
            limitations: ["Insufficient evidence available."],
            nextAction: "Inspect the generated Strategy Contract and assumptions.",
            reasoningBreakdown: {
              evidenceBackedStatements: [],
              inferences: ["The prompt implies a mean-reversion recovery setup."],
              suggestions: ["Validate the draft in Strategy Lab before promotion."],
              unknowns: ["Insufficient evidence available."],
            },
            status: "READY",
            title: "RSI Recovery Draft",
            description: "Swing draft for RSI recovery above 30 in an uptrend.",
            tradingStyle: "Swing",
            marketType: "US",
            timeframe: { primary: "1D", entry: "1D" },
            entryRules: ["RSI crosses above 30", "Price is above the 50 EMA"],
            exitRules: ["RSI exceeds 70"],
            validationRules: ["Require at least 30 trades"],
            riskRules: ["Risk 1% per trade"],
            positionSizing: "Risk 1% per trade.",
            assumptions: ["Defaults to US equities."],
            potentialRisks: ["Can whipsaw in sideways markets."],
            missingInformation: [],
            unsupportedElements: [],
            confidenceScore: 78,
            explanation: {
              summary: "A simple recovery draft.",
              indicatorRationale: ["RSI spots recovery", "EMA keeps trend alignment"],
              entryRationale: ["Entry waits for oversold recovery"],
              exitRationale: ["Exit locks gains after momentum stretches"],
              strengths: ["Simple"],
              weaknesses: ["Needs further user refinement"],
            },
            builderDraft: {
              objective: "max_risk_adjusted_return",
              template: "Mean Reversion",
              universeType: "CUSTOM_SCREEN",
              marketBias: "US",
              primaryTimeframe: "1D",
              entryTimeframe: "1D",
              sizingMethod: "risk_per_trade",
              sizingPreviewCapital: "50000",
              capitalSimulation: "50000",
              maxDrawdown: "12",
              maxPositionSize: "8",
              maxSectorExposure: "30",
              maxDailyLoss: "3",
              emaFast: "20",
              emaSlow: "50",
              rsiThreshold: "30",
              atrStopMultiple: "1.5",
              atrTakeProfitMultiple: "4",
              trailingStopAtrMultiple: "2",
              riskPerTrade: "0.01",
              signalThreshold: "60",
              technicalWeight: "0.5",
              regimeWeight: "0.25",
              newsWeight: "0.15",
              openaiWeight: "0.1",
              regimeFilter: true,
              newsFilter: false,
              marketHoursOnly: true,
              earningsFilter: true,
              universeId: "",
              universeName: "",
              allowedSectors: [],
              allowedRegimes: ["BULL_LOW_VOL"],
              instrumentTypes: ["SINGLE_STOCK"],
              volatilityMin: "0",
              volatilityMax: "0.03",
              liquidityFloor: "1000000",
              holdingPeriodDays: "15",
              regimeOverlays: buildEmptyRegimeOverlays(),
              rules: [
                {
                  group: "Entry",
                  operator: "AND",
                  left: "RSI",
                  comparator: "CROSSES_ABOVE",
                  right: "30",
                  connector: "AND",
                },
              ],
            },
          },
        };
      },
    },
  });

  const result = await aiService.generateStrategyDraft("user-1", {
    prompt: "Build a swing RSI recovery strategy.",
  });

  assert.equal(result.status, "READY");
  assert.equal(result.builderDraft.template, "Mean Reversion");
  assert.equal(result.meta.cached, false);
});

test("AI service supports strategy explanation workflows", async () => {
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore: createNoopAiInvocationStore(),
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            summary: "Trend-following strategy.",
            recommendation: "Treat the rules as a momentum strategy with trend confirmation.",
            reasoning: ["Price-above-EMA plus RSI confirmation implies directional filtering."],
            evidence: [],
            limitations: ["Insufficient evidence available."],
            nextAction: "Compare this explanation with backtest behavior.",
            reasoningBreakdown: {
              evidenceBackedStatements: [],
              inferences: ["The indicator set implies trend-following behavior."],
              suggestions: ["Check whether the live rules match the explanation."],
              unknowns: ["Insufficient evidence available."],
            },
            philosophy: "Trade with momentum while filtering noise.",
            indicators: ["EMA", "RSI"],
            entryRules: ["Price above EMA."],
            exitRules: ["Exit on signal reversal."],
            validationRules: ["Require acceptable drawdown."],
            riskRules: ["Risk a fixed fraction of capital."],
            positionSizing: "Risk per trade.",
            expectedMarketConditions: ["Trending markets"],
            strengths: ["Simple"],
            weaknesses: ["Can lag reversals"],
            confidenceScore: 83,
          },
        };
      },
    },
  });

  const result = await aiService.explainStrategy("user-1", {
    workflow: "EXPLAIN",
    strategy: { name: "Trend", settings: {} },
  });

  assert.equal(result.confidenceScore, 83);
  assert.equal(result.indicators[0], "EMA");
});

test("AI service rejects malformed strategy evidence objects", async () => {
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore: createNoopAiInvocationStore(),
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            summary: "Explanation",
            recommendation: "Recommendation",
            reasoning: ["Reasoning"],
            evidence: [{
              sourceType: "MADE_UP_SOURCE",
              sourceId: "1",
              metricName: "Sharpe",
              metricValue: "1.2",
              timestamp: "",
              dateRange: "",
              interpretation: "Invalid source type",
              strength: "HIGH",
            }],
            limitations: ["Insufficient evidence available."],
            nextAction: "Do nothing.",
            reasoningBreakdown: {
              evidenceBackedStatements: [],
              inferences: [],
              suggestions: [],
              unknowns: [],
            },
            philosophy: "Explain it.",
            indicators: ["EMA"],
            entryRules: ["Entry"],
            exitRules: ["Exit"],
            validationRules: ["Validation"],
            riskRules: ["Risk"],
            positionSizing: "Sizing",
            expectedMarketConditions: ["Trend"],
            strengths: ["Simple"],
            weaknesses: ["Sparse"],
            confidenceScore: 80,
          },
        };
      },
    },
  });

  await assert.rejects(
    () => aiService.explainStrategy("user-1", { workflow: "EXPLAIN", strategy: { name: "X" } }),
    /allowed enum value/i
  );
});

test("AI service rejects out-of-bounds strategy copilot confidence scores", async () => {
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore: createNoopAiInvocationStore(),
    provider: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            summary: "Explanation",
            recommendation: "Recommendation",
            reasoning: ["Reasoning"],
            evidence: [],
            limitations: ["Insufficient evidence available."],
            nextAction: "Do nothing.",
            reasoningBreakdown: {
              evidenceBackedStatements: [],
              inferences: [],
              suggestions: [],
              unknowns: ["Insufficient evidence available."],
            },
            philosophy: "Explain it.",
            indicators: ["EMA"],
            entryRules: ["Entry"],
            exitRules: ["Exit"],
            validationRules: ["Validation"],
            riskRules: ["Risk"],
            positionSizing: "Sizing",
            expectedMarketConditions: ["Trend"],
            strengths: ["Simple"],
            weaknesses: ["Sparse"],
            confidenceScore: 120,
          },
        };
      },
    },
  });

  await assert.rejects(
    () => aiService.explainStrategy("user-1", { workflow: "EXPLAIN", strategy: { name: "X" } }),
    /must be <= 100/i
  );
});

test("AI diagnostics include feature, user, cache, rejection, and provider state", async () => {
  const invocationStore = createNoopAiInvocationStore();
  const aiService = createAIService({
    promptDir: path.join(__dirname, "..", "..", "prompts"),
    invocationStore,
    provider: {
      isConfigured: () => true,
      getHealth: () => ({ provider: "OPENAI", circuitState: "CLOSED" }),
      async requestStructuredOutput() {
        return {
          provider: "OPENAI",
          model: "test-model",
          output: {
            rating: 84,
            confidence: 91,
            trend: "Bullish",
            summary: "Momentum remains constructive.",
            strengths: ["Relative strength"],
            risks: ["Event risk"],
            recommendation: "Watch for confirmation.",
          },
        };
      },
    },
  });

  await aiService.analyzeStock("user-1", { symbol: "AMD" });
  await aiService.analyzeStock("user-1", { symbol: "AMD" });
  const diagnostics = await aiService.getDiagnostics();

  assert.equal(diagnostics.durable.byFeature.analyzeStock.requests, 2);
  assert.equal(diagnostics.durable.byUser["user-1"].requests, 2);
  assert.equal(diagnostics.durable.cacheByFeature.analyzeStock.hits, 1);
  assert.ok(diagnostics.durable.rejectionReasons);
  assert.equal(diagnostics.governance.provider.circuitState, "CLOSED");
  assert.equal(diagnostics.governance.cache.byFeature.analyzeStock.hits, 1);
});
