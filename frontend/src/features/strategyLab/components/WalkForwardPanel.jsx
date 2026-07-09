function formatMetric(value, suffix = "") {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}${suffix}` : "Not measured";
}

export default function WalkForwardPanel({
  onRun,
  result,
  running,
  selectedExperiment,
}) {
  const run = result?.walkForwardRun || selectedExperiment?.walkForwardRuns?.[0] || null;
  const segments = run?.segments || result?.result?.segments || [];

  return (
    <section className="strategy-lab-card strategy-evidence-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Walk-forward</p>
          <h2>Train → validate → test</h2>
        </div>
        <button
          disabled={!selectedExperiment || running}
          onClick={() => selectedExperiment && onRun(selectedExperiment.id)}
          type="button"
        >
          {running ? "Running..." : "Run Walk-forward"}
        </button>
      </div>

      {run ? (
        <>
          <div className="strategy-evidence-metrics">
            <article>
              <span>OOS return</span>
              <strong>{formatMetric(run.oosReturn, "%")}</strong>
            </article>
            <article>
              <span>OOS Sharpe</span>
              <strong>{formatMetric(run.oosSharpe)}</strong>
            </article>
            <article>
              <span>OOS drawdown</span>
              <strong>{formatMetric(run.oosDrawdown, "%")}</strong>
            </article>
            <article>
              <span>Stability</span>
              <strong>{formatMetric(run.stabilityScore)}</strong>
            </article>
            <article>
              <span>Out-of-regime</span>
              <strong>
                {run.summaryJson?.outOfRegimeStability?.pass === true
                  ? "Pass"
                  : run.summaryJson?.outOfRegimeStability?.pass === false
                    ? "Fail"
                    : "Not measured"}
              </strong>
            </article>
          </div>
          {run.summaryJson?.outOfRegimeStability && (
            <div className="strategy-validation-warning">
              <strong>Out-of-regime check</strong>
              <p>
                Train {formatMetric(run.summaryJson.outOfRegimeStability.trainReturn, "%")} ·
                OOS {formatMetric(run.summaryJson.outOfRegimeStability.outOfRegimeReturn, "%")} ·
                Decay {formatMetric(run.summaryJson.outOfRegimeStability.returnDecayPct, "%")}
              </p>
            </div>
          )}
          <div className="strategy-segment-grid">
            {segments.map((segment) => (
              <article key={`${segment.phase}-${segment.segmentIndex}`}>
                <span>{segment.phase}</span>
                <strong>{formatMetric(segment.returnPct, "%")}</strong>
                <p>
                  {segment.startDate ? new Date(segment.startDate).toLocaleDateString() : "Start"} -{" "}
                  {segment.endDate ? new Date(segment.endDate).toLocaleDateString() : "End"}
                </p>
                <small>
                  Sharpe {formatMetric(segment.sharpe)} · Trades {segment.tradeCount ?? 0}
                </small>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="alerts-empty">
          Run walk-forward testing to measure out-of-sample decay and stability.
        </p>
      )}
    </section>
  );
}
