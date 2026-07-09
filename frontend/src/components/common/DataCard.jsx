export default function DataCard({ className = "", detail, label, tone = "neutral", value }) {
  return (
    <article className={`data-card summary-panel tone-${tone} ${className}`.trim()}>
      <span className="data-card-label">{label}</span>
      <strong className="data-card-value">{value}</strong>
      {detail && <small className="data-card-detail">{detail}</small>}
    </article>
  );
}
