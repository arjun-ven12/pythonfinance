export default function MetricPill({ label, tone = "neutral", value }) {
  return (
    <div className={`watchlist-metric-pill tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
