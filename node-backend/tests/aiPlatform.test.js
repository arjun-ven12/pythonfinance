const assert = require("node:assert/strict");
const test = require("node:test");

const { createAiService } = require("../features/ai/services/ai.service");
const {
  createContextRegistry,
  createStrategyContextBuilder,
} = require("../features/ai/services/ai.context");
const { createPromptRegistry } = require("../features/ai/services/ai.prompts");
const { createAiAuditService } = require("../features/ai/services/ai.audit");
const {
  createStrategyStorageService,
} = require("../features/strategyLab/services/strategyStorage.service");

process.env.STRATEGY_MASTER_KEY =
  process.env.STRATEGY_MASTER_KEY ||
  "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

test("generic AI platform validates malformed structured output", async () => {
  const aiService = createAiService({
    client: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          usage: { total_tokens: 42 },
          output: {
            answer: "ok",
          },
        };
      },
    },
    promptRegistry: createPromptRegistry(),
  });

  await assert.rejects(
    () =>
      aiService.execute({
        featureType: "test-chat",
        userId: "user-1",
        payload: { question: "hi" },
        promptTemplate: { type: "inline", template: "Return JSON for {{contextJson}}" },
        outputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            answer: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["answer", "confidence"],
        },
        schemaName: "test_chat",
      }),
    /missing required field/i
  );
});

test("generic AI platform decrypts strategy context in-memory before AI execution", async () => {
  const strategyStorage = createStrategyStorageService();
  const encryptedRecord = strategyStorage.encryptVersionForStorage({
    id: "version-1",
    userId: "user-1",
    settingsJson: {
      strategyPrompt: "Buy breakouts with volume confirmation.",
      strategyJson: {
        name: "Breakout Strategy",
        executable: {
          entryRules: [{ type: "breakout" }],
        },
      },
    },
  });

  let capturedInput = null;
  const auditService = createAiAuditService();
  const contextRegistry = createContextRegistry({
    builders: {
      secureStrategy: createStrategyContextBuilder({
        strategyStorage,
        recordType: "strategy-version",
        selectContext(record) {
          return {
            strategy: {
              name: record.strategyJson?.name,
              prompt: record.settingsJson?.strategyPrompt,
              entryRules: record.strategyJson?.executable?.entryRules || [],
            },
          };
        },
      }),
    },
  });

  const aiService = createAiService({
    client: {
      isConfigured: () => true,
      async requestStructuredOutput(args) {
        capturedInput = args.input;
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          usage: { total_tokens: 100 },
          output: {
            summary: "Looks valid",
          },
        };
      },
    },
    promptRegistry: createPromptRegistry(),
    contextRegistry,
    auditService,
  });

  const result = await aiService.execute({
    featureType: "strategy-review",
    userId: "user-1",
    payload: {
      strategyRecord: encryptedRecord,
    },
    contextBuilder: "secureStrategy",
    promptTemplate: { type: "inline", template: "Review {{contextJson}}" },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
    schemaName: "strategy_review",
  });

  assert.equal(capturedInput.strategy.name, "Breakout Strategy");
  assert.equal(
    capturedInput.strategy.prompt,
    "Buy breakouts with volume confirmation."
  );
  assert.equal(capturedInput.strategy.encryptedStrategy, undefined);
  assert.equal(result.data.summary, "Looks valid");

  const [auditEntry] = auditService.getEntries();
  assert.equal(auditEntry.featureType, "strategy-review");
  assert.equal("prompt" in auditEntry, false);
  assert.equal("context" in auditEntry, false);
});

test("generic AI platform keeps audit logs free of plaintext strategy payloads", async () => {
  const auditEntries = [];
  const aiService = createAiService({
    client: {
      isConfigured: () => true,
      async requestStructuredOutput() {
        return {
          provider: "OPENAI",
          model: "gpt-5.4",
          output: {
            status: "ok",
          },
        };
      },
    },
    auditService: createAiAuditService({
      sink(entry) {
        auditEntries.push(entry);
      },
    }),
  });

  await aiService.execute({
    featureType: "risk-review",
    userId: "user-1",
    payload: {
      sensitiveStrategy: "never log this strategy plaintext",
    },
    promptTemplate: { type: "inline", template: "Summarize {{contextJson}}" },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: { type: "string" },
      },
      required: ["status"],
    },
    schemaName: "risk_review",
  });

  assert.equal(auditEntries.length, 1);
  assert.match(JSON.stringify(auditEntries[0]), /risk-review/);
  assert.doesNotMatch(
    JSON.stringify(auditEntries[0]),
    /never log this strategy plaintext/
  );
});
