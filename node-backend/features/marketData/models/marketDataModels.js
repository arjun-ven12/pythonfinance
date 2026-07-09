const RANGE_CONFIG = Object.freeze({
  "1D": { interval: "5m", ttlMs: 60_000, staleAfterMs: 30 * 60_000 },
  "5D": { interval: "15m", ttlMs: 5 * 60_000, staleAfterMs: 2 * 60 * 60_000 },
  "1M": { interval: "1d", ttlMs: 15 * 60_000, staleAfterMs: 2 * 24 * 60 * 60_000 },
  "3M": { interval: "1d", ttlMs: 30 * 60_000, staleAfterMs: 5 * 24 * 60 * 60_000 },
  "6M": { interval: "1d", ttlMs: 30 * 60_000, staleAfterMs: 7 * 24 * 60 * 60_000 },
  "1Y": { interval: "1d", ttlMs: 30 * 60_000, staleAfterMs: 14 * 24 * 60 * 60_000 },
});

const TIMEFRAME_CONFIG = Object.freeze({
  "1m": { interval: "1m", range: "1D", ttlMs: 30_000, staleAfterMs: 10 * 60_000, maxCount: 390 },
  "5m": { interval: "5m", range: "5D", ttlMs: 60_000, staleAfterMs: 30 * 60_000, maxCount: 390 },
  "15m": { interval: "15m", range: "5D", ttlMs: 60_000, staleAfterMs: 2 * 60 * 60_000, maxCount: 390 },
  "30m": { interval: "30m", range: "1M", ttlMs: 2 * 60_000, staleAfterMs: 4 * 60 * 60_000, maxCount: 390 },
  "1h": { interval: "60m", range: "1M", ttlMs: 2 * 60_000, staleAfterMs: 6 * 60 * 60_000, maxCount: 390 },
  "4h": { interval: "240m", range: "3M", ttlMs: 5 * 60_000, staleAfterMs: 12 * 60 * 60_000, maxCount: 390 },
  "1d": { interval: "1d", range: "1Y", ttlMs: 15 * 60_000, staleAfterMs: 2 * 24 * 60 * 60_000, maxCount: 365 },
  "1w": { interval: "1wk", range: "1Y", ttlMs: 30 * 60_000, staleAfterMs: 7 * 24 * 60 * 60_000, maxCount: 260 },
  "1mo": { interval: "1mo", range: "1Y", ttlMs: 30 * 60_000, staleAfterMs: 14 * 24 * 60 * 60_000, maxCount: 120 },
});

function createHttpError(message, status = 500, details = undefined) {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function getRangeConfig(range = "1M") {
  const normalizedRange = String(range || "1M").trim().toUpperCase();
  const config = RANGE_CONFIG[normalizedRange];

  if (!config) {
    throw createHttpError("Unsupported range. Use 1D, 5D, 1M, 3M, 6M, or 1Y.", 400);
  }

  return {
    range: normalizedRange,
    ...config,
  };
}

function getTimeframeConfig(timeframe = "1d", fallbackRange = "1M") {
  const normalized = String(timeframe || "1d").trim().toLowerCase();
  const config = TIMEFRAME_CONFIG[normalized];

  if (!config) {
    throw createHttpError(
      "Unsupported timeframe. Use 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, or 1mo.",
      400
    );
  }

  return {
    timeframe: normalized,
    ...config,
    range: config.range || fallbackRange,
  };
}

function inferMarketFromSymbol(symbol) {
  return String(symbol || "").toUpperCase().endsWith(".SI") ? "SG" : "US";
}

function inferCurrencyFromMarket(market) {
  return String(market || "").toUpperCase() === "SG" ? "SGD" : "USD";
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePoint(point = {}) {
  const timestamp =
    point.timestamp ||
    point.time ||
    point.date ||
    point.time_key ||
    point.timeKey ||
    null;

  if (!timestamp) {
    return null;
  }

  return {
    timestamp: new Date(timestamp).toISOString(),
    open: toNumber(point.open),
    high: toNumber(point.high),
    low: toNumber(point.low),
    close: toNumber(point.close),
    volume: toNumber(point.volume) ?? 0,
  };
}

function normalizePoints(points = []) {
  return points.map((point) => normalizePoint(point)).filter(Boolean);
}

function buildQuoteFromPoints(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      last: null,
      previousClose: null,
      change: null,
      changePercent: null,
      high: null,
      low: null,
      volume: null,
    };
  }

  const lastPoint = points[points.length - 1];
  const previousPoint = points.length > 1 ? points[points.length - 2] : null;
  const previousClose = previousPoint?.close ?? points[0]?.open ?? lastPoint?.open ?? null;
  const last = lastPoint?.close ?? null;
  const change =
    last !== null && previousClose !== null ? Number((last - previousClose).toFixed(4)) : null;
  const changePercent =
    change !== null && previousClose ? Number(((change / previousClose) * 100).toFixed(2)) : null;

  return {
    last,
    previousClose,
    change,
    changePercent,
    high: points.reduce((max, point) => {
      if (point.high === null) return max;
      return max === null ? point.high : Math.max(max, point.high);
    }, null),
    low: points.reduce((min, point) => {
      if (point.low === null) return min;
      return min === null ? point.low : Math.min(min, point.low);
    }, null),
    volume: points.reduce((total, point) => total + (point.volume || 0), 0),
  };
}

function computeIsStale(lastUpdated, staleAfterMs) {
  if (!Number.isFinite(Number(staleAfterMs)) || Number(staleAfterMs) <= 0) {
    return false;
  }

  const timestamp = new Date(lastUpdated || "").getTime();
  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > staleAfterMs;
}

function mergeWarnings(...warnings) {
  return warnings
    .flat()
    .filter(Boolean)
    .map((warning) => String(warning).trim())
    .filter(Boolean)
    .filter((warning, index, list) => list.indexOf(warning) === index)
    .join(" ");
}

function createMarketDataResponse(input = {}) {
  const points = normalizePoints(input.points || []);
  const quote = input.quote || buildQuoteFromPoints(points);
  const rangeConfig = input.range ? getRangeConfig(input.range) : null;
  const timeframeConfig = input.timeframe
    ? getTimeframeConfig(input.timeframe, input.range || "1M")
    : null;
  const market = input.market || inferMarketFromSymbol(input.symbol);
  const interval = input.interval || timeframeConfig?.interval || rangeConfig?.interval || "1d";
  const lastUpdated =
    input.lastUpdated ||
    points[points.length - 1]?.timestamp ||
    null;

  return {
    symbol: input.symbol,
    market,
    currency: input.currency || inferCurrencyFromMarket(market),
    range: input.range || null,
    timeframe: input.timeframe || timeframeConfig?.timeframe || null,
    interval,
    source: input.source,
    provider: input.provider,
    isLive: Boolean(input.isLive),
    isDelayed: Boolean(input.isDelayed),
    isStale:
      input.isStale === undefined
        ? computeIsStale(lastUpdated, input.staleAfterMs || rangeConfig?.staleAfterMs || 0)
        : Boolean(input.isStale),
    chartUnavailable: Boolean(input.chartUnavailable),
    providerWarning: mergeWarnings(input.providerWarning),
    lastUpdated,
    quote,
    points,
  };
}

module.exports = {
  RANGE_CONFIG,
  TIMEFRAME_CONFIG,
  buildQuoteFromPoints,
  computeIsStale,
  createHttpError,
  createMarketDataResponse,
  getRangeConfig,
  getTimeframeConfig,
  inferCurrencyFromMarket,
  inferMarketFromSymbol,
  mergeWarnings,
  normalizePoints,
  toNumber,
};
