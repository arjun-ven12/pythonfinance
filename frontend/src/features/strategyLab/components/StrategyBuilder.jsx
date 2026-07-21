import StrategyExperimentForm from "./StrategyExperimentForm";
import StrategyCopilotPanel from "./StrategyCopilotPanel";


export default function StrategyBuilder({
  experiments,
  form,
  isEditing,
  onAskStrategyQuestion,
  onAskStrategyResearchQuestion,
  onApplyGeneratedDraft,
  onApproveAndSaveGeneratedDraft,
  onCancelEdit,
  onCompareStrategiesCopilot,
  onCompareStrategyVersions,
  onExplainStrategy,
  onFormChange,
  onDismissGeneratedDraft,
  onGenerateDraft,
  onGenerateResearchReport,
  onProposeStrategyEdit,
  onReviewStrategy,
  onRunRobustness,
  onSubmit,
  preview,
  runningRobustness,
  selectedExperiment,
  stockUniverses,
  strategyCopilotDraft,
  strategyCopilotCompareTargetId,
  strategyCopilotCompareVersionId,
  strategyCopilotPreferences,
  strategyCopilotPrompt,
  setStrategyCopilotCompareTargetId,
  setStrategyCopilotCompareVersionId,
  setStrategyCopilotPreferences,
  setStrategyCopilotPrompt,
}) {
  return (
      <section className="strategy-lab-grid strategy-builder-layout">
        <StrategyExperimentForm
          form={form}
          isEditing={isEditing}
          onCancel={onCancelEdit}
          onChange={onFormChange}
          onRunRobustness={onRunRobustness}
          onSubmit={onSubmit}
          preview={preview}
          runningRobustness={runningRobustness}
          selectedExperiment={selectedExperiment}
          stockUniverses={stockUniverses}
        />

        <div className="strategy-builder-sidebar">
          <StrategyCopilotPanel
            draft={strategyCopilotDraft}
            experiments={experiments}
            onAskQuestion={() => onAskStrategyQuestion(selectedExperiment?.id)}
            onAskResearchQuestion={() => onAskStrategyResearchQuestion(selectedExperiment?.id)}
            onApplyDraft={onApplyGeneratedDraft}
            onApproveAndSave={onApproveAndSaveGeneratedDraft}
            onCompare={() => onCompareStrategiesCopilot(selectedExperiment?.id, strategyCopilotCompareTargetId)}
            onCompareVersions={() => onCompareStrategyVersions(
              selectedExperiment?.id,
              selectedExperiment?.versions?.[0]?.id,
              strategyCopilotCompareVersionId
            )}
            onDismiss={onDismissGeneratedDraft}
            onExplain={() => onExplainStrategy(selectedExperiment?.id)}
            onGenerate={onGenerateDraft}
            onGenerateResearchReport={() => onGenerateResearchReport(selectedExperiment?.id)}
            onProposeEdit={() => onProposeStrategyEdit(selectedExperiment?.id)}
            onReview={() => onReviewStrategy(selectedExperiment?.id)}
            preferences={strategyCopilotPreferences}
            prompt={strategyCopilotPrompt}
            selectedCompareTargetId={strategyCopilotCompareTargetId}
            selectedCompareVersionId={strategyCopilotCompareVersionId}
            selectedExperiment={selectedExperiment}
            setCompareTargetId={setStrategyCopilotCompareTargetId}
            setCompareVersionId={setStrategyCopilotCompareVersionId}
            setPreferences={setStrategyCopilotPreferences}
            setPrompt={setStrategyCopilotPrompt}
          />

          <article className="strategy-lab-card">
            <div className="alerts-panel-header">
              <div>
                <p className="eyebrow">Builder Notes</p>
                <h2>Research only until promoted</h2>
              </div>
            </div>
            <p>
              Saved strategies keep their template, universe, parameters, weights, and filters.
              Promoting a saved strategy makes it the active scanner strategy, but this page does
              not change paper execution or live broker behavior.
            </p>
            <p>
              The builder now compiles blocks into an executable strategy DSL. Rules are sent to
              Python during research backtests through the strategy interpreter.
            </p>
          </article>
        </div>
      </section>
  );
}
