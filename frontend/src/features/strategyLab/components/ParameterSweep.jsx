import ParameterHeatmap from "./ParameterHeatmap";

export default function ParameterSweep({
  error,
  experiments,
  latestSweep,
  onRunSweep,
  runningSweepExperimentId,
  selectedExperiment,
  setSelectedExperimentId,
  stockUniverses,
  sweepConfig,
  sweepProgress,
  sweepResults,
  updateSweepConfig,
}) {
  return (
      <section className="strategy-lab-card">
        <div className="alerts-panel-header">
          <div>
            <p className="eyebrow">Parameter Sweep & Optimization</p>
            <h2>EMA / RSI Optimization</h2>
          </div>
          <span>Ranks by Sharpe, return, then drawdown</span>
        </div>
        <div className="strategy-sweep-grid">
          <label>
            <span>Selected strategy</span>
            <select
              onChange={(event) => setSelectedExperimentId(event.target.value)}
              value={selectedExperiment?.id || ""}
            >
              <option value="">Select strategy</option>
              {experiments.map((experiment) => (
                <option key={experiment.id} value={experiment.id}>{experiment.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Universe mode</span>
            <select
              onChange={(event) => updateSweepConfig("universeMode", event.target.value)}
              value={sweepConfig.universeMode || "SINGLE"}
            >
              <option value="SINGLE">Single / typed symbols</option>
              <option value="UNIVERSE">Saved stock universe</option>
              <option value="SP500_TOP_N">S&P 500 top N</option>
            </select>
          </label>
          {(sweepConfig.universeMode || "SINGLE") === "UNIVERSE" && (
            <label>
              <span>Selected universe</span>
              <select
                onChange={(event) => updateSweepConfig("universeId", event.target.value)}
                value={sweepConfig.universeId || ""}
              >
                <option value="">Select universe</option>
                {stockUniverses.map((universe) => (
                  <option key={universe.id} value={universe.id}>
                    {universe.name} ({universe.members?.length || 0})
                  </option>
                ))}
              </select>
            </label>
          )}
          {(sweepConfig.universeMode || "SINGLE") === "SP500_TOP_N" && (
            <label>
              <span>Top N</span>
              <input
                max="100"
                min="1"
                onChange={(event) => updateSweepConfig("topN", event.target.value)}
                type="number"
                value={sweepConfig.topN || "10"}
              />
            </label>
          )}
          <label>
            <span>Symbols</span>
            <input
              disabled={(sweepConfig.universeMode || "SINGLE") !== "SINGLE"}
              onChange={(event) => updateSweepConfig("symbol", event.target.value.toUpperCase())}
              placeholder="AAPL, MSFT, NVDA"
              value={sweepConfig.symbol}
            />
          </label>
          <label>
            <span>Period</span>
            <select
              onChange={(event) => updateSweepConfig("period", event.target.value)}
              value={sweepConfig.period}
            >
              <option value="6mo">6mo</option>
              <option value="1y">1y</option>
              <option value="2y">2y</option>
              <option value="5y">5y</option>
            </select>
          </label>
          <label>
            <span>Optimize metric</span>
            <select
              onChange={(event) => updateSweepConfig("metricToOptimize", event.target.value)}
              value={sweepConfig.metricToOptimize || "sharpe"}
            >
              <option value="sharpe">Sharpe</option>
              <option value="cagr">CAGR</option>
              <option value="returnPct">Return</option>
              <option value="maxDrawdown">Drawdown</option>
              <option value="winRate">Win Rate</option>
              <option value="profitFactor">Profit Factor</option>
            </select>
          </label>
          {[
            ["emaFast", "EMA Fast", "10", "30"],
            ["emaSlow", "EMA Slow", "40", "100"],
            ["rsi", "RSI", "50", "70"],
          ].map(([key, label, min, max]) => (
            <div className="strategy-sweep-range" key={key}>
              <span>{label}</span>
              <input aria-label={`${label} min`} min={min} max={max} onChange={(event) => updateSweepConfig(`${key}Min`, event.target.value)} type="number" value={sweepConfig[`${key}Min`]} />
              <input aria-label={`${label} max`} min={min} max={max} onChange={(event) => updateSweepConfig(`${key}Max`, event.target.value)} type="number" value={sweepConfig[`${key}Max`]} />
              <input aria-label={`${label} step`} min="1" onChange={(event) => updateSweepConfig(`${key}Step`, event.target.value)} type="number" value={sweepConfig[`${key}Step`]} />
            </div>
          ))}
          <label>
            <span>Max combinations</span>
            <input min="1" max="1000" onChange={(event) => updateSweepConfig("maxCombinations", event.target.value)} type="number" value={sweepConfig.maxCombinations} />
          </label>
          <button
            disabled={!selectedExperiment || runningSweepExperimentId === selectedExperiment?.id}
            onClick={() => selectedExperiment && onRunSweep(selectedExperiment.id)}
            type="button"
          >
            {runningSweepExperimentId === selectedExperiment?.id ? "Sweeping..." : "Run Optimization"}
          </button>
        </div>

        {(runningSweepExperimentId === selectedExperiment?.id || sweepProgress.percent > 0) && (
          <div
            className={`parameter-sweep-progress ${
              error ? "error" : sweepProgress.percent >= 100 ? "complete" : ""
            }`}
          >
            <div>
              <span>{sweepProgress.label}</span>
              <strong>{Math.round(sweepProgress.percent)}%</strong>
            </div>
            <div className="parameter-sweep-progress-track">
              <span
                style={{
                  width: `${Math.min(100, Math.max(0, sweepProgress.percent))}%`,
                }}
              />
            </div>
          </div>
        )}

        {latestSweep ? (
          <>
            <div className="strategy-sweep-summary">
              <div>
                <span>Total runs</span>
                <strong>{latestSweep.totalRuns}</strong>
              </div>
              <div>
                <span>Symbols</span>
                <strong>{latestSweep.rangesJson?.symbols?.join(", ") || latestSweep.symbol}</strong>
              </div>
              <div>
                <span>Period</span>
                <strong>{latestSweep.period}</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>{new Date(latestSweep.createdAt).toLocaleString()}</strong>
              </div>
            </div>
            <ParameterHeatmap
              metric={sweepConfig.metricToOptimize || "sharpe"}
              results={sweepResults}
            />
            <div className="strategy-sweep-table">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>EMA Fast</th>
                    <th>EMA Slow</th>
                    <th>RSI</th>
                    <th>Sharpe</th>
                    <th>Return</th>
                    <th>Drawdown</th>
                    <th>Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {sweepResults.slice(0, 20).map((result) => (
                    <tr key={result.id}>
                      <td>#{result.rank}</td>
                      <td>{result.emaFast}</td>
                      <td>{result.emaSlow}</td>
                      <td>{Number(result.rsiThreshold).toFixed(0)}</td>
                      <td>{Number(result.sharpe || 0).toFixed(2)}</td>
                      <td>{Number(result.returnPct || 0).toFixed(2)}%</td>
                      <td>{Number(result.maxDrawdown || 0).toFixed(2)}%</td>
                      <td>{Number(result.winRate || 0).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="alerts-empty">
            Run a sweep to rank the top 20 EMA/RSI combinations.
          </p>
        )}
      </section>
  );
}
