export default function ConnectionLogPanel({ logs }) {
  return (
    <article className="ibkr-card">
      <div><p className="eyebrow">Connection Logs</p><h3>Latest diagnostics</h3></div>
      <div className="broker-log-list">
        {(logs || []).length ? logs.slice(0, 12).map((log) => (
          <div className="broker-log-row" key={log.id || `${log.action}-${log.timestamp}`}>
            <span>{log.timestamp ? new Date(log.timestamp).toLocaleString() : "-"}</span>
            <strong>{log.action}</strong>
            <b className={log.success ? "positive" : "negative"}>{log.success ? "Success" : "Failed"}</b>
            <small>{log.error || `${log.latency ?? "-"}ms`}</small>
          </div>
        )) : <p className="alerts-empty">No broker diagnostics logged yet.</p>}
      </div>
    </article>
  );
}
