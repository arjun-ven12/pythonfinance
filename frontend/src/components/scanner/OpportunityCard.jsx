import ProgressBar from "../common/ProgressBar";
import { formatExchange } from "../../utils/marketMetadata";

export default function OpportunityCard({
  formatPercent,
  isExpanded,
  isSelected,
  item,
  onSelect,
  onToggleExpanded,
  onToggleWatchlist,
  watched,
}) {
  const market = item.market || (item.is_sgx ? "Singapore" : "US");
  const exchange = formatExchange(item.exchange, item);
  const currency = item.currency || "USD";
  const latestClose =
    item.close == null || item.close === ""
      ? "-"
      : `${currency} ${Number(item.close).toFixed(2)}`;
  const marketCap =
    item.market_cap == null
      ? "Market cap n/a"
      : Intl.NumberFormat(undefined, {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(Number(item.market_cap));

  return (
    <article
      className={`stock-card ${item.signal.toLowerCase()}-card ${
        isSelected ? "selected" : ""
      }`}
    >
      <button className="stock-card-main" onClick={onSelect} type="button">
        <div>
          <span className="symbol-label">Symbol</span>
          <h3>{item.display_symbol || item.symbol}</h3>
          <p className="stock-card-company">{item.company_name || item.symbol}</p>
          <div className="market-badge-row">
            <span className={`market-badge ${item.is_sgx ? "sgx" : "us"}`}>
              {exchange}
            </span>
            <span className="market-badge">{market}</span>
            <span className="market-badge currency">{currency}</span>
          </div>
        </div>
        <span className={`badge stock-card-signal ${item.signal.toLowerCase()}`}>{item.signal}</span>
        <div>
          <span>Score</span>
          <strong>{item.opportunity_score}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{item.confidence}</strong>
        </div>
        <div>
          <span>Latest Close</span>
          <strong>{latestClose}</strong>
        </div>
      </button>

      <div className="card-actions">
        <button onClick={onToggleExpanded} type="button">
          {isExpanded ? "Collapse" : "Expand"}
        </button>
        <button onClick={onToggleWatchlist} type="button">
          {watched ? "Watching" : "Watchlist"}
        </button>
      </div>

      {isExpanded && (
        <div className="expanded-card">
          <div className="progress-grid">
            <ProgressBar label="Score" value={item.opportunity_score} />
            <ProgressBar label="Confidence" value={item.confidence} />
            <ProgressBar label="Win rate" value={item.win_rate} />
            <ProgressBar label="Drawdown" value={item.drawdown} invert />
          </div>

          <dl className="metrics">
            <div>
              <dt>Sector</dt>
              <dd>{item.sector || "UNKNOWN"}</dd>
            </div>
            <div>
              <dt>Industry</dt>
              <dd>{item.industry || "UNKNOWN"}</dd>
            </div>
            <div>
              <dt>Market Cap</dt>
              <dd>{marketCap}</dd>
            </div>
            <div>
              <dt>Backtest</dt>
              <dd>{formatPercent(item.backtest_return)}</dd>
            </div>
            <div>
              <dt>Buy & Hold</dt>
              <dd>{formatPercent(item.buy_and_hold)}</dd>
            </div>
            <div>
              <dt>Drawdown</dt>
              <dd>{formatPercent(item.drawdown)}</dd>
            </div>
            <div>
              <dt>Trades</dt>
              <dd>{item.trades}</dd>
            </div>
          </dl>

          <ul className="reasons">
            {item.reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
