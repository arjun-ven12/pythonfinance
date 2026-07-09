const assert = require("node:assert/strict");
const test = require("node:test");
const {
  JSON_FALLBACK_WARNING,
  withJsonFallback,
  withPrismaSource,
} = require("../services/dataSource");

test("Prisma responses identify the primary source", () => {
  assert.deepEqual(withPrismaSource({ records: [1] }), {
    records: [1],
    dataSource: "PRISMA",
    degradedMode: false,
  });
});

test("database failures are degraded without activating JSON fallback", () => {
  const response = withJsonFallback(
    { records: [1] },
    new Error("database offline")
  );

  assert.equal(response.dataSource, "UNAVAILABLE");
  assert.equal(response.degradedMode, true);
  assert.equal(response.stale, true);
  assert.equal(response.jsonFallbackActive, false);
  assert.equal(response.warning, JSON_FALLBACK_WARNING);
  assert.equal(response.fallbackError, "database offline");
});
