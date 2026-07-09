import { DEFAULT_PARAMETER_SWEEP } from "../constants";
import { getDeploymentScore } from "../utils/deploymentScore";
import { getRunDrawdownData, getRunEquityData, getRollingReturnData } from "../utils/equityCharts";
import { getPersistedBacktestTrades, getRunResult, getStrategyRunMetrics } from "../utils/strategyMetrics";
import { getTradeAnalytics } from "../utils/tradeAnalytics";
import BacktestCompare from "./BacktestCompare";
import MonteCarloPanel from "./MonteCarloPanel";
import ParameterSweep from "./ParameterSweep";
import RegimeHeatmap from "./RegimeHeatmap";
import ResearchInsights from "./ResearchInsights";
import StrategyBuilder from "./StrategyBuilder";
import StrategyConditioningPanel from "./StrategyConditioningPanel";
import StrategyDeploymentAllocation from "./StrategyDeploymentAllocation";
import StrategyEvolutionTimeline from "./StrategyEvolutionTimeline";
import StrategyLibrary from "./StrategyLibrary";
import StrategyLeaderboard from "./StrategyLeaderboard";
import StrategyLifecycleDashboard from "./StrategyLifecycleDashboard";
import StrategyPortfolioSimulation from "./StrategyPortfolioSimulation";
import WalkForwardPanel from "./WalkForwardPanel";

