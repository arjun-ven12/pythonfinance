const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMemoryDocument } = require("../features/memory/services/memoryDocumentBuilder");
const { evaluateEmbeddingEligibility } = require("../features/memory/services/memoryEmbeddingEligibility");

function memory(overrides = {}) {
  return {
    id: "memory-1",
    category: "TRADE",
    eventType: "TRADE_CLOSED",
    title: "NVDA trade closed",
    summary: "Momentum v8 closed with a 6.4% gain.",
    structuredData: { symbol: "NVDA", strategyName: "Momentum", strategyVersion: 8, returnPct: 6.4, rawPayload: "never include" },
    links: [{ entityType: "SYMBOL", entityId: "NVDA" }, { entityType: "REGIME", entityId: "BULL_LOW_VOLATILITY" }],
    occurredAt: new Date("2026-07-10T10:00:00Z"),
    contentHash: "content-hash",
    schemaVersion: "1",
    retentionState: "ACTIVE",
    excludedFromAi: false,
    importance: 95,
    ...overrides,
  };
}

test("memory embedding document is deterministic, bounded, and allowlisted", () => {
  const first = buildMemoryDocument(memory());
  const second = buildMemoryDocument(memory());
  assert.deepEqual(first, second);
  assert.match(first.document, /Symbols: NVDA/);
  assert.match(first.document, /Regimes: BULL_LOW_VOLATILITY/);
  assert.match(first.document, /returnPct: 6.4/);
  assert.doesNotMatch(first.document, /rawPayload|never include/);
});

test("memory embedding document rejects redacted sensitive content", () => {
  assert.throws(
    () => buildMemoryDocument(memory({ summary: "authorization: Bearer private-token" })),
    /sensitive content/i
  );
});

test("embedding eligibility rejects low importance and excluded memories", () => {
  const config = { enabled: true, minImportance: 30 };
  assert.equal(evaluateEmbeddingEligibility(memory(), config).eligible, true);
  assert.equal(evaluateEmbeddingEligibility(memory({ importance: 20 }), config).reason, "LOW_IMPORTANCE");
  assert.equal(evaluateEmbeddingEligibility(memory({ excludedFromAi: true }), config).reason, "EXCLUDED_FROM_AI");
});
