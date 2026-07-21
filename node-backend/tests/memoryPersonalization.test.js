const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMemoryPersonalizationConfig } = require("../features/memory/config/memoryPersonalization.config");
const { coldStartStatus, createMemoryPersonalizationService, isStale, preferenceSignal, statusFor, withinTokenBudget } = require("../features/memory/services/memoryPersonalization.service");

const config = buildMemoryPersonalizationConfig({
  MEMORY_PERSONALIZATION_MIN_PREFERENCE_EVIDENCE: "3",
  MEMORY_PERSONALIZATION_MIN_ACTIVE_CONFIDENCE: "70",
  MEMORY_PERSONALIZATION_STALE_AFTER_DAYS: "180",
  MEMORY_PERSONALIZATION_MAX_CONTEXT_TOKENS: "600",
});

test("personalization extraction is deterministic and requires decision evidence", () => {
  assert.deepEqual(preferenceSignal({ title: "Reduce risk", summary: "Lower drawdown", structuredData: {}, eventType: "AI_RECOMMENDATION_ACCEPTED" }), { preferenceType: "RISK", key: "LOWER_DRAWDOWN", accepted: true, rejected: false });
  assert.equal(preferenceSignal({ title: "Explanation", summary: "Lower drawdown", structuredData: {}, eventType: "AI_RECOMMENDATION_CREATED" }), null);
  assert.equal(statusFor(2, 95, config), "CANDIDATE");
  assert.equal(statusFor(3, 69, config), "LOW_CONFIDENCE");
  assert.equal(statusFor(3, 70, config), "ACTIVE");
});

test("cold start, staleness, and context budget are conservative", () => {
  assert.equal(coldStartStatus(0), "NO_PERSONALIZATION_DATA");
  assert.equal(coldStartStatus(4), "LIMITED_HISTORY");
  assert.equal(coldStartStatus(20), "ESTABLISHED_PROFILE");
  assert.equal(isStale({ source: "ACCEPTED_PROPOSALS", lastObservedAt: "2025-01-01" }, config, new Date("2026-07-13")), true);
  assert.equal(isStale({ source: "USER_EXPLICIT", lastObservedAt: "2025-01-01" }, config, new Date("2026-07-13")), false);
  assert.ok(withinTokenBudget([{ text: "x".repeat(300) }, { text: "y".repeat(300) }], 100).length < 2);
});

test("explicit preferences take precedence and stale inferred signals are omitted", async () => {
  const db = {
    userMemoryProfile: { findFirst: async () => ({ version: 4, status: "ESTABLISHED_PROFILE", confidence: 82 }) },
    userPreference: { findMany: async () => [
      { id: "inferred", preferenceType: "RISK", key: "LOWER_DRAWDOWN", value: { preferred: true }, source: "ACCEPTED_PROPOSALS", status: "ACTIVE", confidence: 80, evidenceCount: 6, contradictingIds: [], confirmedAt: new Date(), lastObservedAt: new Date("2026-07-10") },
      { id: "explicit", preferenceType: "RISK", key: "LOWER_DRAWDOWN", value: { target: 10 }, source: "USER_EXPLICIT", status: "ACTIVE", confidence: 100, evidenceCount: 1, contradictingIds: [], confirmedAt: new Date(), lastObservedAt: new Date("2024-01-01") },
      { id: "stale", preferenceType: "PORTFOLIO", key: "CASH_BUFFER", value: { preferred: true }, source: "ACCEPTED_PROPOSALS", status: "ACTIVE", confidence: 90, evidenceCount: 8, contradictingIds: [], confirmedAt: new Date(), lastObservedAt: new Date("2024-01-01") },
    ] },
    userBehaviorPattern: { findMany: async () => [] },
    memoryPersonalizationSetting: { upsert: async () => ({ globalMode: "PERSONALIZATION_ALLOWED", strategyMode: "PERSONALIZATION_ALLOWED", inferredRequiresReview: true }) },
    memoryEvent: { count: async () => 30 },
  };
  const service = createMemoryPersonalizationService({ prisma: { run: (operation) => operation(db) }, config, now: () => new Date("2026-07-13") });
  const result = await service.context("user-1", "STRATEGY");
  assert.deepEqual(result.preferences.map((item) => item.id), ["explicit"]);
  assert.equal(result.preferences[0].source, "USER_EXPLICIT");
});

test("evidence-only mode returns no personalization signals", async () => {
  const db = {
    userMemoryProfile: { findFirst: async () => null }, userPreference: { findMany: async () => [] }, userBehaviorPattern: { findMany: async () => [] },
    memoryPersonalizationSetting: { upsert: async () => ({ globalMode: "EVIDENCE_ONLY", strategyMode: "EVIDENCE_ONLY", inferredRequiresReview: true }) }, memoryEvent: { count: async () => 0 },
  };
  const service = createMemoryPersonalizationService({ prisma: { run: (operation) => operation(db) }, config });
  const result = await service.context("user-1", "STRATEGY");
  assert.equal(result.status, "EVIDENCE_ONLY");
  assert.deepEqual(result.preferences, []);
});

test("account memory deletion removes eligible records and excludes immutable audit embeddings", async () => {
  const excluded = [];
  const db = {
    memoryEvent: {
      findMany: async () => [{ id: "fill-1" }], updateMany: async () => ({ count: 1 }), deleteMany: async () => ({ count: 3 }),
    },
    userPreference: { deleteMany: async () => ({ count: 2 }) }, userBehaviorPattern: { deleteMany: async () => ({ count: 1 }) }, userMemoryProfile: { deleteMany: async () => ({ count: 1 }) },
    memoryPersonalizationSetting: { upsert: async () => ({ globalMode: "OFF" }) },
  };
  db.$transaction = async (operation) => operation(db);
  const service = createMemoryPersonalizationService({ prisma: { run: (operation) => operation(db) }, config, embeddingService: { excludeMemory: async (id, userId) => excluded.push([id, userId]) } });
  await assert.rejects(() => service.deleteAccountMemory("user-1", {}), /requires confirmation/i);
  const result = await service.deleteAccountMemory("user-1", { confirmation: "DELETE_MY_MEMORY" });
  assert.deepEqual(result, { deleted: 3, immutableAuditMemoriesExcluded: 1 });
  assert.deepEqual(excluded, [["fill-1", "user-1"]]);
});
