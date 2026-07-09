export default function StrategyRunMetrics({ rows = [] }) {
  if (!rows || rows.length <= 1) {
    return null;
  }

  const metric = (value, suffix = "") => {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(2)}${suffix}` : "Not Available";
  };

  return (
    <div className="strategy-sweep-table">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Return</th>
            <th>CAGR</th>
            <th>Sharpe</th>
            <th>Drawdown</th>
            <th>Win Rate</th>
            <th>Trades</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol}>
              <td>{row.symbol}</td>
              <td>{metric(row.result?.total_return_pct, "%")}</td>
              <td>{metric(row.result?.annualized_return_pct, "%")}</td>
              <td>{metric(row.result?.sharpe_ratio)}</td>
              <td>{metric(row.result?.max_drawdown_pct, "%")}</td>
              <td>{metric(row.result?.win_rate_pct, "%")}</td>
              <td>{row.result?.completed_trades ?? "Not Available"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


