export default function PreflightChecklist({ preflight, summary }) {
  return (
    <article className="ibkr-card">
      <div className="broker-card-header">
        <div><p className="eyebrow">Preflight</p><h3>Execution readiness</h3></div>
        <span className={`ibkr-status ${String(preflight?.overall || "blocked").toLowerCase()}`}>{preflight?.overall || "BLOCKED"}</span>
      </div>
      <div className="broker-preflight-list">
        {(preflight?.checks || []).map((check) => (
          <div className={`broker-preflight-row ${check.status.toLowerCase()}`} key={check.key}>
            <strong>{check.label}</strong>
            <span>{check.status}</span>
            <p>{check.detail}</p>
          </div>
        ))}
      </div>
      <p className="ibkr-note">{summary}</p>
    </article>
  );
}
