export default function PreTradeSimulator({
  activeHorizonLabel,
  formatMoney,
  formatRatioPercent,
  preTrade,
}) {
  const {
    analyze,
    error,
    form,
    loading,
    result,
    updateField,
  } = preTrade;
  const recommendation = result?.recommendation || "";
  const warns = ["WAIT", "REJECT"].includes(recommendation);
  const before = result?.portfolio_before || {};
  const after = result?.portfolio_after || {};
  const risk = result?.risk_impact || {};
  const events = result?.upcoming_events || [];
  const reasoning = result?.news_reasoning || {};
  const violations = result?.safety_violations || [];
  const checklist = result?.checklist || [];

  return (
    <section className="alerts-panel pre-trade-panel approval-pre-trade-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Pre-trade simulator</p>
          <h2>Approval Impact Analysis</h2>
        </div>
        <span>Analysis only - no orders placed</span>
      </div>

      <form className="pre-trade-form" onSubmit={analyze}>
        <label htmlFor="pre-trade-symbol">
          <span>Symbol</span>
          <input
            id="pre-trade-symbol"
            onChange={(event) => updateField("symbol", event.target.value)}
            placeholder="AAPL"
            required
            type="text"
            value={form.symbol}
          />
        </label>

        <label htmlFor="pre-trade-side">
          <span>Side</span>
          <select
            id="pre-trade-side"
            onChange={(event) => updateField("side", event.target.value)}
            value={form.side}
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </label>

        <label htmlFor="pre-trade-quantity">
          <span>Quantity</span>
          <input
            id="pre-trade-quantity"
            min="0"
            onChange={(event) => updateField("quantity", event.target.value)}
            required
            step="1"
            type="number"
            value={form.quantity}
          />
        </label>

        <label htmlFor="pre-trade-entry">
          <span>Entry price</span>
          <input
            id="pre-trade-entry"
            min="0"
            onChange={(event) => updateField("entryPrice", event.target.value)}
            required
            step="0.01"
            type="number"
            value={form.entryPrice}
          />
        </label>

        <label htmlFor="pre-trade-stop">
          <span>Stop loss</span>
          <input
            id="pre-trade-stop"
            min="0"
            onChange={(event) => updateField("stopLoss", event.target.value)}
            required
            step="0.01"
            type="number"
            value={form.stopLoss}
          />
        </label>

        <label htmlFor="pre-trade-target">
          <span>Take profit</span>
          <input
            id="pre-trade-target"
            min="0"
            onChange={(event) => updateField("takeProfit", event.target.value)}
            required
            step="0.01"
            type="number"
            value={form.takeProfit}
          />
        </label>

        <button disabled={loading} type="submit">
          {loading ? "Analyzing..." : "Analyze Trade"}
        </button>
      </form>

      {error && <p className="engine-error">{error}</p>}

      {result && (
        <div className={`pre-trade-results ${warns ? "pre-trade-results-warning" : ""}`}>
          <div className="pre-trade-summary">
            <span className={`recommendation-badge recommendation-${recommendation.toLowerCase()}`}>
              {recommendation || "UNKNOWN"}
            </span>
            <div>
              <strong>{result.risk_level || "UNKNOWN"} risk</strong>
              <p>{result.explanation}</p>
            </div>
          </div>

          <div className="pre-trade-metrics">
            <div>
              <span>Portfolio before</span>
              <strong>{formatMoney(before.equity)}</strong>
              <small>Cash {formatMoney(before.cash)}</small>
            </div>
            <div>
              <span>Portfolio after</span>
              <strong>{formatMoney(after.equity)}</strong>
              <small>Cash {formatMoney(after.cash)}</small>
            </div>
            <div>
              <span>Max loss</span>
              <strong>{formatMoney(risk.estimated_max_loss)}</strong>
              <small>{formatRatioPercent(risk.risk_amount_pct)} risk</small>
            </div>
            <div>
              <span>Exposure change</span>
              <strong>
                {formatMoney(before.total_exposure)} to{" "}
                {formatMoney(after.new_total_exposure)}
              </strong>
              <small>New exposure {formatRatioPercent(after.new_total_exposure_pct)}</small>
            </div>
            <div>
              <span>Horizon</span>
              <strong>{result.trading_horizon?.name || activeHorizonLabel}</strong>
              <small>
                {result.trading_horizon?.holding_period_assumption ||
                  "Current dashboard setting"}
              </small>
            </div>
          </div>

          <div className="pre-trade-detail-grid">
            <article>
              <h3>Upcoming events</h3>
              {events.length > 0 ? (
                <ul>
                  {events.map((event, index) => (
                    <li key={`${event.title || event.event_type}-${index}`}>
                      <strong>{event.event_type || "EVENT"}</strong>
                      <span>{event.title || "Untitled event"}</span>
                      {event.starts_at && <small>{new Date(event.starts_at).toLocaleString()}</small>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No upcoming events returned.</p>
              )}
            </article>

            <article>
              <h3>AI reasoning</h3>
              <p>{reasoning.news_summary || "No AI summary returned."}</p>
              <dl>
                <div>
                  <dt>Risk</dt>
                  <dd>{reasoning.risk_level || "-"}</dd>
                </div>
                <div>
                  <dt>Sentiment</dt>
                  <dd>{reasoning.sentiment || "-"}</dd>
                </div>
              </dl>
              {reasoning.reasoning && <small>{reasoning.reasoning}</small>}
            </article>

            <article>
              <h3>Safety violations</h3>
              {violations.length > 0 ? (
                <ul>
                  {violations.map((violation, index) => (
                    <li key={`${violation}-${index}`}>{violation}</li>
                  ))}
                </ul>
              ) : (
                <p>No blocking safety violations.</p>
              )}
            </article>

            <article>
              <h3>Final checklist</h3>
              {checklist.length > 0 ? (
                <ul>
                  {checklist.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>No checklist items returned.</p>
              )}
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
