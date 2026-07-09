import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import {
  useHistoricalBars,
  useLiveQuote,
} from "../../features/marketData/hooks/useMarketDataSubscription";
import "./StockPriceChart.css";

const TIMEFRAME_OPTIONS = [
  { value: "1m", label: "1 Minute" },
  { value: "5m", label: "5 Minute" },
  { value: "15m", label: "15 Minute" },
  { value: "30m", label: "30 Minute" },
  { value: "1h", label: "1 Hour" },
  { value: "4h", label: "4 Hour" },
  { value: "1d", label: "Daily" },
  { value: "1w", label: "Weekly" },
  { value: "1mo", label: "Monthly" },
];

const DEFAULT_INDICATORS = {
  sma: true,
  ema: true,
  vwap: true,
  bollinger: true,
  rsi: true,
  macd: true,
};

export function __resetStockPriceChartTestCache() {}

function normalizeInitialTimeframe(value) {
  const normalized = String(value || "1d").trim().toLowerCase();
  if (TIMEFRAME_OPTIONS.some((option) => option.value === normalized)) {
    return normalized;
  }
  const legacyMap = {
    "1d": "1d",
    "5d": "5m",
    "1m": "1d",
    "3m": "4h",
    "6m": "1d",
    "1y": "1w",
  };
  return legacyMap[normalized] || "1d";
}

