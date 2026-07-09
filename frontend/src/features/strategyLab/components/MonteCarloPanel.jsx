function fmt(value, suffix = "%") {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}${suffix}` : "Not measured";
}

export default function MonteCarloPanel({
  onRun,
  result,
  running,
  selectedExperiment,
}) {
  const stress = result?.stressResult || selectedExperiment?.stressResults?.[0] || null;

  return (
    <section className="strategy-lab-card strategy-evidence-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Stress test</p>
          <h2>Monte Carlo execution stress</h2>
        </div>
        <button
          disabled={!selectedExperiment || running}
          onClick={() => selectedExperiment && onRun(selectedExperiment.id)}
          type="button"
        >
          {running ? "Simulating..." : "Run 500 Sims"}
        </button>
      </div>
      {stress ? (
        <div className="strategy-evidence-metrics">
          <article>
            <span>Best</span>
            <strong>{fmt(stress.bestReturn)}</strong>
          </article>
          <article>
            <span>Median</span>
            <strong>{fmt(stress.medianReturn)}</strong>
          </article>
          <article>
            <span>Worst</span>
            <strong>{fmt(stress.worstReturn)}</strong>
          </article>
          <article>
            <span>20% DD odds</span>
            <strong>{fmt(stress.probability20Drawdown)}</strong>
          </article>
        </div>
      ) : (
        <p className="alerts-empty">
          Run a stress test after a backtest with trades to estimate downside path risk.
        </p>
      )}
    </section>
  );
}
