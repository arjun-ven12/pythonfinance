const assert = require("node:assert/strict");
const test = require("node:test");
const createMarketDataPersistenceService = require("../features/marketData/services/marketDataPersistence.service");

function createMetricsDouble() {
  const gauges = {};
  return {
    gauges,
    getSnapshot: () => ({ gauges }),
    setGauge: (key, value) => {
      gauges[key] = value;
    },
  };
}

test("market data persistence disables snapshot flushing when table is missing", async () => {
  const metrics = createMetricsDouble();
  const service = createMarketDataPersistenceService({
    metrics,
    prisma: {
      run: async () => {
        const error = new Error('The table "public.MarketDataSnapshot" does not exist in the current database.');
        error.code = "P2021";
        throw error;
      },
    },
  });

  service.markDirty({
    userId: "user-1",
    symbol: "AAPL",
    scope: "QUOTE",
    payload: { price: 200 },
  });

  const result = await service.flush();

  assert.equal(result.disabled, true);
  assert.equal(result.flushed, 0);
  assert.equal(result.skipped, 1);
  assert.equal(metrics.gauges.persistenceAvailable, false);
  assert.equal(metrics.gauges.skippedRows, 1);
});
