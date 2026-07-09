import SummaryPanel from "../dashboard/SummaryPanel";

function formatSafetyPercent(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  return `${(numericValue * 100).toFixed(2)}%`;
}

function getRiskTone(value) {
  const numericValue = Number(value || 0);

  if (numericValue >= 0.9) {
    return "danger";
  }

  if (numericValue >= 0.65) {
    return "caution";
  }

  return "safe";
}

function RiskGauge({ label, value, detail }) {
  const clampedValue = Math.max(0, Math.min(1, Number(value || 0)));
  const tone = getRiskTone(clampedValue);

  return (
    <div className={`risk-gauge ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{(clampedValue * 100).toFixed(1)}%</strong>
      </div>
      <div className="risk-gauge-track">
        <span style={{ width: `${clampedValue * 100}%` }} />
      </div>
      {detail && <p>{detail}</p>}
    </div>
  );
}

export default function RiskDashboard({ data, error, formatMoney }) {
  const portfolio = data?.portfolio || {};
  const risk = data?.risk || {};
  const gauges = data?.gauges || {};
  const positions = data?.open_positions_risk || [];
  const proposedOrders = data?.proposed_orders_risk || [];
  const sectors = data?.sector_exposure || [];
  const violations = data?.safety_violations || [];

  return (
    <section className="risk-dashboard-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Risk dashboard</p>
          <h2>Portfolio Risk Control</h2>
        </div>
        {data?.generated_at && (
          <span>Updated {new Date(data.generated_at).toLocaleString()}</span>
        )}
      </div>

      {error && <p className="engine-error">{error}</p>}

      <section className="summary-grid">
        <SummaryPanel label="Equity" value={formatMoney(portfolio.equity)} />
        <SummaryPanel
          label="Cash %"
          value={formatSafetyPercent(portfolio.cash_pct)}
        />
        <SummaryPanel
          label="Total Exposure"
          value={formatSafetyPercent(portfolio.total_exposure_pct)}
        />
        <SummaryPanel
          label="Open Risk %"
          value={formatSafetyPercent(risk.open_risk_pct_of_equity)}
        />
        <SummaryPanel
          label="Daily Budget Left"
          value={formatMoney(risk.daily_loss_budget_remaining)}
        />
        <SummaryPanel
          label="Weekly Budget Left"
          value={formatMoney(risk.weekly_loss_budget_remaining)}
        />
      </section>

      <section className="risk-gauge-grid">
        <RiskGauge
          detail={`${formatSafetyPercent(portfolio.total_exposure_pct)} exposure`}
          label="Exposure usage"
          value={gauges.exposure_usage}
        />
        <RiskGauge
          detail={`${formatSafetyPercent(risk.daily_loss_budget_remaining_pct)} budget left`}
          label="Daily loss usage"
          value={gauges.daily_loss_usage}
        />
        <RiskGauge
          detail={`${formatSafetyPercent(risk.weekly_loss_budget_remaining_pct)} budget left`}
          label="Weekly loss usage"
          value={gauges.weekly_loss_usage}
        />
        <RiskGauge
          detail={`${sectors[0]?.sector || "No sector"} is largest`}
          label="Sector concentration"
          value={gauges.max_sector_concentration}
        />
      </section>

      <section className={`risk-stop-impact ${getRiskTone(risk.open_risk_pct_of_equity / 0.03)}`}>
        <div>
          <p className="eyebrow">What if all stops hit?</p>
          <h2>{formatMoney(risk.max_loss_if_all_stops_hit)}</h2>
        </div>
        <p>
          Estimated open stop risk is{" "}
          {formatSafetyPercent(risk.open_risk_pct_of_equity)} of equity across{" "}
          {portfolio.open_positions_count || 0} open positions.
        </p>
      </section>

      <section className="risk-table-grid">
        <article className="risk-table-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Open Positions Risk</p>
              <h2>{positions.length} positions</h2>
            </div>
          </div>
          {positions.length > 0 ? (
            <div className="risk-table">
              <div className="risk-table-head">
                <span>Symbol</span>
                <span>Sector</span>
                <span>Exposure</span>
                <span>Stop</span>
                <span>Risk</span>
              </div>
              {positions.map((position) => (
                <div className="risk-table-row" key={position.symbol}>
                  <strong>{position.symbol}</strong>
                  <span>{position.sector || "UNKNOWN"}</span>
                  <span>{formatMoney(position.notional)}</span>
                  <span>
                    {position.stop_loss ? Number(position.stop_loss).toFixed(2) : "No stop"}
                  </span>
                  <span>{formatMoney(position.risk_at_stop)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="alerts-empty">No open paper positions.</p>
          )}
        </article>

        <article className="risk-table-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Proposed Orders Risk</p>
              <h2>{proposedOrders.length} orders</h2>
            </div>
            <span>{risk.high_risk_proposed_orders_count || 0} high risk</span>
          </div>
          {proposedOrders.length > 0 ? (
            <div className="risk-table">
              <div className="risk-table-head">
                <span>Symbol</span>
                <span>Route</span>
                <span>Notional</span>
                <span>Risk</span>
                <span>Status</span>
              </div>
              {proposedOrders.map((order) => (
                <div
                  className={`risk-table-row ${order.is_high_risk ? "danger" : "safe"}`}
                  key={`${order.symbol}-${order.route}`}
                >
                  <strong>{order.symbol}</strong>
                  <span>{order.route}</span>
                  <span>{formatMoney(order.notional)}</span>
                  <span>{formatSafetyPercent(order.risk_pct)}</span>
                  <span>{order.is_high_risk ? "High risk" : "OK"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="alerts-empty">No proposed orders.</p>
          )}
        </article>

        <article className="risk-table-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Sector Exposure</p>
              <h2>{sectors.length} sectors</h2>
            </div>
          </div>
          {sectors.length > 0 ? (
            <div className="risk-table">
              <div className="risk-table-head compact">
                <span>Sector</span>
                <span>Exposure</span>
                <span>Positions</span>
              </div>
              {sectors.map((sector) => (
                <div className="risk-table-row compact" key={sector.sector}>
                  <strong>{sector.sector}</strong>
                  <span>{formatSafetyPercent(sector.pct)}</span>
                  <span>{sector.positions}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="alerts-empty">No sector exposure available.</p>
          )}
        </article>

        <article className="risk-table-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Safety Violations</p>
              <h2>{violations.length} active</h2>
            </div>
          </div>
          {violations.length > 0 ? (
            <ul className="risk-violation-list">
              {violations.map((violation, index) => (
                <li key={`${violation}-${index}`}>{violation}</li>
              ))}
            </ul>
          ) : (
            <p className="alerts-empty">No active safety violations.</p>
          )}
        </article>
      </section>
    </section>
  );
}
