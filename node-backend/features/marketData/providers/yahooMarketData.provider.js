const {
  createMarketDataResponse,
  getRangeConfig,
  getTimeframeConfig,
  inferCurrencyFromMarket,
  inferMarketFromSymbol,
} = require("../models/marketDataModels");

function createYahooMarketDataProvider({
  appendOutput,
  getPythonPath,
  parseJsonOutput,
  pythonEngineDir,
  spawn,
}) {
  function runPriceHistory(symbol, range, market, interval) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        getPythonPath(),
        ["price_history.py", symbol, range, market, interval],
        {
          cwd: pythonEngineDir,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr = appendOutput(stderr, chunk);
      });

      child.on("error", reject);

      child.on("close", (code) => {
        if (code !== 0) {
          const error = new Error("Yahoo Finance price history fetch failed.");
          error.details = { code, stderr, stdout };
          reject(error);
          return;
        }

        try {
          resolve(parseJsonOutput(stdout));
        } catch (error) {
          error.details = { stderr, stdout };
          reject(error);
        }
      });
    });
  }

  async function loadHistory(symbol, range, timeframe = null) {
    const rangeConfig = getRangeConfig(range);
    const timeframeConfig = timeframe ? getTimeframeConfig(timeframe, rangeConfig.range) : null;
    const interval = timeframeConfig?.interval || rangeConfig.interval;
    const market = inferMarketFromSymbol(symbol);
    const payload = await runPriceHistory(symbol, range, market, interval);

    return createMarketDataResponse({
      symbol,
      market: payload.market || market,
      currency: payload.currency || inferCurrencyFromMarket(market),
      range: rangeConfig.range,
      timeframe: timeframeConfig?.timeframe || null,
      interval: payload.interval || interval,
      source: "YAHOO_FINANCE",
      provider: "YAHOO_FINANCE",
      isLive: false,
      isDelayed: true,
      lastUpdated: payload.lastUpdated,
      points: payload.points || [],
      providerWarning:
        payload.providerWarning ||
        "Yahoo Finance data may be delayed/best-effort and is not a broker execution guarantee.",
      chartUnavailable: Boolean(payload.chartUnavailable),
    });
  }

  return {
    name: "YAHOO_FINANCE",

    async getQuote(symbol) {
      try {
        const response = await loadHistory(symbol, "5D", "5m");
        return {
          available: true,
          response: createMarketDataResponse({
            ...response,
            range: "5D",
            points: response.points.slice(-2),
          }),
        };
      } catch (error) {
        return {
          available: false,
          reason: error.message,
        };
      }
    },

    async getPriceHistory(symbol, range, { timeframe = null } = {}) {
      try {
        const response = await loadHistory(symbol, range, timeframe);
        if (!response.points.length) {
          return {
            available: false,
            reason: "Yahoo Finance returned no chart points for this symbol.",
          };
        }

        return {
          available: true,
          response,
        };
      } catch (error) {
        return {
          available: false,
          reason: error.message,
        };
      }
    },

    async getProviderHealth() {
      return {
        provider: "YAHOO_FINANCE",
        selected: false,
        available: true,
        connected: true,
        marketDataAvailable: true,
        orderPermission: false,
        paperMode: true,
        lastError: null,
        latencyMs: null,
        providerWarning:
          "Best-effort fallback only. Yahoo Finance data may be delayed.",
      };
    },
  };
}

module.exports = createYahooMarketDataProvider;
