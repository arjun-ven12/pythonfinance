const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const EventEmitter = require("node:events");
const test = require("node:test");

const createMarketDataService = require("../features/marketData/services/marketData.service");
const { getDemoMarketDataPayload } = require("../features/demo/demoData");
const { createMarketDataResponse } = require("../features/marketData/models/marketDataModels");

function createSpawnStub({ stdout, stderr = "", code = 0 }) {
  return function spawnStub() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    process.nextTick(() => {
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      if (stderr) child.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", code);
    });

    return child;
  };
}

function createService({
  provider = "INTERNAL_PAPER",
  moomooHealth = { connected: false, marketDataAvailable: false, lastError: "OpenD unavailable." },
  marketDataCallCounter = null,
  marketDataPayload = null,
  priceHistoryPayload = null,
  priceHistoryCode = 0,
  scanResults = { generated_at: null, opportunities: [] },
}) {
  const adapter = {
    getHealth: async () => moomooHealth,
    getMarketData: async () => {
      if (marketDataCallCounter) {
        marketDataCallCounter.count += 1;
      }
      return {
        marketData:
          marketDataPayload || {
            last: 172.2,
            previousClose: 168.4,
            high: 173.4,
            low: 168.2,
            volume: 44100000,
            updatedAt: "2026-07-01T13:30:00.000Z",
          },
      };
    },
  };

  return createMarketDataService({
    appendOutput: (current, chunk) => current + chunk.toString(),
    brokerAdapterRegistry: {
      getProvider: async () => provider,
      getAdapter: async () => adapter,
    },
    getPythonPath: () => "python",
    parseJsonOutput: (value) => JSON.parse(value),
    pythonEngineDir: process.cwd(),
    readScanResultsWithHistory: async () => scanResults,
    spawn: createSpawnStub({
      stdout: priceHistoryPayload ? JSON.stringify(priceHistoryPayload) : "",
      stderr: priceHistoryPayload ? "" : "provider failure",
      code: priceHistoryCode,
    }),
  });
}

test("valid US symbol returns normalized history from Yahoo fallback", async () => {
  const service = createService({
    priceHistoryPayload: {
      market: "US",
      currency: "USD",
      interval: "1d",
      lastUpdated: "2026-07-01T13:30:00.000Z",
      points: [
        { timestamp: "2026-06-24T13:30:00.000Z", open: 165.3, high: 169.8, low: 164.9, close: 168.4, volume: 39200000 },
        { timestamp: "2026-07-01T13:30:00.000Z", open: 168.9, high: 173.4, low: 168.2, close: 172.2, volume: 44100000 },
      ],
    },
  });

  const result = await service.getPriceHistory("user-1", "AMD", "1M");
  assert.equal(result.symbol, "AMD");
  assert.equal(result.source, "YAHOO_FINANCE");
  assert.equal(result.isDelayed, true);
  assert.equal(result.points.length, 2);
});

test("valid SG symbol returns normalized history when supported", async () => {
  const service = createService({
    priceHistoryPayload: {
      market: "SG",
      currency: "SGD",
      interval: "1d",
      lastUpdated: "2026-07-01T01:30:00.000Z",
      points: [
        { timestamp: "2026-06-24T01:30:00.000Z", open: 38.01, high: 38.26, low: 37.95, close: 38.18, volume: 9900000 },
        { timestamp: "2026-07-01T01:30:00.000Z", open: 38.2, high: 38.46, low: 38.11, close: 38.31, volume: 10120000 },
      ],
    },
  });

  const result = await service.getPriceHistory("user-1", "D05.SI", "1M");
  assert.equal(result.market, "SG");
  assert.equal(result.currency, "SGD");
  assert.equal(result.points.length, 2);
});

test("unsupported range returns 400", async () => {
  const service = createService({
    priceHistoryPayload: {
      market: "US",
      currency: "USD",
      interval: "1d",
      lastUpdated: "2026-07-01T13:30:00.000Z",
      points: [],
    },
  });

  await assert.rejects(
    () => service.getPriceHistory("user-1", "AMD", "2Y"),
    (error) => error.status === 400
  );
});

test("Moomoo unavailable falls back to Yahoo", async () => {
  const service = createService({
    provider: "MOOMOO",
    moomooHealth: {
      connected: false,
      marketDataAvailable: false,
      lastError: "OpenD disconnected.",
    },
    priceHistoryPayload: {
      market: "US",
      currency: "USD",
      interval: "1d",
      lastUpdated: "2026-07-01T13:30:00.000Z",
      points: [
        { timestamp: "2026-06-24T13:30:00.000Z", open: 165.3, high: 169.8, low: 164.9, close: 168.4, volume: 39200000 },
        { timestamp: "2026-07-01T13:30:00.000Z", open: 168.9, high: 173.4, low: 168.2, close: 172.2, volume: 44100000 },
      ],
    },
  });

  const result = await service.getPriceHistory("user-1", "AMD", "1M");
  assert.equal(result.source, "YAHOO_FINANCE");
  assert.match(result.providerWarning, /MOOMOO unavailable/i);
});

