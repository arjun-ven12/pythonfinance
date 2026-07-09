const {
  createMarketDataResponse,
  getRangeConfig,
  getTimeframeConfig,
  inferCurrencyFromMarket,
  inferMarketFromSymbol,
} = require("../models/marketDataModels");

function createMoomooMarketDataProvider({
  brokerAdapterRegistry,
  readResolvedBrokerConfigForUser = null,
}) {
  async function getRuntimeInput(userId) {
    const resolved = readResolvedBrokerConfigForUser
      ? await readResolvedBrokerConfigForUser(userId, "MOOMOO")
      : null;

    return resolved?.config || {};
  }

  function hasMeaningfulQuote(marketData = {}) {
    const priceFields = [
      marketData.last,
      marketData.close,
      marketData.previousClose,
      marketData.high,
      marketData.low,
      marketData.bid,
      marketData.ask,
      marketData.open,
      marketData.week52High,
      marketData.week52Low,
    ];

    return priceFields.some((value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0;
    });
  }

  async function loadAdapter(userId) {
    const provider = await brokerAdapterRegistry.getProvider(userId);

    if (provider !== "MOOMOO") {
      return { available: false, reason: "Selected broker is not Moomoo." };
    }

    const adapter = await brokerAdapterRegistry.getAdapter(userId, "MOOMOO");
    const runtimeInput = await getRuntimeInput(userId);
    const health = await adapter.getHealth(userId, runtimeInput);

    if (!health.connected || !health.marketDataAvailable) {
      return {
        available: false,
        reason: health.lastError || "Moomoo OpenD quote access is unavailable.",
        health,
        runtimeInput,
      };
    }

    return { available: true, adapter, health, runtimeInput };
  }

  return {
    name: "MOOMOO",
    async getQuote(symbol, { userId }) {
      const session = await loadAdapter(userId);
      if (!session.available) {
        return {
          available: false,
          reason: session.reason,
          health: session.health || null,
        };
      }

      const snapshot = await session.adapter.getMarketData(
        userId,
        symbol,
        session.runtimeInput
      );
      const marketData = snapshot?.marketData || {};
      const market = inferMarketFromSymbol(symbol);

      if (!hasMeaningfulQuote(marketData)) {
        return {
          available: false,
          reason:
            "Moomoo quote snapshot returned no usable price fields. Falling back to the next market-data source.",
          health: session.health || null,
        };
      }

      return {
        available: true,
        response: createMarketDataResponse({
          symbol,
          market,
          currency: inferCurrencyFromMarket(market),
          source: "MOOMOO_OPEND",
          provider: "MOOMOO",
          isLive: true,
          isDelayed: false,
          lastUpdated: marketData.updatedAt,
          quote: {
            last: marketData.last ?? marketData.close ?? null,
            previousClose: marketData.previousClose ?? null,
            change:
              marketData.last != null && marketData.previousClose != null
                ? Number((Number(marketData.last) - Number(marketData.previousClose)).toFixed(4))
                : null,
            changePercent:
              marketData.last != null &&
              marketData.previousClose != null &&
              Number(marketData.previousClose) !== 0
                ? Number(
                    (((Number(marketData.last) - Number(marketData.previousClose)) /
                      Number(marketData.previousClose)) *
                      100).toFixed(2)
                  )
                : null,
            high: marketData.high ?? null,
            low: marketData.low ?? null,
            volume: marketData.volume ?? null,
            bid: marketData.bid ?? null,
            ask: marketData.ask ?? null,
            spread: marketData.spread ?? null,
            open: marketData.open ?? null,
            week52High: marketData.week52High ?? null,
            week52Low: marketData.week52Low ?? null,
            marketStatus: marketData.marketStatus ?? null,
            tradingSession: marketData.tradingSession ?? null,
            companyName: marketData.name ?? null,
          },
          points: [
            {
              timestamp: marketData.updatedAt,
              open: marketData.open ?? marketData.previousClose ?? marketData.last ?? null,
              high: marketData.high ?? marketData.last ?? null,
              low: marketData.low ?? marketData.last ?? null,
              close: marketData.last ?? marketData.close ?? null,
              volume: marketData.volume ?? 0,
            },
          ],
        }),
      };
    },

    async getPriceHistory(symbol, range, { userId, timeframe = "1d" }) {
      const rangeConfig = getRangeConfig(range);
      const timeframeConfig = getTimeframeConfig(timeframe, rangeConfig.range);
      const session = await loadAdapter(userId);

      if (!session.available) {
        return {
          available: false,
          reason: session.reason,
          health: session.health || null,
        };
      }

      if (typeof session.adapter.getHistoricalBars !== "function") {
        return {
          available: false,
          reason:
            "Moomoo historical candles are unavailable through the current adapter shape.",
        };
      }

      const bars = await session.adapter.getHistoricalBars(userId, symbol, timeframeConfig.timeframe, {
        range: rangeConfig.range,
        timeframe: timeframeConfig.timeframe,
        maxCount: timeframeConfig.maxCount,
        ...session.runtimeInput,
      });
      const quote = await session.adapter.getMarketData(
        userId,
        symbol,
        session.runtimeInput
      );
      const marketData = quote?.marketData || {};

      if (!bars?.points?.length) {
        return {
          available: false,
          reason:
            "Moomoo historical candles returned no points. Falling back to the next market-data source.",
        };
      }

      return {
        available: true,
        response: createMarketDataResponse({
          symbol,
          market: inferMarketFromSymbol(symbol),
          currency: inferCurrencyFromMarket(inferMarketFromSymbol(symbol)),
          range: rangeConfig.range,
          timeframe: timeframeConfig.timeframe,
          interval: timeframeConfig.interval,
          source: "MOOMOO_OPEND",
          provider: "MOOMOO",
          isLive: true,
          isDelayed: false,
          lastUpdated: marketData.updatedAt || bars.points[bars.points.length - 1]?.timestamp || null,
          quote: {
            last: marketData.last ?? null,
            previousClose: marketData.previousClose ?? null,
            change:
              marketData.last != null && marketData.previousClose != null
                ? Number((Number(marketData.last) - Number(marketData.previousClose)).toFixed(4))
                : null,
            changePercent:
              marketData.last != null &&
              marketData.previousClose != null &&
              Number(marketData.previousClose) !== 0
                ? Number(
                    (((Number(marketData.last) - Number(marketData.previousClose)) /
                      Number(marketData.previousClose)) *
                      100).toFixed(2)
                  )
                : null,
            high: marketData.high ?? null,
            low: marketData.low ?? null,
            volume: marketData.volume ?? null,
            bid: marketData.bid ?? null,
            ask: marketData.ask ?? null,
            spread: marketData.spread ?? null,
            open: marketData.open ?? null,
            week52High: marketData.week52High ?? null,
            week52Low: marketData.week52Low ?? null,
            marketStatus: marketData.marketStatus ?? null,
            tradingSession: marketData.tradingSession ?? null,
            companyName: marketData.name ?? null,
          },
          points: bars.points,
        }),
      };
    },

    async getProviderHealth(userId) {
      const provider = await brokerAdapterRegistry.getProvider(userId);
      if (provider !== "MOOMOO") {
        return {
          provider: "MOOMOO",
          selected: false,
          available: false,
          connected: false,
          marketDataAvailable: false,
          orderPermission: false,
          paperMode: true,
          lastError: "Selected broker is not Moomoo.",
        };
      }

      const adapter = await brokerAdapterRegistry.getAdapter(userId, "MOOMOO");
      const runtimeInput = await getRuntimeInput(userId);
      const health = await adapter.getHealth(userId, runtimeInput);
      return {
        provider: "MOOMOO",
        selected: true,
        available: Boolean(health.connected && health.marketDataAvailable),
        connected: Boolean(health.connected),
        marketDataAvailable: Boolean(health.marketDataAvailable),
        orderPermission: Boolean(health.orderPermission),
        paperMode: Boolean(health.paperMode),
        lastError: health.lastError || null,
        latencyMs: health.latencyMs ?? null,
      };
    },
  };
}

module.exports = createMoomooMarketDataProvider;
