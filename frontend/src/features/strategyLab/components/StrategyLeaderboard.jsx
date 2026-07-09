export default function StrategyLeaderboard({ leaderboard }) {
  const topStrategies = leaderboard?.topStrategies || [];

  return (
    <section className="strategy-lab-card strategy-evidence-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Leaderboard</p>
          <h2>Evidence-weighted strategy ranking</h2>
        </div>
        <span>Performance + robustness + OOS quality</span>
      </div>
      {topStrategies.length > 0 ? (
        <div className="strategy-leaderboard-list">
          {topStrategies.slice(0, 6).map((strategy, index) => (
            <article key={strategy.experimentId}>
              <span>#{index + 1}</span>
              <div>
                <strong>{strategy.name}</strong>
                <p>{strategy.reasons?.join(" · ")}</p>
              </div>
              <b>{strategy.score}</b>
              <em>{strategy.category}</em>
            </article>
          ))}
        </div>
      ) : (
        <p className="alerts-empty">
          Create runs, robustness tests, walk-forward tests, and stress tests to rank strategies.
        </p>
      )}
    </section>
  );
}
