import { formatExchange } from "../../../utils/marketMetadata";

function formatClose(item) {
  if (!item || item.close == null || item.close === "") {
    return "-";
  }

  const currency = item.currency || "USD";
  const close = Number(item.close);
  return Number.isFinite(close) ? `${currency} ${close.toFixed(2)}` : "-";
}

function formatTimestamp(item) {
  const timestamp = [
    item?.generated_at,
    item?.generatedAt,
    item?.scan_generated_at,
    item?.scanGeneratedAt,
    item?.timestamp,
  ].find(Boolean);

  if (!timestamp) return "Pending";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recent";

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.round(diffHours / 24)}d ago`;
}

function OverflowMenu({ onRemove, symbol }) {
  return (
    <details className="watchlist-overflow-menu">
      <summary aria-label={`More actions for ${symbol}`}>⋮</summary>
      <div className="watchlist-overflow-panel">
        <button className="danger-action" onClick={onRemove} type="button">
          Remove
        </button>
      </div>
    </details>
  );
}

function formatMoney(value, currency = "USD") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${currency} -`;
  return `${currency} ${numeric.toFixed(2)}`;
}

function formatCompactNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric);
}

export default function WatchlistItem({
  flashDirection = "",
  isSelected,
  item,
  onRemove,
  onSelect,
  onView,
  quote,
  symbol,
}) {
  if (!item) {
    return (
      <article className={`watchlist-table-row pending ${isSelected ? "selected" : ""}`}>
        <div className="watchlist-cell watchlist-signal-cell">
          <span className="badge neutral">None</span>
        </div>
        <div className="watchlist-cell watchlist-symbol-cell">
          <strong>{symbol}</strong>
          <span>SG • SGD</span>
        </div>
        <div className="watchlist-cell watchlist-quote-cell"><p>-</p></div>
        <div className="watchlist-cell watchlist-quote-cell"><p>-</p></div>
        <div className="watchlist-cell watchlist-quote-cell"><p>-</p></div>
        <div className="watchlist-cell watchlist-status-cell"><p>Pending scan</p></div>
        <div className="watchlist-cell watchlist-action-cell">
          <button className="watchlist-view-button" onClick={onView} type="button">
            View
          </button>
          <OverflowMenu onRemove={onRemove} symbol={symbol} />
        </div>
      </article>
    );
  }

  const signal = item.signal || "HOLD";
  const market = item.market || (item.is_sgx ? "Singapore" : "US");
  const exchange = formatExchange(item.exchange, item);
  const latestClose = formatClose(item);
  const quoteData = quote?.quote || {};
  const liveLast = quoteData.last ?? item.close;
  const liveChange = Number(quoteData.change ?? 0);
  const changePercent = Number(quoteData.changePercent ?? 0);
  const rowCurrency = quote?.currency || item.currency || "USD";
  const marketStatus = quoteData.marketStatus || quote?.source || "Snapshot";

  return (
    <article
      className={`watchlist-table-row ${signal.toLowerCase()} ${isSelected ? "selected" : ""} ${flashDirection ? `flash-${flashDirection}` : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="watchlist-cell watchlist-signal-cell">
        <span className={`badge ${signal.toLowerCase()}`}>{signal}</span>
      </div>

      <div className="watchlist-cell watchlist-symbol-cell">
        <div className="watchlist-symbol-line">
          <strong>{item.display_symbol || item.symbol || symbol}</strong>
          {signal === "BUY" ? <em>Actionable</em> : null}
        </div>
        <span>{market} • {item.currency || "USD"}</span>
        <small>{item.company_name || item.companyName || latestClose}</small>
      </div>

      <div className="watchlist-cell watchlist-quote-cell">
        <strong>{formatMoney(liveLast, rowCurrency)}</strong>
        <small>{latestClose}</small>
      </div>

      <div className="watchlist-cell watchlist-quote-cell">
        <strong className={liveChange >= 0 ? "quote-up" : "quote-down"}>
          {liveChange >= 0 ? "+" : ""}
          {formatMoney(liveChange, rowCurrency)}
        </strong>
        <small className={liveChange >= 0 ? "quote-up" : "quote-down"}>
          {changePercent >= 0 ? "+" : ""}
          {changePercent.toFixed(2)}%
        </small>
      </div>

      <div className="watchlist-cell watchlist-quote-cell">
        <strong>{formatCompactNumber(quoteData.volume ?? item.volume)}</strong>
        <small>{exchange}</small>
      </div>

      <div className="watchlist-cell watchlist-status-cell">
        <strong>{marketStatus}</strong>
        <small>{formatTimestamp(item)}</small>
      </div>

      <div className="watchlist-cell watchlist-action-cell">
        <button
          className="watchlist-view-button"
          onClick={(event) => {
            event.stopPropagation();
            onView();
          }}
          type="button"
        >
          View
        </button>
        <div onClick={(event) => event.stopPropagation()}>
          <OverflowMenu onRemove={onRemove} symbol={symbol} />
        </div>
      </div>
    </article>
  );
}
