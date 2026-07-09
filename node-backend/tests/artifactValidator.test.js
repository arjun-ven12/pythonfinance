const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeArtifactPayload,
} = require("../services/artifacts/artifactValidator");

test("artifact validator accepts the execution artifact contract and preserves legacy keys", () => {
  const payload = normalizeArtifactPayload({
    scanResults: {
      generated_at: "2026-06-21T00:00:00",
      opportunities: [],
    },
    alerts: [],
    proposedOrders: { orders: [] },
    metadata: { contract_version: 1 },
  });

  assert.equal(payload.scan_results.generated_at, "2026-06-21T00:00:00");
  assert.deepEqual(payload.proposed_orders.orders, []);
  assert.equal(payload.metadata.contract_version, 1);
});

test("artifact validator rejects partial scan artifacts", () => {
  assert.throws(
    () => normalizeArtifactPayload({ alerts: [], proposedOrders: { orders: [] } }),
    /missing scanResults/
  );
  assert.throws(
    () =>
      normalizeArtifactPayload({
        scanResults: { generated_at: "2026-06-21T00:00:00" },
        alerts: [],
        proposedOrders: { orders: [] },
      }),
    /invalid scanResults/
  );
  assert.throws(
    () =>
      normalizeArtifactPayload({
        scanResults: { generated_at: "2026-06-21T00:00:00", opportunities: [] },
        alerts: {},
        proposedOrders: { orders: [] },
      }),
    /alerts must be an array/
  );
});
