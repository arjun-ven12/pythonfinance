const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMemoryRetrievalConfig } = require("../features/memory/config/memoryRetrieval.config");
const { classifyIntent, normalizeRetrievalRequest } = require("../features/memory/services/memoryRetrievalContract");

const config = buildMemoryRetrievalConfig({});

test("retrieval contract infers intent and exact symbol/regime filters", () => {
  const request = normalizeRetrievalRequest({ query: "Have I traded NVDA momentum setups before in Bear HV?" }, config);
  assert.equal(request.intent, "PAST_OUTCOME");
  assert.ok(request.entityFilters.some((item) => item.entityType === "SYMBOL" && item.entityId === "NVDA"));
  assert.ok(request.entityFilters.some((item) => item.entityType === "REGIME" && item.entityId === "BEAR_HIGH_VOLATILITY"));
  assert.ok(request.categories.includes("TRADE"));
});

test("retrieval modes control deterministic intent", () => {
  assert.equal(normalizeRetrievalRequest({ query: "my choices", mode: "USER_PREFERENCES" }, config).intent, "USER_PREFERENCE");
  assert.equal(classifyIntent("show the matrix deployment history"), "ENTITY_TIMELINE");
});

test("retrieval contract rejects unbounded and unsupported filters", () => {
  assert.throws(() => normalizeRetrievalRequest({ query: "" }, config), /query is required/i);
  assert.throws(() => normalizeRetrievalRequest({ query: "x", mode: "AUTONOMOUS" }, config), /unsupported/i);
  assert.throws(() => normalizeRetrievalRequest({ query: "x", categories: ["SECRET"] }, config), /category/i);
  assert.throws(() => normalizeRetrievalRequest({ query: "x", minimumSimilarity: 2 }, config), /between 0 and 1/i);
});

test("retrieval query redacts sensitive inline values", () => {
  const request = normalizeRetrievalRequest({ query: "find token=super-secret-value trade" }, config);
  assert.doesNotMatch(request.query, /super-secret-value/);
});

test("retrieval contract extracts bounded ISO date ranges from the query", () => {
  const since = normalizeRetrievalRequest({ query: "Show NVDA trades since 2026-01-15" }, config);
  assert.equal(since.dateRange.from.toISOString(), "2026-01-15T00:00:00.000Z");
  assert.equal(since.dateRange.to, null);

  const between = normalizeRetrievalRequest({ query: "Matrix outcomes between 2026-02-01 and 2026-03-01" }, config);
  assert.equal(between.dateRange.from.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(between.dateRange.to.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.throws(
    () => normalizeRetrievalRequest({ query: "x", dateRange: { from: "2026-04-01", to: "2026-03-01" } }, config),
    /must be before/i,
  );
});
