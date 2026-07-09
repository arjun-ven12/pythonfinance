function createMarketDataController(deps) {
  const {
    getChartPeriod,
    getMetrics,
    getPriceHistory,
    getProviderHealth,
    getQuote,
    getQuotes,
    runChartData,
    validateSymbol,
  } = deps;

  return {
    async getChartData(req, res) {
      try {
        const symbol = validateSymbol(req.params.symbol);
        const period = getChartPeriod(req.query.period);
        const rangeMap = {
          "1d": "1D",
          "5d": "5D",
          "1mo": "1M",
          "3mo": "3M",
          "6mo": "6M",
          "1y": "1Y",
        };
        const mappedRange = rangeMap[String(period || "1mo").toLowerCase()] || "1M";
        const data =
          typeof getPriceHistory === "function"
            ? await getPriceHistory(req.user.id, symbol, mappedRange, "1d")
            : await runChartData(symbol, period);
        if (data?.points && !Array.isArray(data?.candles)) {
          res.json({
            candles: data.points.map((point) => ({
              close: point.close,
              date: point.timestamp,
              high: point.high,
              low: point.low,
              open: point.open,
              volume: point.volume,
            })),
            meta: {
              chartUnavailable: Boolean(data.chartUnavailable),
              currency: data.currency || null,
              interval: data.interval || null,
              isDelayed: Boolean(data.isDelayed),
              isLive: Boolean(data.isLive),
              isStale: Boolean(data.isStale),
              lastUpdated: data.lastUpdated || null,
              market: data.market || null,
              provider: data.provider || null,
              source: data.source || null,
            },
          });
          return;
        }

        res.json(data);
      } catch (error) {
        res.status(error.status || 500).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async getMetrics(_req, res) {
      try {
        res.json(getMetrics());
      } catch (error) {
        res.status(error.status || 500).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async getQuotes(req, res) {
      try {
        const symbols = String(req.query.symbols || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((symbol) => validateSymbol(symbol));
        const data = await getQuotes(req.user.id, symbols);
        res.json({ quotes: data });
      } catch (error) {
        res.status(error.status || 500).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async getQuote(req, res) {
      try {
        const symbol = validateSymbol(req.params.symbol);
        const data = await getQuote(req.user.id, symbol);
        res.json(data);
      } catch (error) {
        res.status(error.status || 500).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async getPriceHistory(req, res) {
      try {
        const symbol = validateSymbol(req.params.symbol);
        const data = await getPriceHistory(
          req.user.id,
          symbol,
          req.query.range,
          req.query.timeframe
        );
        res.json(data);
      } catch (error) {
        res.status(error.status || 500).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async getProviderHealth(req, res) {
      try {
        const data = await getProviderHealth(req.user.id);
        res.json(data);
      } catch (error) {
        res.status(error.status || 500).json({
          error: error.message,
          details: error.details,
        });
      }
    },
  };
}

module.exports = { createMarketDataController };
