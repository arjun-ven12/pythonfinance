export default function StrategyEvolutionTimeline({ memory }) {
  const timeline = memory?.timeline || [];

  return (
    <section className="strategy-lab-card strategy-evidence-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Strategy memory</p>
          <h2>Version evolution</h2>
        </div>
        <span>{timeline.length} versions</span>
      </div>
      {timeline.length > 0 ? (
        <div className="strategy-evolution-timeline">
          {timeline.slice().reverse().slice(0, 8).map((item) => (
            <article key={item.id}>
              <span>Version {item.version}</span>
              <strong>{item.changeNote || "Strategy saved"}</strong>
              <p>{new Date(item.createdAt).toLocaleString()}</p>
              {item.changed?.length > 0 ? (
                <ul>
                  {item.changed.slice(0, 4).map((change) => (
                    <li key={change.key}>
                      {change.key}: {String(change.before)} → {String(change.after)}
                    </li>
                  ))}
                </ul>
              ) : (
                <small>Initial evidence snapshot.</small>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="alerts-empty">Version history appears after saving strategy changes.</p>
      )}
    </section>
  );
}
