export default function ChartPanel({ children, hasData = true, subtitle, title }) {
  return (
    <article className="chart-panel">
      <div className="chart-panel-header">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h3>{title}</h3>
        </div>
      </div>
      {hasData ? children : <p className="alerts-empty">No chart data available.</p>}
    </article>
  );
}

