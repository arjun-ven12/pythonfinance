import { useCallback, useEffect } from "react";
import {
  DEFAULT_PARAMETER_SWEEP,
  DEFAULT_STRATEGY_EXPERIMENT,
} from "./constants";
import StrategyLabWorkspace from "./components/StrategyLabWorkspace";
import useStrategyLab from "./hooks/useStrategyLab";
import useStrategyLabUi from "./hooks/useStrategyLabUi";
import "./strategyLab.css";

export default function StrategyLabFeaturePage({
  activeStrategyStorageKey,
  getUserStorageKey,
  onActiveStrategyChange,
  stockUniversesData,
}) {
  const strategyLab = useStrategyLab({
    activeStrategyStorageKey,
    defaultParameterSweep: DEFAULT_PARAMETER_SWEEP,
    defaultStrategyExperiment: DEFAULT_STRATEGY_EXPERIMENT,
    getUserStorageKey,
  });
  const ui = useStrategyLabUi();

  const {
    activeStrategyExperimentId,
    activeSetData,
    editingStrategyExperimentId,
    fetchActiveStrategy,
    fetchStrategyActiveSet,
    fetchStrategyDeploymentAllocation,
    fetchStrategyLeaderboard,
    fetchStrategyLifecycleDashboard,
    fetchStrategyMemory,
    handleAskStrategyQuestion,
    handleAskStrategyResearchQuestion,
    handleApplyGeneratedStrategyDraft,
    handleApproveAndSaveGeneratedStrategyDraft,
    handleCompareStrategiesCopilot,
    handleCompareStrategyVersions,
    fetchStrategyExperiments,
    handleAssignStrategyActiveSet,
    handleDeleteStrategyExperiment,
    handleDuplicateStrategyExperiment,
    handleEditStrategyExperiment,
    handleExplainStrategy,
    handleGenerateStrategyDraft,
    handleGenerateStrategyResearchReport,
    handleProposeStrategyEdit,
    handleRemoveStrategyActiveSet,
    handleRunParameterSweep,
    handleRunPortfolioSimulation,
    handleRunMatrixReplay,
    handleRunRegimeAnalysis,
    handleRunRobustness,
    handleSaveStrategyDeploymentAllocation,
    handleRunStressTest,
    handleRunStrategyExperiment,
    handleRunWalkForward,
    handleReviewStrategy,
    handleSetActiveStrategyExperiment,
    handleSubmitStrategyExperiment,
    parameterSweepConfig,
    resetStrategyExperimentForm,
    resetStrategyCopilotDraft,
    routingActionLoading,
    runningStrategyExperimentId,
    runningRegimeExperimentId,
    runningRobustnessExperimentId,
    runningStressExperimentId,
    runningSweepExperimentId,
    runningWalkForwardExperimentId,
    runningPortfolioSimulation,
    runningMatrixReplay,
    selectedStrategyExperimentId,
    selectedStrategyRunId,
    setParameterSweepConfig,
    setSelectedStrategyExperimentId,
    setSelectedStrategyRunId,
    setStrategyCopilotPrompt,
    setStrategyCopilotPreferences,
    setStrategyCopilotCompareTargetId,
    setStrategyCopilotCompareVersionId,
    setStrategyExperimentForm,
    setStrategyRunPeriod,
    setStrategyRunSymbol,
    setStrategyRunTopN,
    setStrategyRunUniverseId,
    setStrategyRunUniverseMode,
    strategyExperimentForm,
    strategyDeploymentAllocation,
    strategyExperimentsData,
    strategyLabError,
    strategyLeaderboard,
    strategyLifecycleDashboard,
    strategyMemory,
    strategyPortfolioResult,
    strategyMatrixReplayResult,
    strategyPreview,
    strategyRunPeriod,
    strategyRunSymbol,
    strategyRunTopN,
    strategyRunUniverseId,
    strategyRunUniverseMode,
    strategySweepProgress,
    regimeAnalysisResult,
    savingStrategyDeploymentAllocation,
    stressResult,
    strategyCopilotDraft,
    strategyCopilotCompareTargetId,
    strategyCopilotCompareVersionId,
    strategyCopilotPreferences,
    strategyCopilotPrompt,
    walkForwardResult,
  } = strategyLab;

  useEffect(() => {
    fetchStrategyExperiments();
    fetchStrategyLeaderboard();
    fetchStrategyLifecycleDashboard();
    fetchStrategyDeploymentAllocation();
    fetchStrategyActiveSet();
    fetchActiveStrategy().then((nextActiveStrategy) => {
      if (nextActiveStrategy) {
        onActiveStrategyChange?.(nextActiveStrategy);
      }
    });
  }, [
    fetchActiveStrategy,
    fetchStrategyActiveSet,
    fetchStrategyExperiments,
    fetchStrategyDeploymentAllocation,
    fetchStrategyLeaderboard,
    fetchStrategyLifecycleDashboard,
    onActiveStrategyChange,
  ]);

  useEffect(() => {
    if (selectedStrategyExperimentId) {
      fetchStrategyMemory(selectedStrategyExperimentId);
    }
  }, [fetchStrategyMemory, selectedStrategyExperimentId]);

  const handleSetActiveStrategy = useCallback(
    async (experimentId) => {
      const nextActiveStrategy = await handleSetActiveStrategyExperiment(experimentId);
      if (nextActiveStrategy) {
        fetchStrategyLifecycleDashboard();
        onActiveStrategyChange?.(nextActiveStrategy);
      }
    },
    [fetchStrategyLifecycleDashboard, handleSetActiveStrategyExperiment, onActiveStrategyChange]
  );

  const handleEditFromLibrary = useCallback(
    (experiment) => {
      handleEditStrategyExperiment(experiment);
      ui.setStrategyLabSection("Builder");
    },
    [handleEditStrategyExperiment, ui]
  );

  const handleDuplicateFromLibrary = useCallback(
    (experiment) => {
      handleDuplicateStrategyExperiment(experiment);
      ui.setStrategyLabSection("Builder");
    },
    [handleDuplicateStrategyExperiment, ui]
  );

  return (
    <StrategyLabWorkspace
      activeStrategyExperimentId={activeStrategyExperimentId}
      error={strategyLabError}
      experiments={strategyExperimentsData.experiments || []}
      form={strategyExperimentForm}
      isEditing={Boolean(editingStrategyExperimentId)}
      onCancelEdit={resetStrategyExperimentForm}
      onDelete={handleDeleteStrategyExperiment}
      onDuplicate={handleDuplicateFromLibrary}
      onEdit={handleEditFromLibrary}
      onApplyGeneratedDraft={handleApplyGeneratedStrategyDraft}
      onApproveAndSaveGeneratedDraft={handleApproveAndSaveGeneratedStrategyDraft}
      onAskStrategyQuestion={handleAskStrategyQuestion}
      onAskStrategyResearchQuestion={handleAskStrategyResearchQuestion}
      onCompareStrategiesCopilot={handleCompareStrategiesCopilot}
      onCompareStrategyVersions={handleCompareStrategyVersions}
      onExplainStrategy={handleExplainStrategy}
      onFormChange={setStrategyExperimentForm}
      onGenerateDraft={handleGenerateStrategyDraft}
      onGenerateResearchReport={handleGenerateStrategyResearchReport}
      onProposeStrategyEdit={handleProposeStrategyEdit}
      onReviewStrategy={handleReviewStrategy}
      onRun={handleRunStrategyExperiment}
      onRunRegimeAnalysis={handleRunRegimeAnalysis}
      onRunPortfolioSimulation={handleRunPortfolioSimulation}
      onRunMatrixReplay={handleRunMatrixReplay}
      onRunRobustness={handleRunRobustness}
      onRunStressTest={handleRunStressTest}
      onRunSweep={handleRunParameterSweep}
      onRunWalkForward={handleRunWalkForward}
      onSaveDeploymentAllocation={handleSaveStrategyDeploymentAllocation}
      onAssignToActiveSet={handleAssignStrategyActiveSet}
      onRemoveFromActiveSet={handleRemoveStrategyActiveSet}
      onSetActiveStrategy={handleSetActiveStrategy}
      onSubmit={handleSubmitStrategyExperiment}
      onDismissGeneratedDraft={resetStrategyCopilotDraft}
      activeSetData={activeSetData}
      runPeriod={strategyRunPeriod}
      routingActionLoading={routingActionLoading}
      runningExperimentId={runningStrategyExperimentId}
      runningRegimeExperimentId={runningRegimeExperimentId}
      runningRobustnessExperimentId={runningRobustnessExperimentId}
      runningStressExperimentId={runningStressExperimentId}
      runningSweepExperimentId={runningSweepExperimentId}
      runningWalkForwardExperimentId={runningWalkForwardExperimentId}
      runningPortfolioSimulation={runningPortfolioSimulation}
      runningMatrixReplay={runningMatrixReplay}
      runSymbol={strategyRunSymbol}
      runTopN={strategyRunTopN}
      runUniverseId={strategyRunUniverseId}
      runUniverseMode={strategyRunUniverseMode}
      selectedExperimentId={selectedStrategyExperimentId}
      selectedRunId={selectedStrategyRunId}
      setRunPeriod={setStrategyRunPeriod}
      setRunSymbol={setStrategyRunSymbol}
      setRunTopN={setStrategyRunTopN}
      setRunUniverseId={setStrategyRunUniverseId}
      setRunUniverseMode={setStrategyRunUniverseMode}
      setSelectedExperimentId={setSelectedStrategyExperimentId}
      setSelectedRunId={setSelectedStrategyRunId}
      setSweepConfig={setParameterSweepConfig}
      stockUniverses={stockUniversesData.universes || []}
      strategyLeaderboard={strategyLeaderboard}
      strategyLifecycleDashboard={strategyLifecycleDashboard}
      strategyMemory={strategyMemory}
      strategyDeploymentAllocation={strategyDeploymentAllocation}
      strategyPortfolioResult={strategyPortfolioResult}
      strategyMatrixReplayResult={strategyMatrixReplayResult}
      strategyCopilotDraft={strategyCopilotDraft}
      strategyCopilotCompareTargetId={strategyCopilotCompareTargetId}
      strategyCopilotCompareVersionId={strategyCopilotCompareVersionId}
      strategyCopilotPreferences={strategyCopilotPreferences}
      strategyCopilotPrompt={strategyCopilotPrompt}
      strategyPreview={strategyPreview}
      sweepConfig={parameterSweepConfig}
      sweepProgress={strategySweepProgress}
      regimeAnalysisResult={regimeAnalysisResult}
      savingStrategyDeploymentAllocation={savingStrategyDeploymentAllocation}
      stressResult={stressResult}
      setStrategyCopilotPrompt={setStrategyCopilotPrompt}
      setStrategyCopilotPreferences={setStrategyCopilotPreferences}
      setStrategyCopilotCompareTargetId={setStrategyCopilotCompareTargetId}
      setStrategyCopilotCompareVersionId={setStrategyCopilotCompareVersionId}
      walkForwardResult={walkForwardResult}
      ui={ui}
    />
  );
}
