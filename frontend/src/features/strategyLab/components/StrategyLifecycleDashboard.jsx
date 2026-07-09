function formatMetric(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "Not available";
  }

  return `${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}${suffix}`;
}

export default function StrategyLifecycleDashboard({ lifecycle }) {
  const strategies = lifecycle?.strategies || [];
  const activeStrategy =
    strategies.find((strategy) => strategy.status === "ACTIVE" || strategy.activeVersionId) ||
    strategies[0];

  return (
    <section className="strategy-lab-card">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Strategy Lifecycle</p>
          <h2>Scanner control center</h2>
        </div>
        <span>{strategies.length} tracked</span>
      </div>

      {!activeStrategy ? (
        <p className="empty-copy">Save and test a strategy to start lifecycle tracking.</p>
      ) : (
        <>
          <div className="strategy-insight-grid">
            <article>
              <span>Active strategy</span>
              <strong>{activeStrategy.name}</strong>
            </article>
            <article>
              <span>Status</span>
              <strong>{activeStrategy.status || "DRAFT"}</strong>
            </article>
            <article>
              <span>Deployed capital</span>
              <strong>{formatMetric(activeStrategy.deployedCapital, " USD")}</strong>
            </article>
            <article>
              <span>Approval conversion</span>
              <strong>{formatMetric(activeStrategy.approvalConversion, "%")}</strong>
            </article>
            <article>
              <span>Validation hit rate</span>
              <strong>{formatMetric(activeStrategy.realizedPerformance?.hitRate, "%")}</strong>
            </article>
            <article>
              <span>Realized return</span>
              <strong>{formatMetric(activeStrategy.realizedPerformance?.realizedReturn, "%")}</strong>
            </article>
            <article>
              <span>Expectancy</span>
              <strong>{formatMetric(activeStrategy.realizedPerformance?.expectancy, "%")}</strong>
            </article>
            <article>
              <span>Degradation</span>
              <strong>{formatMetric(activeStrategy.degradation, "%")}</strong>
            </article>
          </div>

          <div className="approval-audit-list">
            {strategies.slice(0, 4).map((strategy) => (
              <article key={strategy.experimentId}>
                <span>{strategy.status || "DRAFT"}</span>
                <strong>{strategy.name}</strong>
                <p>
                  {strategy.latestRun
                    ? `Latest run: ${formatMetric(strategy.latestRun.returnPct, "%")} return, ${formatMetric(strategy.latestRun.sharpe)} Sharpe, ${formatMetric(strategy.latestRun.tradeCount)} trades.`
                    : "No backtest evidence yet."}
                </p>
                {strategy.latestWalkForward?.outOfRegimeStability && (
                  <small>
                    Out-of-regime: {strategy.latestWalkForward.outOfRegimeStability.pass ? "Pass" : "Fail"} ·
                    decay {formatMetric(strategy.latestWalkForward.outOfRegimeStability.returnDecayPct, "%")}
                  </small>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
