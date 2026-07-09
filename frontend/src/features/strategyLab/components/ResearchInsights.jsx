export default function ResearchInsights({
  experiments,
  latestSweep,
  selectedRun,
}) {
  const regimeBreakdown = selectedRun?.settingsJson?.regime_breakdown || [];
  const strongestRegime = [...regimeBreakdown]
    .sort((left, right) => Number(right.winRate || 0) - Number(left.winRate || 0))[0];

  return (
      <section className="strategy-lab-card">
        <div className="alerts-panel-header">
          <div>
            <p className="eyebrow">Research Insights</p>
            <h2>Strategy intelligence</h2>
          </div>
          <span>Derived from saved runs and optimization history</span>
        </div>
        <div className="strategy-insight-grid">
          <article>
            <span>Best performing strategy</span>
            <strong>
              {experiments
                .filter((experiment) => experiment.runs?.[0])
                .sort((a, b) => Number(b.runs[0].returnPct || 0) - Number(a.runs[0].returnPct || 0))[0]
                ?.name || "Not enough runs yet"}
            </strong>
          </article>
          <article>
            <span>Worst performing strategy</span>
            <strong>
              {experiments
                .filter((experiment) => experiment.runs?.[0])
                .sort((a, b) => Number(a.runs[0].returnPct || 0) - Number(b.runs[0].returnPct || 0))[0]
                ?.name || "Not enough runs yet"}
            </strong>
          </article>
          <article>
            <span>Best universe</span>
            <strong>{selectedRun?.settingsJson?.symbols?.join(", ") || selectedRun?.symbol || "Pending"}</strong>
          </article>
          <article>
            <span>Best market regime</span>
            <strong>{strongestRegime?.regime || "Needs regime-tagged runs"}</strong>
          </article>
          <article>
            <span>Strongest sector</span>
            <strong>{selectedRun?.settingsJson?.sector_breakdown?.[0]?.sector || "Needs sector data"}</strong>
          </article>
          <article>
            <span>Weakest sector</span>
            <strong>{selectedRun?.settingsJson?.sector_breakdown?.at?.(-1)?.sector || "Needs sector data"}</strong>
          </article>
          <article>
            <span>Confidence calibration</span>
            <strong>{selectedRun?.settingsJson?.validation_summary || "Use Validation tab for calibration"}</strong>
          </article>
          <article>
            <span>Parameter stability</span>
            <strong>
              {latestSweep
                ? `${latestSweep.totalRuns || 0} combinations tested`
                : "Run optimization to measure stability"}
            </strong>
          </article>
        </div>
        <div className="approval-audit-list">
          <article>
            <span>Strategy improvement suggestions</span>
            <strong>Next research step</strong>
            <p>
              Run at least one backtest and one optimization sweep for each promising strategy,
              then compare return, Sharpe, drawdown, trade count, and robustness before promoting
              anything to the scanner.
            </p>
          </article>
          <article>
            <span>Optimization history</span>
            <strong>{latestSweep ? new Date(latestSweep.createdAt).toLocaleString() : "No sweep yet"}</strong>
            <p>
              {latestSweep
                ? `Latest sweep tested ${latestSweep.totalRuns || 0} parameter combinations.`
                : "Optimization history will appear after the first parameter sweep."}
            </p>
          </article>
        </div>
      </section>
  );
}
