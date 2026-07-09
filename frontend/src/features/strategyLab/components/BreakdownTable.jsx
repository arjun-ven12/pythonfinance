import { formatLabMetric } from "../utils/strategyMetrics";

export default function BreakdownTable({ rows = [], title }) {
  return (
    <article className="strategy-lab-card">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h2>{title}</h2>
        </div>
      </div>
      {rows.length > 0 ? (
        <div className="strategy-sweep-table">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Return</th>
                <th>Win Rate</th>
                <th>Drawdown</th>
                <th>Trades</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.group || row.regime || row.sector || row.bucket || index}`}>
                  <td>{row.group || row.regime || row.sector || row.bucket || row.label || "-"}</td>
                  <td>{formatLabMetric(row.return_pct ?? row.returnPct ?? row.averageReturnPct ?? row.averageReturn ?? row.return, "%")}</td>
                  <td>{formatLabMetric(row.win_rate_pct ?? row.winRate ?? row.win_rate, "%")}</td>
                  <td>{formatLabMetric(row.drawdown_pct ?? row.drawdownPct ?? row.maxDrawdownPct ?? row.averageDrawdownPct ?? row.averageDrawdown ?? row.maxDrawdown, "%")}</td>
                  <td>{row.trade_count ?? row.tradeCount ?? row.trades ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="alerts-empty">No breakdown data available for this run yet.</p>
      )}
    </article>
  );
}

