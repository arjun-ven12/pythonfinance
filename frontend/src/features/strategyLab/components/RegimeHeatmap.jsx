function getRegimeClass(strength) {
  if (strength === "Strong") return "strong";
  if (strength === "Weak") return "weak";
  return "stable";
}

export default function RegimeHeatmap({
  onRun,
  result,
  running,
  selectedExperiment,
}) {
  const regimes = result?.regimes || [];

  return (
    <section className="strategy-lab-card strategy-evidence-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Regime testing</p>
          <h2>Survival by market environment</h2>
        </div>
        <button
          disabled={!selectedExperiment || running}
          onClick={() => selectedExperiment && onRun(selectedExperiment.id)}
          type="button"
        >
          {running ? "Analyzing..." : "Analyze Regimes"}
        </button>
      </div>
      {regimes.length > 0 ? (
        <div className="strategy-regime-heatmap">
          {regimes.map((regime) => (
            <article className={getRegimeClass(regime.strength)} key={regime.regime}>
              <span>{regime.regime}</span>
              <strong>{regime.strength}</strong>
              <p>
                Win {Number(regime.winRate || 0).toFixed(1)}% · PF{" "}
                {regime.profitFactor === null ? "-" : Number(regime.profitFactor || 0).toFixed(2)}
              </p>
              <small>
                {regime.tradeCount} trades · Expectancy {Number(regime.expectancy || 0).toFixed(2)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <p className="alerts-empty">
          Regime evidence appears after runs have persisted trades with regime context.
        </p>
      )}
    </section>
  );
}
