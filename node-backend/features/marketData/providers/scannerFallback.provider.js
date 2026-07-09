const {
  createMarketDataResponse,
  inferCurrencyFromMarket,
  inferMarketFromSymbol,
} = require("../models/marketDataModels");

function createScannerFallbackProvider({ readScanResultsWithHistory }) {
  async function loadScannerOpportunity(userId, symbol) {
    const results = await readScanResultsWithHistory(userId);
    const normalizedSymbol = String(symbol || "").toUpperCase();
    const opportunity = (results?.opportunities || []).find((item) => {
      const candidates = [
        item.symbol,
        item.display_symbol,
        item.yahoo_symbol,
        item.yahooSymbol,
      ]
        .filter(Boolean)
        .map((value) => String(value).toUpperCase());
      return candidates.includes(normalizedSymbol);
    });

    return {
      generatedAt: results?.generated_at || null,
      opportunity: opportunity || null,
    };
  }

  function buildResponse(symbol, generatedAt, opportunity, range = "1M") {
    const market = opportunity?.market || inferMarketFromSymbol(symbol);
    const currency = opportunity?.currency || inferCurrencyFromMarket(market);
    const point =
      generatedAt && opportunity?.close != null
        ? [
            {
              timestamp: generatedAt,
              open: opportunity.close,
              high: opportunity.close,
              low: opportunity.close,
              close: opportunity.close,
              volume: 0,
            },
          ]
        : [];

    return createMarketDataResponse({
      symbol,
      market,
      currency,
      range,
      interval: "1d",
      source: "SCANNER_CACHE",
      provider: "SCANNER_CACHE",
      isLive: false,
      isDelayed: true,
      lastUpdated: generatedAt,
      points: point,
      chartUnavailable: true,
      providerWarning: "Only latest scanner price available. Price chart unavailable.",
    });
  }

  return {
    name: "SCANNER_CACHE",

    async getQuote(symbol, { userId }) {
      const { generatedAt, opportunity } = await loadScannerOpportunity(userId, symbol);

      if (!opportunity || opportunity.close == null) {
        return {
          available: false,
          reason: "Scanner cache does not have price data for this symbol yet.",
        };
      }

      return {
        available: true,
        response: buildResponse(symbol, generatedAt, opportunity, "1M"),
      };
    },

    async getPriceHistory(symbol, range, { userId }) {
      const { generatedAt, opportunity } = await loadScannerOpportunity(userId, symbol);

      if (!opportunity || opportunity.close == null) {
        return {
          available: false,
          reason: "Scanner cache does not have chart data for this symbol yet.",
        };
      }

      return {
        available: true,
        response: buildResponse(symbol, generatedAt, opportunity, range),
      };
    },

    async getProviderHealth(userId) {
      const results = await readScanResultsWithHistory(userId);
      return {
        provider: "SCANNER_CACHE",
        selected: false,
        available: Boolean(results?.generated_at),
        connected: true,
        marketDataAvailable: Boolean(results?.opportunities?.length),
        orderPermission: false,
        paperMode: true,
        lastError: results?.generated_at ? null : "No scanner snapshot available yet.",
        latencyMs: null,
        lastUpdated: results?.generated_at || null,
      };
    },
  };
}

module.exports = createScannerFallbackProvider;
