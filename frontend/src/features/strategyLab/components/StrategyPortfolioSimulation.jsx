import { useMemo, useState } from "react";

function fmt(value, suffix = "%") {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}${suffix}` : "Not measured";
}

export default function StrategyPortfolioSimulation({
  experiments,
  onRun,
  result,
  running,
}) {
  const runnableExperiments = useMemo(
    () => experiments.filter((experiment) => experiment.runs?.[0]),
    [experiments]
  );
  const [selectedIds, setSelectedIds] = useState(() =>
    runnableExperiments.slice(0, 2).map((experiment) => experiment.id)
  );
  const [allocationMode, setAllocationMode] = useState("EQUAL");
  const [customWeights, setCustomWeights] = useState({});

  const toggleExperiment = (experimentId) => {
    setSelectedIds((current) =>
      current.includes(experimentId)
        ? current.filter((id) => id !== experimentId)
        : [...current, experimentId]
    );
  };

  const selectedExperiments = runnableExperiments.filter((experiment) =>
    selectedIds.includes(experiment.id)
  );

  const updateCustomWeight = (experimentId, value) => {
    setCustomWeights((current) => ({
      ...current,
      [experimentId]: value,
    }));
  };

  return (
    <section className="strategy-lab-card strategy-evidence-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Strategy portfolio</p>
          <h2>Combine multiple strategies</h2>
        </div>
        <button
          disabled={selectedIds.length < 2 || running}
          onClick={() =>
            onRun(selectedIds, {
              allocationMode,
              weights: Object.fromEntries(
                Object.entries(customWeights).map(([key, value]) => [key, Number(value) || 0])
              ),
            })
          }
          type="button"
        >
          {running ? "Simulating..." : "Simulate Portfolio"}
        </button>
      </div>

      <div className="strategy-portfolio-controls">
        <label>
          <span>Allocation</span>
          <select onChange={(event) => setAllocationMode(event.target.value)} value={allocationMode}>
            <option value="EQUAL">Equal weight</option>
            <option value="RISK_PARITY">Risk parity</option>
            <option value="CUSTOM">Custom weights</option>
          </select>
        </label>
        <div className="strategy-portfolio-picklist">
          {runnableExperiments.slice(0, 8).map((experiment) => (
            <button
              className={selectedIds.includes(experiment.id) ? "active" : ""}
              key={experiment.id}
              onClick={() => toggleExperiment(experiment.id)}
              type="button"
            >
              {experiment.name}
            </button>
          ))}
        </div>

        {allocationMode === "CUSTOM" && selectedExperiments.length > 0 ? (
          <div className="strategy-portfolio-custom-weights">
            {selectedExperiments.map((experiment) => (
              <label className="strategy-portfolio-custom-weight" key={experiment.id}>
                <span>{experiment.name}</span>
                <input
                  className="st-input"
                  min="0"
                  onChange={(event) => updateCustomWeight(experiment.id, event.target.value)}
                  placeholder="25"
                  step="1"
                  type="number"
                  value={customWeights[experiment.id] ?? ""}
                />
              </label>
            ))}
          </div>
        ) : null}
      </div>

      {result ? (
        <>
          <div className="strategy-evidence-metrics">
            <article>
              <span>Combined return</span>
              <strong>{fmt(result.metrics?.combinedReturn)}</strong>
            </article>
            <article>
              <span>Combined Sharpe</span>
              <strong>{fmt(result.metrics?.combinedSharpe, "")}</strong>
            </article>
            <article>
              <span>Combined drawdown</span>
              <strong>{fmt(result.metrics?.combinedDrawdown)}</strong>
            </article>
            <article>
              <span>Capital usage</span>
              <strong>{fmt(result.metrics?.capitalUsage)}</strong>
            </article>
          </div>
          <div className="strategy-leaderboard-list">
            {result.strategies?.map((strategy) => (
              <article key={strategy.id}>
                <span>{Math.round((strategy.weight || 0) * 100)}%</span>
                <div>
                  <strong>{strategy.name}</strong>
                  <p>
                    Return {fmt(strategy.returnPct)} · Sharpe {fmt(strategy.sharpe, "")} · DD{" "}
                    {fmt(strategy.maxDrawdown)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="alerts-empty">
          Run two or more strategies first, then combine them into a research-only portfolio.
        </p>
      )}
    </section>
  );
}
