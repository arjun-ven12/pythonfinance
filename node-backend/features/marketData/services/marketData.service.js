const createCacheFactory = require("../cache/cacheFactory");
const createMoomooMarketDataProvider = require("../providers/moomooMarketData.provider");
const createScannerFallbackProvider = require("../providers/scannerFallback.provider");
const createYahooMarketDataProvider = require("../providers/yahooMarketData.provider");
const {
  createHttpError,
  createMarketDataResponse,
  getRangeConfig,
  getTimeframeConfig,
  mergeWarnings,
} = require("../models/marketDataModels");
const createMarketDataCacheService = require("./marketDataCache.service");
const createMarketDataMetricsService = require("./marketDataMetrics.service");
const createMarketDataPersistenceService = require("./marketDataPersistence.service");

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createMarketDataService({
  appendOutput,
  brokerAdapterRegistry,
  getPythonPath,
  parseJsonOutput,
  prisma,
  pythonEngineDir,
  readResolvedBrokerConfigForUser,
  readScanResultsWithHistory,
  spawn,
}) {
  const metrics = createMarketDataMetricsService();
  const { memory, redis } = createCacheFactory({ env: process.env });
  const cache = createMarketDataCacheService({
    memory,
    redis,
    metrics,
  });
  const persistence = createMarketDataPersistenceService({
    flushIntervalMs: toPositiveNumber(process.env.MARKET_CACHE_FLUSH_INTERVAL_MS, 60_000),
    metrics,
    prisma,
  });

  const moomooProvider = createMoomooMarketDataProvider({
    brokerAdapterRegistry,
    readResolvedBrokerConfigForUser,
  });
  const yahooProvider = createYahooMarketDataProvider({
    appendOutput,
    getPythonPath,
    parseJsonOutput,
    pythonEngineDir,
    spawn,
  });
  const scannerProvider = createScannerFallbackProvider({ readScanResultsWithHistory });

  const defaultQuoteTtlMs = toPositiveNumber(process.env.MARKET_CACHE_TTL_SECONDS, 15) * 1000;

  function buildCacheKey({ userId, symbol, scope, provider, range = "QUOTE", timeframe = "" }) {
    return [
      "market-data",
      userId,
      String(symbol || "").toUpperCase(),
      scope,
      String(range || "QUOTE").toUpperCase(),
      String(timeframe || "").toLowerCase(),
      provider,
    ].join(":");
  }

  function getProviderOrder(selectedProvider) {
    if (selectedProvider === "MOOMOO") {
      return [moomooProvider, yahooProvider, scannerProvider];
    }

    return [yahooProvider, scannerProvider];
  }

  function markSnapshotDirty(userId, scope, response) {
    if (!response?.symbol) {
      return;
    }

    persistence.markDirty({
      userId,
      symbol: response.symbol,
      scope,
      rangeKey: scope === "QUOTE" ? "QUOTE" : response.range || "1M",
      timeframeKey: response.timeframe || "",
      market: response.market || null,
      currency: response.currency || null,
      interval: response.interval || null,
      provider: response.provider || null,
      source: response.source || null,
      lastUpdated: response.lastUpdated || null,
      payload: response,
    });
  }

  async function resolveThroughProviders({
    method,
    range = null,
    scope,
    symbol,
    timeframe = null,
    userId,
  }) {
    const selectedProvider = await brokerAdapterRegistry.getProvider(userId);
    const providers = getProviderOrder(selectedProvider);
    const warnings = [];
    const ttlMs =
      scope === "QUOTE"
        ? defaultQuoteTtlMs
        : (timeframe ? getTimeframeConfig(timeframe, range).ttlMs : getRangeConfig(range).ttlMs);

    for (const provider of providers) {
      const cacheKey = buildCacheKey({
        userId,
        symbol,
        scope,
        provider: provider.name,
        range: range || "QUOTE",
        timeframe,
      });
      const cached = await cache.get(cacheKey);

      if (cached?.response) {
        if (cached.response.isStale) {
          metrics.increment("staleCacheCount");
        }

        return createMarketDataResponse({
          ...cached.response,
          providerWarning: mergeWarnings(warnings, cached.response.providerWarning),
        });
      }

      const startedAt = Date.now();
      const outcome = await cache.memoize(`inflight:${cacheKey}`, async () => {
        metrics.increment("providerRequests");
        const providerResult = range
          ? await provider[method](symbol, range, { userId, timeframe })
          : await provider[method](symbol, { userId });
        metrics.recordProviderLatency(provider.name, Date.now() - startedAt);
        return providerResult;
      });

      if (outcome?.available && outcome.response) {
        const response = createMarketDataResponse({
          ...outcome.response,
          providerWarning: mergeWarnings(warnings, outcome.response.providerWarning),
        });
        await cache.set(cacheKey, { response }, ttlMs);
        markSnapshotDirty(userId, scope, response);
        return response;
      }

      if (outcome?.reason) {
        warnings.push(`${provider.name.replaceAll("_", " ")} unavailable: ${outcome.reason}`);
      }
    }

    throw createHttpError(
      `Price data unavailable for ${symbol}. ${mergeWarnings(warnings) || "No market-data provider could return data."}`.trim(),
      404
    );
  }

  async function getQuote(userId, symbol) {
    return resolveThroughProviders({
      method: "getQuote",
      scope: "QUOTE",
      symbol,
      userId,
    });
  }

  async function getQuotes(userId, symbols = []) {
    const uniqueSymbols = [...new Set(
      (Array.isArray(symbols) ? symbols : [])
        .map((symbol) => String(symbol || "").trim().toUpperCase())
        .filter(Boolean)
    )];

    metrics.recordBatchSize(uniqueSymbols.length);

    if (uniqueSymbols.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(
      uniqueSymbols.map((symbol) => getQuote(userId, symbol))
    );
    const successfulQuotes = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    if (successfulQuotes.length > 0) {
      return successfulQuotes;
    }

    const firstError = results.find((result) => result.status === "rejected");
    throw firstError?.reason || createHttpError("Price data unavailable.", 404);
  }

  async function getPriceHistory(userId, symbol, range, timeframe = null) {
    const rangeConfig = getRangeConfig(range);
    const timeframeConfig = timeframe
      ? getTimeframeConfig(timeframe, rangeConfig.range)
      : null;

    return resolveThroughProviders({
      method: "getPriceHistory",
      range: rangeConfig.range,
      scope: "HISTORY",
      symbol,
      timeframe: timeframeConfig?.timeframe || null,
      userId,
    });
  }

  async function getProviderHealth(userId) {
    const selectedProvider = await brokerAdapterRegistry.getProvider(userId);
    const [moomoo, yahoo, scanner] = await Promise.all([
      moomooProvider.getProviderHealth(userId),
      yahooProvider.getProviderHealth(userId),
      scannerProvider.getProviderHealth(userId),
    ]);

    return {
      selectedProvider,
      providers: [moomoo, yahoo, scanner],
      cache: {
        memoryEntries: memory.size(),
        redisEnabled: Boolean(redis.enabled),
      },
      metrics: metrics.getSnapshot(),
    };
  }

  function getMetrics() {
    return {
      cache: {
        memoryEntries: memory.size(),
        redisEnabled: Boolean(redis.enabled),
      },
      ...metrics.getSnapshot(),
    };
  }

  function start() {
    persistence.start();
  }

  async function stop() {
    await persistence.stop();
  }

  return {
    getMetrics,
    getPriceHistory,
    getProviderHealth,
    getQuote,
    getQuotes,
    metricsService: metrics,
    start,
    stop,
  };
}

module.exports = createMarketDataService;
