export default function MetricCards({ className = "", metrics = [] }) {
  return (
    <dl className={`detail-stats ${className}`.trim()}>
      {metrics.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
