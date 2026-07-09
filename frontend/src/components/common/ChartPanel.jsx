export default function ChartPanel({
  children,
  title,
  subtitle,
  hasData = true,
  loading = false,
  emptyState = "No chart data available yet.",
}) {
  return (
    <section className="chart-panel">
      <div className="chart-header">
        <div>
          <p className="eyebrow">Chart</p>
          <h2>{title}</h2>
        </div>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {loading ? (
        <p className="alerts-empty">Loading chart…</p>
      ) : hasData ? (
        children
      ) : (
        <p className="alerts-empty">{emptyState}</p>
      )}
    </section>
  );
}