export default function StrategyLabWorkspace({
  activeSetData,
  activeStrategyExperimentId,
  error,
  experiments,
  form,
  isEditing,
  onCancelEdit,
  onDelete,
  onDuplicate,
  onEdit,
  onFormChange,
  onSaveDeploymentAllocation,
  onAssignToActiveSet,
  onRemoveFromActiveSet,
  onRun,
  onRunRegimeAnalysis,
  onRunPortfolioSimulation,
  onRunMatrixReplay,
  onRunRobustness,
  onRunStressTest,
  onRunSweep,
  onRunWalkForward,
  onSetActiveStrategy,
  onSubmit,
  runPeriod,
  runningRegimeExperimentId,
  runningSweepExperimentId,
  runningRobustnessExperimentId,
  runningStressExperimentId,
  runningWalkForwardExperimentId,
  runningPortfolioSimulation,
  runningMatrixReplay,
  runningExperimentId,
  routingActionLoading,
  runSymbol,
  runTopN,
  runUniverseId,
  runUniverseMode,
  selectedExperimentId,
  selectedRunId,
  stockUniverses = [],
  strategyLeaderboard,
  strategyLifecycleDashboard,
  strategyMemory,
  strategyDeploymentAllocation,
  strategyPortfolioResult,
  strategyMatrixReplayResult,
  strategyPreview,
  sweepProgress = { percent: 0, label: "Idle" },
  sweepConfig = DEFAULT_PARAMETER_SWEEP,
  setSweepConfig,
  regimeAnalysisResult,
  savingStrategyDeploymentAllocation,
  stressResult,
  walkForwardResult,
  setRunPeriod,
  setRunSymbol,
  setRunTopN,
  setRunUniverseId,
  setRunUniverseMode,
  setSelectedExperimentId,
  setSelectedRunId,
  ui,
}) {
  const {
    strategyLabSection,
    setStrategyLabSection,
    backtestCompareMode,
    setBacktestCompareMode,
    compareStrategyBId,
    setCompareStrategyBId,
    backtestStartDate,
    setBacktestStartDate,
    backtestEndDate,
    setBacktestEndDate,
    backtestBenchmark,
    setBacktestBenchmark,
    customBenchmark,
    setCustomBenchmark,
  } = ui;
  const strategyLabSections = [
    "Library",
    "Builder",
    "Backtest & Compare",
    "Optimize",
    "Insights",
    "Deployment & Allocation",
  ];
  const selectedExperiment =
    experiments.find((experiment) => experiment.id === selectedExperimentId) ||
    experiments[0];
  const activeStrategyExperiment = experiments.find(
    (experiment) => experiment.id === activeStrategyExperimentId
  );
  const selectedRuns = selectedExperiment?.runs || [];
  const selectedRun =
    selectedRuns.find((run) => run.id === selectedRunId) || selectedRuns[0];
  const compareStrategyB =
    experiments.find((experiment) => experiment.id === compareStrategyBId) ||
    experiments.find((experiment) => experiment.id !== selectedExperiment?.id);
  const compareRun = compareStrategyB?.runs?.[0];
  const selectedMetrics = getStrategyRunMetrics(selectedRun);
  const compareMetrics = getStrategyRunMetrics(compareRun);
  const deployment = getDeploymentScore(selectedMetrics);
  const equityCurve = getRunEquityData(selectedRun);
  const compareEquityCurve = getRunEquityData(compareRun);
  const drawdownCurve = getRunDrawdownData(selectedRun);
  const rollingReturnData = getRollingReturnData(equityCurve);
  const tradeAnalytics = getTradeAnalytics(selectedRun);
  const selectedResult = getRunResult(selectedRun);
  const selectedTrades = getPersistedBacktestTrades(selectedRun);
  const metricLeader = (label, a, b, higherIsBetter = true) => {
    if (a === null || b === null) {
      return { label, leader: "-", a, b };
    }

    const aWins = higherIsBetter ? a >= b : a <= b;
    return { label, leader: aWins ? "Strategy A" : "Strategy B", a, b };
  };
  const metricLeaders = [
    metricLeader("Return", selectedMetrics.strategyReturn, compareMetrics.strategyReturn),
    metricLeader("Sharpe", selectedMetrics.sharpe, compareMetrics.sharpe),
    metricLeader("Drawdown", selectedMetrics.maxDrawdown, compareMetrics.maxDrawdown, false),
    metricLeader("Win Rate", selectedMetrics.winRate, compareMetrics.winRate),
    metricLeader("Expectancy", selectedMetrics.expectancy, compareMetrics.expectancy),
  ];
  const winnerSummary = (() => {
    if (backtestCompareMode !== "COMPARE" || !selectedRun || !compareRun) {
      return null;
    }

    const aWins = metricLeaders.filter((item) => item.leader === "Strategy A").length;
    const bWins = metricLeaders.filter((item) => item.leader === "Strategy B").length;

    return aWins === bWins
      ? "No clear winner. Metrics are split."
      : `${aWins > bWins ? selectedExperiment?.name : compareStrategyB?.name} leads ${Math.max(aWins, bWins)} of ${metricLeaders.length} core metrics.`;
  })();
  const latestSweep = selectedExperiment?.parameterSweeps?.[0];
  const sweepResults = latestSweep?.results || [];
  const updateSweepConfig = (field, value) =>
    setSweepConfig({
      ...sweepConfig,
      [field]: value,
    });
  const handleRunBacktestCompare = async () => {
    if (!selectedExperiment) {
      return;
    }

    const overrides = {
      startDate: backtestStartDate,
      endDate: backtestEndDate,
      benchmark: backtestBenchmark === "CUSTOM" ? customBenchmark : backtestBenchmark,
    };

    await onRun(selectedExperiment.id, overrides);

    if (backtestCompareMode === "COMPARE" && compareStrategyB?.id) {
      await onRun(compareStrategyB.id, {
        ...overrides,
        selectRun: false,
      });
    }
  };

  return (
    <section className="strategy-lab-panel">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Strategy Lab</p>
          <h2>Unified Strategy Workspace</h2>
        </div>
        <span>{experiments.length} experiments</span>
      </div>

      {error && <p className="engine-error">{error}</p>}

      <div className="strategy-lab-section-nav">
        {strategyLabSections.map((section) => (
          <button
            className={strategyLabSection === section ? "active" : ""}
            key={section}
            onClick={() => setStrategyLabSection(section)}
            type="button"
          >
            {section}
          </button>
        ))}
      </div>

      {strategyLabSection === "Library" && (
        <StrategyLibrary
          activeSetData={activeSetData}
          activeStrategyExperiment={activeStrategyExperiment}
          activeStrategyExperimentId={activeStrategyExperimentId}
          experiments={experiments}
          onAssignToActiveSet={onAssignToActiveSet}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onEdit={onEdit}
          onRemoveFromActiveSet={onRemoveFromActiveSet}
          onSetActiveStrategy={onSetActiveStrategy}
          routingActionLoading={routingActionLoading}
          selectedExperiment={selectedExperiment}
          setSelectedExperimentId={setSelectedExperimentId}
          setSelectedRunId={setSelectedRunId}
          strategyLifecycleDashboard={strategyLifecycleDashboard}
        />
      )}

      {strategyLabSection === "Builder" && (
        <StrategyBuilder
          form={form}
          isEditing={isEditing}
          onCancelEdit={onCancelEdit}
          onFormChange={onFormChange}
          onRunRobustness={onRunRobustness}
          onSubmit={onSubmit}
          preview={strategyPreview}
          runningRobustness={runningRobustnessExperimentId === selectedExperiment?.id}
          selectedExperiment={selectedExperiment}
          stockUniverses={stockUniverses}
        />
      )}

      {strategyLabSection === "Backtest & Compare" && (
        <BacktestCompare
          backtestBenchmark={backtestBenchmark}
          backtestCompareMode={backtestCompareMode}
          backtestEndDate={backtestEndDate}
          backtestStartDate={backtestStartDate}
          compareEquityCurve={compareEquityCurve}
          compareMetrics={compareMetrics}
          compareStrategyB={compareStrategyB}
          customBenchmark={customBenchmark}
          deployment={deployment}
          drawdownCurve={drawdownCurve}
          equityCurve={equityCurve}
          experiments={experiments}
          handleRunBacktestCompare={handleRunBacktestCompare}
          metricLeaders={metricLeaders}
          rollingReturnData={rollingReturnData}
          runPeriod={runPeriod}
          runningExperimentId={runningExperimentId}
          runSymbol={runSymbol}
          runTopN={runTopN}
          runUniverseId={runUniverseId}
          runUniverseMode={runUniverseMode}
          selectedExperiment={selectedExperiment}
          selectedMetrics={selectedMetrics}
          selectedResult={selectedResult}
          selectedRun={selectedRun}
          selectedRuns={selectedRuns}
          selectedTrades={selectedTrades}
          setBacktestBenchmark={setBacktestBenchmark}
          setBacktestCompareMode={setBacktestCompareMode}
          setBacktestEndDate={setBacktestEndDate}
          setBacktestStartDate={setBacktestStartDate}
          setCompareStrategyBId={setCompareStrategyBId}
          setCustomBenchmark={setCustomBenchmark}
          setRunPeriod={setRunPeriod}
          setRunSymbol={setRunSymbol}
          setRunTopN={setRunTopN}
          setRunUniverseId={setRunUniverseId}
          setRunUniverseMode={setRunUniverseMode}
          setSelectedExperimentId={setSelectedExperimentId}
          setSelectedRunId={setSelectedRunId}
          stockUniverses={stockUniverses}
          tradeAnalytics={tradeAnalytics}
          winnerSummary={winnerSummary}
        />
      )}

      {strategyLabSection === "Optimize" && (
        <ParameterSweep
          error={error}
          experiments={experiments}
          latestSweep={latestSweep}
          onRunSweep={onRunSweep}
          runningSweepExperimentId={runningSweepExperimentId}
          selectedExperiment={selectedExperiment}
          setSelectedExperimentId={setSelectedExperimentId}
          stockUniverses={stockUniverses}
          sweepConfig={sweepConfig}
          sweepProgress={sweepProgress}
          sweepResults={sweepResults}
          updateSweepConfig={updateSweepConfig}
        />
      )}

      {strategyLabSection === "Insights" && (
        <div className="strategy-evidence-grid">
          <ResearchInsights
            experiments={experiments}
            latestSweep={latestSweep}
            selectedRun={selectedRun}
          />
          <StrategyConditioningPanel
            lifecycle={strategyLifecycleDashboard}
            selectedExperiment={selectedExperiment}
            selectedRun={selectedRun}
          />
          <StrategyLifecycleDashboard lifecycle={strategyLifecycleDashboard} />
          <StrategyLeaderboard leaderboard={strategyLeaderboard} />
          <WalkForwardPanel
            onRun={onRunWalkForward}
            result={walkForwardResult}
            running={runningWalkForwardExperimentId === selectedExperiment?.id}
            selectedExperiment={selectedExperiment}
          />
          <RegimeHeatmap
            onRun={onRunRegimeAnalysis}
            result={regimeAnalysisResult}
            running={runningRegimeExperimentId === selectedExperiment?.id}
            selectedExperiment={selectedExperiment}
          />
          <MonteCarloPanel
            onRun={onRunStressTest}
            result={stressResult}
            running={runningStressExperimentId === selectedExperiment?.id}
            selectedExperiment={selectedExperiment}
          />
          <StrategyPortfolioSimulation
            experiments={experiments}
            onRun={onRunPortfolioSimulation}
            result={strategyPortfolioResult}
            running={runningPortfolioSimulation}
          />
          <StrategyEvolutionTimeline memory={strategyMemory} />
        </div>
      )}

      {strategyLabSection === "Deployment & Allocation" && (
        <StrategyDeploymentAllocation
          dashboard={strategyDeploymentAllocation}
          matrixReplayResult={strategyMatrixReplayResult}
          onSave={onSaveDeploymentAllocation}
          onRunMatrixReplay={onRunMatrixReplay}
          runPeriod={runPeriod}
          runSymbol={runSymbol}
          runTopN={runTopN}
          runUniverseId={runUniverseId}
          runUniverseMode={runUniverseMode}
          saving={savingStrategyDeploymentAllocation}
          setRunPeriod={setRunPeriod}
          setRunSymbol={setRunSymbol}
          setRunTopN={setRunTopN}
          setRunUniverseId={setRunUniverseId}
          setRunUniverseMode={setRunUniverseMode}
          stockUniverses={stockUniverses}
          runningMatrixReplay={runningMatrixReplay}
        />
      )}
    </section>
  );
}
