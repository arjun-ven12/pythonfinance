const assert = require("node:assert/strict");
const test = require("node:test");
const { createEmbeddingProvider } = require("../features/memory/services/embeddingProvider.service");

function config(overrides = {}) {
  return { provider: "OPENAI", model: "text-embedding-3-small", dimensions: 3, batchSize: 25, timeoutMs: 1000, ...overrides };
}
function response(payload, { ok = true, status = 200, retryAfter = null } = {}) {
  return { ok, status, json: async () => payload, headers: { get: () => retryAfter } };
}

test("embedding provider batches inputs and validates dimensions", async () => {
  let body;
  const provider = createEmbeddingProvider({
    config: config(),
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return response({ data: [{ index: 1, embedding: [4, 5, 6] }, { index: 0, embedding: [1, 2, 3] }], model: "text-embedding-3-small", usage: { total_tokens: 4 } });
    },
  });
  const result = await provider.embed(["first", "second"]);
  assert.deepEqual(body.input, ["first", "second"]);
  assert.equal(body.dimensions, 3);
  assert.deepEqual(result.vectors[0], [1, 2, 3]);
  assert.equal(provider.diagnostics().tokens, 4);
});

test("embedding provider persists token, cost, retry and context diagnostics", async () => {
  let invocation;
  const provider = createEmbeddingProvider({
    config: config(),
    apiKey: "test-key",
    invocationStore: { create: async (record) => { invocation = record; } },
    pricingConfig: {
      models: { "text-embedding-3-small": { inputCostPer1M: 1, cachedInputCostPer1M: 0, outputCostPer1M: 0 } },
      usdToSgdRate: 1.35,
      pricingVersion: "test",
    },
    fetchImpl: async () => response({
      data: [{ index: 0, embedding: [1, 2, 3] }],
      model: "text-embedding-3-small",
      usage: { total_tokens: 10 },
    }),
  });
  await provider.embed(["memory context"], {
    userIds: ["user-a", "user-b"],
    featureType: "memoryEmbeddingBatch",
    section: "retrievedMemories",
    promptVersion: "v1",
  });
  assert.equal(invocation.userId, null);
  assert.deepEqual(invocation.userIds, ["user-a", "user-b"]);
  assert.equal(invocation.inputTokens, 10);
  assert.equal(invocation.totalTokens, 10);
  assert.equal(invocation.pricingConfigured, true);
  assert.equal(invocation.estimatedCostSgd, 0.0000135);
  assert.equal(invocation.tokenBreakdown.sections.retrievedMemories.tokens, 10);
  assert.equal(invocation.retryCount, 0);
});

test("embedding provider honors Retry-After on 429", async () => {
  let calls = 0;
  const delays = [];
  const provider = createEmbeddingProvider({
    config: config(), apiKey: "test-key", maxRetries: 1,
    sleepImpl: async (ms) => delays.push(ms),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return response({ error: { message: "slow down" } }, { ok: false, status: 429, retryAfter: "2" });
      return response({ data: [{ index: 0, embedding: [1, 2, 3] }] });
    },
  });
  await provider.embed(["retry"]);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2000]);
  assert.equal(provider.diagnostics().rateLimits, 1);
});

test("embedding provider rejects malformed and mismatched responses", async () => {
  const malformed = createEmbeddingProvider({ config: config(), apiKey: "key", maxRetries: 0, fetchImpl: async () => response({ data: [] }) });
  await assert.rejects(() => malformed.embed(["one"]), /result count/i);
  const mismatch = createEmbeddingProvider({ config: config(), apiKey: "key", maxRetries: 0, fetchImpl: async () => response({ data: [{ index: 0, embedding: [1, 2] }] }) });
  await assert.rejects(() => mismatch.embed(["one"]), /dimensions/i);
});

test("embedding provider reports timeout without leaking input", async () => {
  const provider = createEmbeddingProvider({
    config: config({ timeoutMs: 5 }), apiKey: "key", maxRetries: 0,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); })),
  });
  await assert.rejects(() => provider.embed(["private document"]), /timed out/i);
});

test("embedding provider retries transient network failures", async () => {
  let calls = 0;
  const provider = createEmbeddingProvider({
    config: config(), apiKey: "key", maxRetries: 1, sleepImpl: async () => {},
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("socket closed");
      return response({ data: [{ index: 0, embedding: [1, 2, 3] }] });
    },
  });
  await provider.embed(["retry network"]);
  assert.equal(calls, 2);
});