test("empty Moomoo quote snapshot falls back to Yahoo quote data", async () => {
  const service = createService({
    provider: "MOOMOO",
    moomooHealth: {
      connected: true,
      marketDataAvailable: true,
      lastError: null,
    },
    marketDataPayload: {
      last: null,
      previousClose: null,
      high: null,
      low: null,
      bid: null,
      ask: null,
      open: null,
      volume: null,
      updatedAt: "2026-07-01T13:30:00.000Z",
    },
    priceHistoryPayload: {
      market: "US",
      currency: "USD",
      interval: "1d",
      lastUpdated: "2026-07-01T13:30:00.000Z",
      points: [
        { timestamp: "2026-06-24T13:30:00.000Z", open: 165.3, high: 169.8, low: 164.9, close: 168.4, volume: 39200000 },
        { timestamp: "2026-07-01T13:30:00.000Z", open: 168.9, high: 173.4, low: 168.2, close: 172.2, volume: 44100000 },
      ],
    },
  });

  const result = await service.getQuote("user-1", "AMD");
  assert.equal(result.source, "YAHOO_FINANCE");
  assert.equal(result.quote.last, 172.2);
  assert.match(result.providerWarning, /Moomoo quote snapshot returned no usable price fields/i);
});

test("Yahoo unavailable falls back to scanner cache and marks chart unavailable", async () => {
  const service = createService({
    priceHistoryCode: 1,
    scanResults: {
      generated_at: "2026-07-01T13:30:00.000Z",
      opportunities: [
        {
          symbol: "AMD",
          close: 172.2,
          market: "US",
          currency: "USD",
        },
      ],
    },
  });

  const result = await service.getPriceHistory("user-1", "AMD", "1M");
  assert.equal(result.source, "SCANNER_CACHE");
  assert.equal(result.chartUnavailable, true);
  assert.equal(result.points.length, 1);
});

test("quote cache reuses provider result within ttl window", async () => {
  const counter = { count: 0 };
  const service = createService({
    provider: "MOOMOO",
    moomooHealth: {
      connected: true,
      marketDataAvailable: true,
      lastError: null,
    },
    marketDataCallCounter: counter,
  });

  const first = await service.getQuote("user-1", "AMD");
  const second = await service.getQuote("user-1", "AMD");

  assert.equal(first.symbol, "AMD");
  assert.equal(second.symbol, "AMD");
  assert.equal(counter.count, 1);
});

test("batched quote lookup dedupes duplicate symbols and records metrics", async () => {
  const counter = { count: 0 };
  const service = createService({
    provider: "MOOMOO",
    moomooHealth: {
      connected: true,
      marketDataAvailable: true,
      lastError: null,
    },
    marketDataCallCounter: counter,
  });

  const quotes = await service.getQuotes("user-1", ["AMD", "amd", "AAPL"]);
  const metrics = service.getMetrics();

  assert.equal(quotes.length, 2);
  assert.equal(counter.count, 2);
  assert.equal(metrics.gauges.lastBatchSize, 2);
});

test("demo market-data fixtures stay isolated from real providers", () => {
  const payload = getDemoMarketDataPayload("AMD", "1M");
  assert.equal(payload.isDemoMode, true);
  assert.equal(payload.payload.source, "DEMO_FIXTURE");
  assert.equal(payload.payload.points.length > 0, true);
});

test("market-data normalization preserves Moomoo time_key candle timestamps", () => {
  const payload = createMarketDataResponse({
    symbol: "APTV",
    provider: "MOOMOO",
    source: "MOOMOO_OPEND",
    points: [
      {
        time_key: "2026-07-06 00:00:00",
        open: 58.9,
        high: 60.25,
        low: 58.795,
        close: 59.775,
        volume: 834624,
      },
    ],
  });

  assert.equal(payload.points.length, 1);
  assert.ok(payload.points[0].timestamp);
  assert.equal(payload.points[0].close, 59.775);
});

test("market-data routes are mounted behind verified-user auth", () => {
  const serverPath = path.join(__dirname, "..", "server.js");
  const source = fs.readFileSync(serverPath, "utf8");
  const authBoundaryIndex = source.indexOf('app.use("/api", requireVerifiedUser);');
  const marketDataRouteIndex = source.indexOf('app.use("/api", createMarketDataRouter({');

  assert.ok(authBoundaryIndex > 0);
  assert.ok(marketDataRouteIndex > authBoundaryIndex);
});
