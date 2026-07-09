import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import BreakdownTable from "./BreakdownTable";
import ChartPanel from "./ChartPanel";
import DeploymentPanel from "./DeploymentPanel";
import MetricCards from "./MetricCards";
import StrategyRunMetrics from "./StrategyRunMetrics";
import StrategyTradeLog from "./StrategyTradeLog";
import { formatLabMetric } from "../utils/strategyMetrics";


export default function BacktestCompare({
  backtestBenchmark,
  backtestCompareMode,
  backtestEndDate,
  backtestStartDate,
  compareEquityCurve,
  compareMetrics,
  compareStrategyB,
  customBenchmark,
  deployment,
  drawdownCurve,
  equityCurve,
  experiments,
  handleRunBacktestCompare,
  metricLeaders,
  rollingReturnData,
  runPeriod,
  runningExperimentId,
  runSymbol,
  runTopN,
  runUniverseId,
  runUniverseMode,
  selectedExperiment,
  selectedMetrics,
  selectedResult,
  selectedRun,
  selectedRuns,
  selectedTrades,
  setBacktestBenchmark,
  setBacktestCompareMode,
  setBacktestEndDate,
  setBacktestStartDate,
  setCompareStrategyBId,
  setCustomBenchmark,
  setRunPeriod,
  setRunSymbol,
  setRunTopN,
  setRunUniverseId,
  setRunUniverseMode,
  setSelectedExperimentId,
  setSelectedRunId,
  stockUniverses,
  tradeAnalytics,
  winnerSummary,
}) {
  return (
      <>
      <section className="strategy-lab-grid">
        <article className="strategy-lab-card">
          <div className="alerts-panel-header">
            <div>
              <p className="eyebrow">Backtest & Compare</p>
              <h2>{selectedExperiment?.name || "Select experiment"}</h2>
            </div>
          </div>
          <div className="strategy-run-controls">
            <label>
              <span>Mode</span>
              <select
                onChange={(event) => setBacktestCompareMode(event.target.value)}
                value={backtestCompareMode}
              >
                <option value="SINGLE">Single Strategy</option>
                <option value="COMPARE">Compare Strategies</option>
              </select>
            </label>
            <label>
              <span>Strategy A</span>
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
            {backtestCompareMode === "COMPARE" && (
              <label>
                <span>Strategy B</span>
                <select
                  onChange={(event) => setCompareStrategyBId(event.target.value)}
                  value={compareStrategyB?.id || ""}
                >
                  <option value="">Select comparison strategy</option>
                  {experiments
                    .filter((experiment) => experiment.id !== selectedExperiment?.id)
                    .map((experiment) => (
                      <option key={experiment.id} value={experiment.id}>{experiment.name}</option>
                    ))}
                </select>
              </label>
            )}
            <label>
              <span>Universe mode</span>
              <select onChange={(event) => setRunUniverseMode(event.target.value)} value={runUniverseMode}>
                <option value="SINGLE">Single / typed symbols</option>
                <option value="UNIVERSE">Saved stock universe</option>
                <option value="SP500_TOP_N">S&P 500 top N</option>
              </select>
            </label>
            {runUniverseMode === "UNIVERSE" && (
              <label>
                <span>Stock universe</span>
                <select onChange={(event) => setRunUniverseId(event.target.value)} value={runUniverseId}>
                  <option value="">Select universe</option>
                  {stockUniverses.map((universe) => (
                    <option key={universe.id} value={universe.id}>
                      {universe.name} ({universe.members?.length || 0})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {runUniverseMode === "SP500_TOP_N" && (
              <label>
                <span>Top N</span>
                <input
                  max="100"
                  min="1"
                  onChange={(event) => setRunTopN(event.target.value)}
                  type="number"
                  value={runTopN}
                />
              </label>
            )}
            <label>
              <span>Symbols</span>
              <input
                disabled={runUniverseMode !== "SINGLE"}
                onChange={(event) => setRunSymbol(event.target.value.toUpperCase())}
                placeholder="AAPL, MSFT, NVDA"
                value={runSymbol}
              />
            </label>
            <label>
              <span>Period</span>
              <select onChange={(event) => setRunPeriod(event.target.value)} value={runPeriod}>
                <option value="6mo">6mo</option>
                <option value="1y">1y</option>
                <option value="2y">2y</option>
                <option value="5y">5y</option>
              </select>
            </label>
            <label>
              <span>Start date</span>
              <input
                onChange={(event) => setBacktestStartDate(event.target.value)}
                type="date"
                value={backtestStartDate}
              />
            </label>
            <label>
              <span>End date</span>
              <input
                onChange={(event) => setBacktestEndDate(event.target.value)}
                type="date"
                value={backtestEndDate}
              />
            </label>
            <label>
              <span>Benchmark</span>
              <select
                onChange={(event) => setBacktestBenchmark(event.target.value)}
                value={backtestBenchmark}
              >
                <option value="SPY">SPY</option>
                <option value="QQQ">QQQ</option>
                <option value="CUSTOM">Custom benchmark</option>
              </select>
            </label>
            {backtestBenchmark === "CUSTOM" && (
              <label>
                <span>Custom benchmark</span>
                <input
                  onChange={(event) => setCustomBenchmark(event.target.value.toUpperCase())}
                  placeholder="IWM"
                  value={customBenchmark}
                />
              </label>
            )}
            <button
              disabled={!selectedExperiment || runningExperimentId === selectedExperiment?.id}
              onClick={handleRunBacktestCompare}
              type="button"
            >
              {runningExperimentId === selectedExperiment?.id ? "Running..." : "Run Backtest"}
            </button>
          </div>

          {selectedRuns.length > 0 ? (
            <div className="strategy-run-list">
              {selectedRuns.map((run) => (
                <button
                  className={selectedRun?.id === run.id ? "selected" : ""}
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  type="button"
                >
                  <strong>{new Date(run.createdAt).toLocaleString()}</strong>
                  <span>Return {Number(run.returnPct || 0).toFixed(2)}%</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="alerts-empty">No runs yet. Run this experiment to create metrics.</p>
          )}

          {selectedRun && (
            <>
              {selectedResult.validation?.warnings?.length > 0 && (
                <div className="strategy-validation-warning">
                  <strong>Backtest validation warnings</strong>
                  <ul>
                    {selectedResult.validation.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <DeploymentPanel deployment={deployment} />
              <MetricCards
                className="strategy-run-metrics strategy-performance-overview"
                metrics={[
                  { label: "Strategy Return", value: formatLabMetric(selectedMetrics.strategyReturn, "%") },
                  { label: "Buy & Hold Return", value: formatLabMetric(selectedMetrics.buyHoldReturn, "%") },
                  { label: "Alpha vs Buy & Hold", value: formatLabMetric(selectedMetrics.alphaBuyHold, "%") },
                  { label: "CAGR", value: formatLabMetric(selectedMetrics.cagr, "%") },
                  { label: "Sharpe", value: formatLabMetric(selectedMetrics.sharpe) },
                  { label: "Sortino", value: formatLabMetric(selectedMetrics.sortino) },
                  { label: "Max Drawdown", value: formatLabMetric(selectedMetrics.maxDrawdown, "%") },
                  { label: "Win Rate", value: formatLabMetric(selectedMetrics.winRate, "%") },
                  { label: "Expectancy", value: formatLabMetric(selectedMetrics.expectancy) },
                  { label: "Trade Count", value: selectedMetrics.tradeCount ?? "-" },
                ]}
              />
              <StrategyRunMetrics rows={selectedRun.settingsJson?.symbol_results || []} />
            </>
          )}
        </article>

        <ChartPanel
          hasData={equityCurve.length > 0}
          subtitle="Strategy, buy-and-hold, and benchmark overlays"
          title="Equity Curve"
        >
          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityCurve}>
                <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#9aa9b8" />
                <YAxis stroke="#9aa9b8" width={54} />
                <Tooltip
                  contentStyle={{
                    background: "#111720",
                    border: "1px solid #263242",
                    borderRadius: 8,
                    color: "#eef2f6",
                  }}
                />
                <Line dataKey="strategy" dot={false} stroke="#4cc38a" strokeWidth={2} type="monotone" />
                <Line dataKey="buyHold" dot={false} stroke="#58a6ff" strokeWidth={2} type="monotone" />
                <Line dataKey="benchmark" dot={false} stroke="#f4b740" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
      </section>

      {selectedRun && (
        <>
          <section className="strategy-lab-card">
            <div className="alerts-panel-header">
              <div>
                <p className="eyebrow">Benchmark Comparison</p>
                <h2>{backtestBenchmark === "CUSTOM" ? customBenchmark || "Custom" : backtestBenchmark}</h2>
              </div>
            </div>
            <dl className="detail-stats strategy-benchmark-grid">
              <div><dt>Strategy Return</dt><dd>{formatLabMetric(selectedMetrics.strategyReturn, "%")}</dd></div>
              <div><dt>Buy & Hold Return</dt><dd>{formatLabMetric(selectedMetrics.buyHoldReturn, "%")}</dd></div>
              <div>
                <dt>Benchmark Return</dt>
                <dd>
                  {selectedMetrics.benchmarkUnavailable
                    ? "Benchmark unavailable"
                    : formatLabMetric(selectedMetrics.benchmarkReturn, "%")}
                </dd>
              </div>
              <div><dt>Alpha vs Buy & Hold</dt><dd>{formatLabMetric(selectedMetrics.alphaBuyHold, "%")}</dd></div>
              <div><dt>Alpha vs Benchmark</dt><dd>{formatLabMetric(selectedMetrics.alphaBenchmark, "%")}</dd></div>
              <div><dt>Strategy Drawdown</dt><dd>{formatLabMetric(selectedMetrics.maxDrawdown, "%")}</dd></div>
              <div><dt>Buy & Hold Drawdown</dt><dd>{formatLabMetric(selectedMetrics.buyHoldDrawdown, "%")}</dd></div>
              <div><dt>Benchmark Drawdown</dt><dd>{formatLabMetric(selectedMetrics.benchmarkDrawdown, "%")}</dd></div>
              <div><dt>Strategy Sharpe</dt><dd>{formatLabMetric(selectedMetrics.sharpe)}</dd></div>
              <div><dt>Buy & Hold Sharpe</dt><dd>{formatLabMetric(selectedMetrics.buyHoldSharpe)}</dd></div>
              <div><dt>Benchmark Sharpe</dt><dd>{formatLabMetric(selectedMetrics.benchmarkSharpe)}</dd></div>
            </dl>
          </section>

          <section className="charts-grid">
            <ChartPanel hasData={drawdownCurve.length > 0} subtitle="Lower is better" title="Drawdown Curve">
              <div className="chart-canvas">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={drawdownCurve}>
                    <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#9aa9b8" />
                    <YAxis stroke="#9aa9b8" width={54} />
                    <Tooltip contentStyle={{ background: "#111720", border: "1px solid #263242", borderRadius: 8, color: "#eef2f6" }} />
                    <Line dataKey="strategy" dot={false} stroke="#ff6b6b" strokeWidth={2} type="monotone" />
                    <Line dataKey="buyHold" dot={false} stroke="#58a6ff" strokeWidth={2} type="monotone" />
                    <Line dataKey="benchmark" dot={false} stroke="#f4b740" strokeWidth={2} type="monotone" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartPanel>
            <ChartPanel hasData={rollingReturnData.length > 0} subtitle="Period-over-period change" title="Rolling Returns">
              <div className="chart-canvas">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rollingReturnData}>
                    <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#9aa9b8" />
                    <YAxis stroke="#9aa9b8" width={54} />
                    <Tooltip contentStyle={{ background: "#111720", border: "1px solid #263242", borderRadius: 8, color: "#eef2f6" }} />
                    <Line dataKey="strategy" dot={false} stroke="#4cc38a" strokeWidth={2} type="monotone" />
                    <Line dataKey="buyHold" dot={false} stroke="#58a6ff" strokeWidth={2} type="monotone" />
                    <Line dataKey="benchmark" dot={false} stroke="#f4b740" strokeWidth={2} type="monotone" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartPanel>
          </section>

          <section className="strategy-lab-grid">
            <BreakdownTable rows={selectedResult.regime_breakdown || []} title="Regime Breakdown" />
            <BreakdownTable rows={selectedResult.sector_breakdown || []} title="Sector Breakdown" />
          </section>
          <section className="strategy-lab-grid">
            <BreakdownTable rows={selectedResult.confidence_breakdown || []} title="Confidence Breakdown" />
            <article className="strategy-lab-card">
              <div className="alerts-panel-header">
                <div>
                  <p className="eyebrow">Trade Analytics</p>
                  <h2>{tradeAnalytics.numberOfTrades ?? 0} trades</h2>
                </div>
              </div>
              <dl className="detail-stats strategy-trade-analytics">
                <div><dt>Win Rate</dt><dd>{formatLabMetric(tradeAnalytics.winRate, "%")}</dd></div>
                <div><dt>Profit Factor</dt><dd>{formatLabMetric(tradeAnalytics.profitFactor)}</dd></div>
                <div><dt>Average Winner</dt><dd>{formatLabMetric(tradeAnalytics.averageWinner, "%")}</dd></div>
                <div><dt>Average Loser</dt><dd>{formatLabMetric(tradeAnalytics.averageLoser, "%")}</dd></div>
                <div><dt>Largest Winner</dt><dd>{formatLabMetric(tradeAnalytics.largestWinner, "%")}</dd></div>
                <div><dt>Largest Loser</dt><dd>{formatLabMetric(tradeAnalytics.largestLoser, "%")}</dd></div>
                <div><dt>Average Hold</dt><dd>{tradeAnalytics.averageHoldDuration}</dd></div>
                <div><dt>Stop Loss Exits</dt><dd>{tradeAnalytics.stopLossExits}</dd></div>
                <div><dt>Trailing Stop Exits</dt><dd>{tradeAnalytics.trailingStopExits}</dd></div>
                <div><dt>Take Profit Exits</dt><dd>{tradeAnalytics.takeProfitExits}</dd></div>
              </dl>
            </article>
          </section>

          <section className="strategy-lab-card">
            <div className="alerts-panel-header">
              <div>
                <p className="eyebrow">Trade Log</p>
                <h2>{selectedTrades.length} events</h2>
              </div>
            </div>
            <StrategyTradeLog trades={selectedTrades} />
            {selectedMetrics.tradeCount > 0 && selectedTrades.length === 0 && (
              <p className="engine-error">
                Backtest validation failed: trade count exists but trade log is empty.
              </p>
            )}
          </section>
        </>
      )}

      {backtestCompareMode === "COMPARE" && (
      <section className="strategy-lab-card">
        <div className="alerts-panel-header">
          <div>
            <p className="eyebrow">Compare Strategies Mode</p>
            <h2>{winnerSummary || "Run both strategies to compare"}</h2>
          </div>
        </div>
        <div className="strategy-compare-dashboard">
          <dl className="detail-stats">
            <div><dt>Strategy A</dt><dd>{selectedExperiment?.name || "-"}</dd></div>
            <div><dt>Return</dt><dd>{formatLabMetric(selectedMetrics.strategyReturn, "%")}</dd></div>
            <div><dt>Sharpe</dt><dd>{formatLabMetric(selectedMetrics.sharpe)}</dd></div>
            <div><dt>Drawdown</dt><dd>{formatLabMetric(selectedMetrics.maxDrawdown, "%")}</dd></div>
          </dl>
          <dl className="detail-stats">
            <div><dt>Strategy B</dt><dd>{compareStrategyB?.name || "-"}</dd></div>
            <div><dt>Return</dt><dd>{formatLabMetric(compareMetrics.strategyReturn, "%")}</dd></div>
            <div><dt>Sharpe</dt><dd>{formatLabMetric(compareMetrics.sharpe)}</dd></div>
            <div><dt>Drawdown</dt><dd>{formatLabMetric(compareMetrics.maxDrawdown, "%")}</dd></div>
          </dl>
        </div>
        <ChartPanel hasData={equityCurve.length > 0 || compareEquityCurve.length > 0} subtitle="Side-by-side equity" title="Strategy A vs Strategy B">
          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityCurve.map((point, index) => ({
                label: point.label,
                strategyA: point.strategy,
                strategyB: compareEquityCurve[index]?.strategy ?? null,
              }))}>
                <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#9aa9b8" />
                <YAxis stroke="#9aa9b8" width={54} />
                <Tooltip contentStyle={{ background: "#111720", border: "1px solid #263242", borderRadius: 8, color: "#eef2f6" }} />
                <Line dataKey="strategyA" dot={false} stroke="#4cc38a" strokeWidth={2} type="monotone" />
                <Line dataKey="strategyB" dot={false} stroke="#f4b740" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
        <div className="strategy-sweep-table">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Strategy A</th>
                <th>Strategy B</th>
                <th>Leader</th>
              </tr>
            </thead>
            <tbody>
              {metricLeaders.map((item) => (
                <tr key={item.label}>
                  <td>{item.label}</td>
                  <td>{formatLabMetric(item.a, item.label === "Return" || item.label === "Drawdown" || item.label === "Win Rate" ? "%" : "")}</td>
                  <td>{formatLabMetric(item.b, item.label === "Return" || item.label === "Drawdown" || item.label === "Win Rate" ? "%" : "")}</td>
                  <td>{item.leader}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
      </>
  );
}
