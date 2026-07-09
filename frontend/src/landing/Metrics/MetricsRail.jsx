import styles from "../LandingPage.module.css";

export default function MetricsRail({ metrics, developerMode }) {
  const items = [
    ["Signals", metrics.signals],
    ["Approved", metrics.approved],
    ["Paper P/L", "$0"],
    ["Validation", `${metrics.validation}%`],
    ["Evidence", metrics.evidence],
  ];

  return (
    <aside className={styles.metricsRail}>
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      {developerMode && (
        <div className={styles.developerMetrics}>
          <span>Developer metrics</span>
          <p>Scans · Ledger · Validation · Playbook</p>
        </div>
      )}
    </aside>
  );
}