function formatMoney(value, currency = "USD") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${currency} -`;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric);
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numeric);
}

function formatCompactNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric);
}

function formatTimestamp(value) {
  if (!value) return "Unavailable";
  return new Date(value).toLocaleString();
}

function getFreshnessLabel(payload) {
  if (payload?.source === "SCANNER_CACHE") return "Scanner cache";
  if (payload?.isLive) return "Live";
  if (payload?.isStale) return "Stale";
  if (payload?.isDelayed) return "Delayed";
  return "Snapshot";
}

function getFreshnessClass(payload) {
  if (payload?.source === "SCANNER_CACHE") return "scanner_cache";
  if (payload?.isLive) return "live";
  if (payload?.isStale) return "stale";
  if (payload?.isDelayed) return "delayed";
  return "snapshot";
}

function toChartTime(timestamp) {
  return Math.floor(new Date(timestamp).getTime() / 1000);
}

function computeSma(points, period = 20) {
  return points
    .map((point, index) => {
      const subset = points.slice(Math.max(0, index - period + 1), index + 1);
      if (subset.length < period) return null;
      const sum = subset.reduce((total, item) => total + Number(item.close || 0), 0);
      return {
        time: toChartTime(point.timestamp),
        value: sum / period,
      };
    })
    .filter(Boolean);
}

function computeEma(points, period = 12) {
  const multiplier = 2 / (period + 1);
  let ema = null;
  return points
    .map((point, index) => {
      const close = Number(point.close || 0);
      if (!Number.isFinite(close)) return null;
      if (ema == null) {
        if (index + 1 < period) return null;
        const seed = points
          .slice(index + 1 - period, index + 1)
          .reduce((total, item) => total + Number(item.close || 0), 0);
        ema = seed / period;
      } else {
        ema = close * multiplier + ema * (1 - multiplier);
      }
      return {
        time: toChartTime(point.timestamp),
        value: ema,
      };
    })
    .filter(Boolean);
}

function computeVwap(points) {
  let cumulativeVolume = 0;
  let cumulativeWeightedPrice = 0;
  return points
    .map((point) => {
      const volume = Number(point.volume || 0);
      const typicalPrice =
        (Number(point.high || 0) + Number(point.low || 0) + Number(point.close || 0)) / 3;
      if (!Number.isFinite(typicalPrice) || !Number.isFinite(volume)) return null;
      cumulativeVolume += volume;
      cumulativeWeightedPrice += typicalPrice * volume;
      if (!cumulativeVolume) return null;
      return {
        time: toChartTime(point.timestamp),
        value: cumulativeWeightedPrice / cumulativeVolume,
      };
    })
    .filter(Boolean);
}

function computeBollinger(points, period = 20, multiplier = 2) {
  const upper = [];
  const lower = [];
  points.forEach((point, index) => {
    const subset = points.slice(Math.max(0, index - period + 1), index + 1);
    if (subset.length < period) return;
    const values = subset.map((item) => Number(item.close || 0));
    const mean = values.reduce((sum, item) => sum + item, 0) / period;
    const variance =
      values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    upper.push({
      time: toChartTime(point.timestamp),
      value: mean + deviation * multiplier,
    });
    lower.push({
      time: toChartTime(point.timestamp),
      value: mean - deviation * multiplier,
    });
  });
  return { upper, lower };
}

function computeRsi(points, period = 14) {
  const output = [];
  let gains = 0;
  let losses = 0;
  for (let index = 1; index < points.length; index += 1) {
    const change = Number(points[index].close || 0) - Number(points[index - 1].close || 0);
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
    if (index < period) continue;
    if (index > period) {
      const prevChange =
        Number(points[index - period + 1].close || 0) -
        Number(points[index - period].close || 0);
      gains -= Math.max(prevChange, 0);
      losses -= Math.max(-prevChange, 0);
    }
    const averageGain = gains / period;
    const averageLoss = losses / period;
    const rs = averageLoss === 0 ? 100 : averageGain / averageLoss;
    output.push({
      time: toChartTime(points[index].timestamp),
      value: Number((100 - 100 / (1 + rs)).toFixed(2)),
    });
  }
  return output;
}

function computeMacd(points, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = computeEma(points, fastPeriod);
  const emaSlow = computeEma(points, slowPeriod);
  const slowMap = new Map(emaSlow.map((point) => [point.time, point.value]));
  const macdLine = emaFast
    .map((point) => {
      if (!slowMap.has(point.time)) return null;
      return {
        time: point.time,
        value: point.value - slowMap.get(point.time),
      };
    })
    .filter(Boolean);

  let signal = null;
  const multiplier = 2 / (signalPeriod + 1);
  const signalLine = macdLine
    .map((point, index) => {
      if (signal == null) {
        if (index + 1 < signalPeriod) return null;
        signal =
          macdLine
            .slice(index + 1 - signalPeriod, index + 1)
            .reduce((sum, item) => sum + item.value, 0) / signalPeriod;
      } else {
        signal = point.value * multiplier + signal * (1 - multiplier);
      }
      return {
        time: point.time,
        value: signal,
      };
    })
    .filter(Boolean);

  return {
    line: macdLine,
    signal: signalLine,
    latest:
      macdLine.length && signalLine.length
        ? {
            macd: macdLine[macdLine.length - 1].value,
            signal: signalLine[signalLine.length - 1].value,
            histogram:
              macdLine[macdLine.length - 1].value - signalLine[signalLine.length - 1].value,
          }
        : null,
  };
}

function buildIndicators(points) {
  return {
    sma: computeSma(points, 20),
    ema: computeEma(points, 12),
    vwap: computeVwap(points),
    bollinger: computeBollinger(points, 20, 2),
    rsi: computeRsi(points, 14),
    macd: computeMacd(points, 12, 26, 9),
  };
}

function normalizeChartPoints(points) {
  const normalized = [];
  const seenByTime = new Map();

  for (const point of points || []) {
    const timestamp = point?.timestamp;
    const epochMs = new Date(timestamp).getTime();
    if (!Number.isFinite(epochMs)) {
      continue;
    }

    const close = Number(point?.close);
    if (!Number.isFinite(close)) {
      continue;
    }

    const open = Number(point?.open);
    const high = Number(point?.high);
    const low = Number(point?.low);
    const volume = Number(point?.volume);
    const nextPoint = {
      timestamp: new Date(epochMs).toISOString(),
      open: Number.isFinite(open) ? open : close,
      high: Number.isFinite(high) ? high : close,
      low: Number.isFinite(low) ? low : close,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    };

    seenByTime.set(nextPoint.timestamp, nextPoint);
  }

  for (const point of seenByTime.values()) {
    normalized.push(point);
  }

  normalized.sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  return normalized;
}

function useResizeObserver(ref, expanded) {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    let frameId = null;
    let timeoutId = null;

    const update = () => {
      const nextWidth = Math.max(Math.round(node.getBoundingClientRect().width), 320);
      setWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    const scheduleUpdate = () => {
      if (frameId != null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frameId);
      }
      if (typeof window.requestAnimationFrame === "function") {
        frameId = window.requestAnimationFrame(() => {
          update();
        });
        return;
      }
      update();
    };

    update();
    scheduleUpdate();
    timeoutId = window.setTimeout(update, 80);

    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(scheduleUpdate) : null;
    observer?.observe(node);
    if (node.parentElement) {
      observer?.observe(node.parentElement);
    }
    window.addEventListener("resize", update);
    return () => {
      if (frameId != null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref, expanded]);

  return width;
}

export default function StockPriceChart({
  defaultRange = "1d",
  isDemoMode = false,
  market,
  symbol,
}) {
  const [timeframe, setTimeframe] = useState(() => normalizeInitialTimeframe(defaultRange));
  const [expanded, setExpanded] = useState(false);
  const [indicators, setIndicators] = useState(DEFAULT_INDICATORS);
  const [renderError, setRenderError] = useState("");
  const [stableHistoryPayload, setStableHistoryPayload] = useState(null);
  const shellRef = useRef(null);
  const mainChartRef = useRef(null);
  const rsiChartRef = useRef(null);
  const width = useResizeObserver(shellRef, expanded);
  const { payload: historyPayload, error: historyError } = useHistoricalBars(symbol, timeframe, {
    isDemoMode,
  });
  const { payload: quotePayload, error: quoteError } = useLiveQuote(symbol, { isDemoMode });

  const normalizedHistoryPoints = useMemo(
    () => normalizeChartPoints(historyPayload?.points || []),
    [historyPayload?.points]
  );

  useEffect(() => {
    setStableHistoryPayload(null);
  }, [symbol, timeframe, isDemoMode]);

  useEffect(() => {
    if (normalizedHistoryPoints.length) {
      setStableHistoryPayload(historyPayload);
    }
  }, [historyPayload, normalizedHistoryPoints]);

  const effectiveHistoryPayload =
    normalizedHistoryPoints.length > 0 ? historyPayload : stableHistoryPayload;
  const payload = effectiveHistoryPayload || quotePayload;
  const currency =
    payload?.currency || (String(market || "").toUpperCase() === "SG" ? "SGD" : "USD");
  const quote = {
    ...(effectiveHistoryPayload?.quote || {}),
    ...(quotePayload?.quote || {}),
  };
  const points = useMemo(() => normalizeChartPoints(payload?.points || []), [payload?.points]);
  const derivedIndicators = useMemo(() => buildIndicators(points), [points]);
  const changeValue = Number(quote.change || 0);
  const chartTone = changeValue >= 0 ? "#43d39e" : "#ef6a7b";
  const freshnessLabel = getFreshnessLabel(payload);
  const chartHeight = expanded ? 520 : 320;
  const transientDataError =
    points.length > 0 ? "" : historyError || quoteError || "";
  const nonBlockingWarning =
    points.length > 0 ? historyError || quoteError || payload?.providerWarning || "" : "";

  useEffect(() => {
    const node = mainChartRef.current;
    const rsiNode = rsiChartRef.current;
    if (!node || !width || !points.length) return undefined;
    setRenderError("");

    node.innerHTML = "";
    if (rsiNode) rsiNode.innerHTML = "";

    let chart;
    let rsiChart;

    try {
      chart = createChart(node, {
        width,
        height: chartHeight,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#b7c6d9",
        },
        grid: {
          vertLines: { color: "rgba(74, 96, 124, 0.12)" },
          horzLines: { color: "rgba(74, 96, 124, 0.12)" },
        },
        crosshair: {
          vertLine: { color: "rgba(111, 191, 255, 0.45)", width: 1 },
          horzLine: { color: "rgba(111, 191, 255, 0.25)", width: 1 },
        },
        rightPriceScale: {
          borderColor: "rgba(96, 123, 158, 0.16)",
        },
        timeScale: {
          borderColor: "rgba(96, 123, 158, 0.16)",
          timeVisible: true,
        },
        handleScroll: true,
        handleScale: true,
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#43d39e",
        downColor: "#ef6a7b",
        wickUpColor: "#43d39e",
        wickDownColor: "#ef6a7b",
        borderVisible: false,
      });
      candleSeries.setData(
        points.map((point) => ({
          time: toChartTime(point.timestamp),
          open: point.open,
          high: point.high,
          low: point.low,
          close: point.close,
        }))
      );

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "",
        color: "rgba(70, 167, 255, 0.25)",
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.82,
          bottom: 0,
        },
      });
      volumeSeries.setData(
        points.map((point) => ({
          time: toChartTime(point.timestamp),
          value: point.volume,
          color:
            point.close >= point.open
              ? "rgba(67, 211, 158, 0.28)"
              : "rgba(239, 106, 123, 0.28)",
        }))
      );

      if (indicators.sma && derivedIndicators.sma.length) {
        const series = chart.addSeries(LineSeries, {
          color: "#f7c65f",
          lineWidth: 2,
        });
        series.setData(derivedIndicators.sma);
      }
      if (indicators.ema && derivedIndicators.ema.length) {
        const series = chart.addSeries(LineSeries, {
          color: "#7f8cff",
          lineWidth: 2,
        });
        series.setData(derivedIndicators.ema);
      }
      if (indicators.vwap && derivedIndicators.vwap.length) {
        const series = chart.addSeries(LineSeries, {
          color: "#55d7ff",
          lineWidth: 2,
        });
        series.setData(derivedIndicators.vwap);
      }
      if (indicators.bollinger) {
        if (derivedIndicators.bollinger.upper.length) {
          const upper = chart.addSeries(LineSeries, {
            color: "rgba(238, 116, 173, 0.85)",
            lineWidth: 1,
          });
          upper.setData(derivedIndicators.bollinger.upper);
        }
        if (derivedIndicators.bollinger.lower.length) {
          const lower = chart.addSeries(LineSeries, {
            color: "rgba(238, 116, 173, 0.55)",
            lineWidth: 1,
          });
          lower.setData(derivedIndicators.bollinger.lower);
        }
      }

      chart.timeScale().fitContent();

      if (rsiNode) {
        rsiChart = createChart(rsiNode, {
          width,
          height: 112,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "#8fa1b6",
          },
          grid: {
            vertLines: { color: "rgba(74, 96, 124, 0.08)" },
            horzLines: { color: "rgba(74, 96, 124, 0.08)" },
          },
          rightPriceScale: {
            borderColor: "rgba(96, 123, 158, 0.1)",
          },
          timeScale: {
            borderColor: "rgba(96, 123, 158, 0.1)",
            timeVisible: true,
          },
        });
        if (indicators.rsi && derivedIndicators.rsi.length) {
          const rsiSeries = rsiChart.addSeries(AreaSeries, {
            lineColor: "#7fe4ff",
            topColor: "rgba(127, 228, 255, 0.16)",
            bottomColor: "rgba(127, 228, 255, 0.02)",
            lineWidth: 2,
          });
          rsiSeries.setData(derivedIndicators.rsi);
        }
        if (indicators.macd && derivedIndicators.macd.signal.length) {
          const macdSeries = rsiChart.addSeries(LineSeries, {
            color: "#8c7bff",
            lineWidth: 2,
          });
          const signalSeries = rsiChart.addSeries(LineSeries, {
            color: "#ffb86b",
            lineWidth: 2,
          });
          macdSeries.setData(derivedIndicators.macd.line);
          signalSeries.setData(derivedIndicators.macd.signal);
        }
        rsiChart.timeScale().fitContent();
      }
    } catch (error) {
      setRenderError(error?.message || "Unable to render chart.");
    }

    return () => {
      chart?.remove();
      rsiChart?.remove();
    };
  }, [points, width, chartHeight, indicators, derivedIndicators]);

  return (
    <section className={`stock-price-chart ${expanded ? "expanded" : ""}`}>
      <div className="stock-price-chart-header">
        <div className="stock-price-chart-heading">
          <span className="eyebrow">Price action</span>
          <strong>{symbol}</strong>
          <span className="stock-price-chart-caption">
            {payload?.source === "MOOMOO_OPEND"
              ? "Broker-backed market data through the provider abstraction."
              : payload?.source === "YAHOO_FINANCE"
                ? "Yahoo fallback for delayed market context."
                : payload?.source === "SCANNER_CACHE"
                  ? "Latest scanner price only."
                  : "Streaming market context."}
          </span>
        </div>

        <div className="stock-price-chart-meta">
          <button
            className="stock-price-chart-expand"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <span className="stock-price-chart-badge">{payload?.source || "Loading"}</span>
          <span className={`stock-price-chart-badge ${getFreshnessClass(payload)}`}>
            {freshnessLabel}
          </span>
        </div>
      </div>

      <div className="stock-price-chart-range" role="tablist" aria-label="Price history timeframe">
        {TIMEFRAME_OPTIONS.map((option) => (
          <button
            className={timeframe === option.value ? "active" : ""}
            key={option.value}
            onClick={() => setTimeframe(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="stock-price-chart-indicators" aria-label="Indicator toggles">
        {[
          ["sma", "MA"],
          ["ema", "EMA"],
          ["vwap", "VWAP"],
          ["bollinger", "Bollinger"],
          ["rsi", "RSI"],
          ["macd", "MACD"],
        ].map(([key, label]) => (
          <button
            className={indicators[key] ? "active" : ""}
            key={key}
            onClick={() => setIndicators((current) => ({ ...current, [key]: !current[key] }))}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {nonBlockingWarning ? (
        <div className="stock-price-chart-warning" role="note">
          {nonBlockingWarning}
        </div>
      ) : null}

      {transientDataError || renderError ? (
        <div className="stock-price-chart-error">
          <strong>Market data unavailable</strong>
          <p>{transientDataError || renderError}</p>
        </div>
      ) : payload?.chartUnavailable || !points.length ? (
        <div className="stock-price-chart-empty">
          <strong>Chart unavailable</strong>
          <p>{payload?.providerWarning || "No recent chart points were available for this symbol."}</p>
        </div>
      ) : (
        <>
          <div className="stock-price-chart-price">
            <strong>{formatMoney(quote.last, currency)}</strong>
            <span className={`stock-price-chart-change ${changeValue >= 0 ? "positive" : "negative"}`}>
              {changeValue >= 0 ? "+" : ""}
              {formatMoney(quote.change, currency)} ({Number(quote.changePercent || 0).toFixed(2)}%)
            </span>
          </div>

          <div className="stock-price-chart-stats live-grid">
            <div className="stock-price-chart-stat">
              <span>Bid</span>
              <strong>{formatMoney(quote.bid, currency)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>Ask</span>
              <strong>{formatMoney(quote.ask, currency)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>Spread</span>
              <strong>{formatMoney(quote.spread, currency)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>Open</span>
              <strong>{formatMoney(quote.open, currency)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>High</span>
              <strong>{formatMoney(quote.high, currency)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>Low</span>
              <strong>{formatMoney(quote.low, currency)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>Previous Close</span>
              <strong>{formatMoney(quote.previousClose, currency)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>Volume</span>
              <strong>{formatCompactNumber(quote.volume)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>52 Week High</span>
              <strong>{formatMoney(quote.week52High, currency)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>52 Week Low</span>
              <strong>{formatMoney(quote.week52Low, currency)}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>Market Status</span>
              <strong>{quote.marketStatus || "-"}</strong>
            </div>
            <div className="stock-price-chart-stat">
              <span>Session</span>
              <strong>{quote.tradingSession || "-"}</strong>
            </div>
          </div>

          <div className="stock-price-chart-canvas" ref={shellRef}>
            <div
              className="stock-price-chart-main-canvas"
              ref={mainChartRef}
              style={{ height: `${chartHeight}px` }}
            />
            <div className="stock-price-chart-subpane" ref={rsiChartRef} />
          </div>

          <div className="stock-price-chart-indicator-summary">
            <div>
              <span>RSI</span>
              <strong>{formatNumber(derivedIndicators.rsi.at(-1)?.value)}</strong>
            </div>
            <div>
              <span>MACD</span>
              <strong>{formatNumber(derivedIndicators.macd.latest?.macd)}</strong>
            </div>
            <div>
              <span>Signal</span>
              <strong>{formatNumber(derivedIndicators.macd.latest?.signal)}</strong>
            </div>
            <div>
              <span>Histogram</span>
              <strong>{formatNumber(derivedIndicators.macd.latest?.histogram)}</strong>
            </div>
            <div>
              <span>Last Updated</span>
              <strong>{formatTimestamp(payload?.lastUpdated)}</strong>
            </div>
          </div>
        </>
      )}

      <div className="stock-price-chart-footer">
        <span className="stock-price-chart-caption">
          {payload?.isLive
            ? "Live quote freshness depends on provider entitlement and broker session health."
            : "Chart data is market context only and does not guarantee execution quality."}
        </span>
      </div>
    </section>
  );
}
