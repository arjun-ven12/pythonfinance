import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useHistoricalBars,
  useLiveQuote,
} from "../../marketData/hooks/useMarketDataSubscription";

const TIMEFRAME_OPTIONS = [
  { value: "5m", label: "1D" },
  { value: "1h", label: "1M" },
  { value: "1d", label: "1Y" },
];

function formatMoney(value, currency = "USD") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return `${currency} -`;
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric);
}

function formatChartLabel(timestamp, timeframe) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (timeframe === "5m") {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function mergeLiveQuote(points, quotePayload) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  const latestPrice = Number(quotePayload?.quote?.last ?? quotePayload?.quote?.close);
  if (!Number.isFinite(latestPrice)) {
    return points;
  }

  const nextPoints = [...points];
  const nowIso = new Date().toISOString();
  const lastIndex = nextPoints.length - 1;
  const lastPoint = nextPoints[lastIndex];
  nextPoints[lastIndex] = {
    ...lastPoint,
    close: latestPrice,
    high: Math.max(Number(lastPoint.high ?? latestPrice), latestPrice),
    low: Math.min(Number(lastPoint.low ?? latestPrice), latestPrice),
    timestamp: quotePayload?.lastUpdated || nowIso,
  };
  return nextPoints;
}

export default function DashboardMarketHistoryChart({ symbol }) {
  const [timeframe, setTimeframe] = useState("1h");
  const { payload: historyPayload, error: historyError } = useHistoricalBars(symbol, timeframe);
  const { payload: quotePayload, error: quoteError } = useLiveQuote(symbol);
  const historyPoints = Array.isArray(historyPayload?.points) ? historyPayload.points : [];
  const isLoading = Boolean(symbol) && !historyError && historyPoints.length === 0;
  const errorMessage = historyError || "";

  const chartPoints = useMemo(() => {
    if (historyPoints.length === 0) {
      return [];
    }

    return mergeLiveQuote(historyPoints, quotePayload).map((point) => ({
      close: Number(point.close || 0),
      high: Number(point.high || point.close || 0),
      low: Number(point.low || point.close || 0),
      label: formatChartLabel(point.timestamp, timeframe),
      timestamp: point.timestamp,
      volume: Number(point.volume || 0),
    }));
  }, [historyPoints, quotePayload, timeframe]);

  const latestPoint = chartPoints[chartPoints.length - 1] || null;
  const firstPoint = chartPoints[0] || null;
  const latestPrice = Number(
    quotePayload?.quote?.last ??
      latestPoint?.close ??
      historyPayload?.quote?.last
  );
  const basePrice = Number(firstPoint?.close);
  const priceDelta =
    Number.isFinite(latestPrice) && Number.isFinite(basePrice)
      ? latestPrice - basePrice
      : null;
  const priceDeltaPct =
    priceDelta != null && Number.isFinite(basePrice) && basePrice !== 0
      ? (priceDelta / basePrice) * 100
      : null;
  const currency =
    quotePayload?.currency || historyPayload?.currency || quotePayload?.quote?.currency || "USD";

  return (
    <div className="dashboard-market-history">
      <div className="history-chart-toolbar">
        <label htmlFor="dashboard-history-symbol">
          <span>Symbol</span>
          <strong className="mono dashboard-market-history__symbol" id="dashboard-history-symbol">
            {symbol || "-"}
          </strong>
        </label>
        <div className="dashboard-market-history__controls">
          {TIMEFRAME_OPTIONS.map((option) => (
            <button
              className={`q-mkt-pill${timeframe === option.value ? " active" : ""}`}
              key={option.value}
              onClick={() => setTimeframe(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-market-history__headline">
        <strong className="mono">{formatMoney(latestPrice, currency)}</strong>
        <span
          className={`dashboard-market-history__delta${
            priceDelta == null ? "" : priceDelta >= 0 ? " up" : " down"
          }`}
        >
          {priceDelta == null || priceDeltaPct == null
            ? "Awaiting range baseline"
            : `${priceDelta >= 0 ? "+" : ""}${formatMoney(priceDelta, currency)} (${priceDeltaPct.toFixed(2)}%)`}
        </span>
      </div>

      {historyPayload?.providerWarning ? (
        <p className="dashboard-market-history__warning">{historyPayload.providerWarning}</p>
      ) : quoteError ? (
        <p className="dashboard-market-history__warning">{quoteError}</p>
      ) : null}

      {isLoading ? (
        <p className="alerts-empty">Loading market history…</p>
      ) : errorMessage ? (
        <p className="alerts-empty">{errorMessage}</p>
      ) : chartPoints.length > 0 ? (
        <div className="chart-canvas">
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={chartPoints}>
              <defs>
                <linearGradient id="dashboardMarketHistoryFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.26} />
                  <stop offset="100%" stopColor="#58a6ff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
              <XAxis dataKey="label" minTickGap={28} stroke="#9aa9b8" />
              <YAxis
                domain={["auto", "auto"]}
                stroke="#9aa9b8"
                tickFormatter={(value) => formatMoney(value, currency)}
                width={88}
              />
              <Tooltip
                contentStyle={{
                  background: "#111720",
                  border: "1px solid #263242",
                  borderRadius: 8,
                  color: "#eef2f6",
                }}
                formatter={(value) => [formatMoney(value, currency), "Price"]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.timestamp || ""}
              />
              <Area
                dataKey="close"
                fill="url(#dashboardMarketHistoryFill)"
                stroke="none"
                type="monotone"
              />
              <Line dataKey="close" dot={false} stroke="#58a6ff" strokeWidth={2} type="monotone" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="alerts-empty">No market history available yet.</p>
      )}
    </div>
  );
}
