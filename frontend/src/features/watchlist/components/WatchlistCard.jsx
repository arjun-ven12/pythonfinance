import { formatNumber } from "../../../utils/numberFormat";

export default function WatchlistCard({ formatPercent, item, onRemove, onSelect, symbol }) {
  if (!item) {
    return (
      <article className="watchlist-card missing-data">
        <div className="watchlist-card-header">
          <div>
            <p className="eyebrow">Watchlist symbol</p>
            <h3>{symbol}</h3>
          </div>
          <button onClick={onRemove} type="button">
            Remove
          </button>
        </div>
        <p className="alerts-empty">No latest scan data.</p>
      </article>
    );
  }

  return (
    <article className={`watchlist-card ${item.signal.toLowerCase()}-card`}>
      <div className="watchlist-card-header">
        <button className="watchlist-symbol-button" onClick={onSelect} type="button">
          <span className="symbol-label">Symbol</span>
          <strong>{item.symbol}</strong>
        </button>
        <span className={`badge ${item.signal.toLowerCase()}`}>{item.signal}</span>
        <button onClick={onRemove} type="button">
          Remove
        </button>
      </div>

      <dl className="watchlist-metrics">
        <div>
          <dt>Score</dt>
          <dd>{formatNumber(item.opportunity_score)}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{formatNumber(item.confidence)}</dd>
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
          <dt>Win Rate</dt>
          <dd>{formatPercent(item.win_rate)}</dd>
        </div>
        <div>
          <dt>Drawdown</dt>
          <dd>{formatPercent(item.drawdown)}</dd>
        </div>
        <div>
          <dt>Latest Close</dt>
          <dd>{item.close ?? "-"}</dd>
        </div>
      </dl>

      <div className="detail-reasons">
        <p className="eyebrow">Reasons</p>
        <ul>
          {(item.reasons || []).map((reason, index) => (
            <li key={index}>{reason}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
