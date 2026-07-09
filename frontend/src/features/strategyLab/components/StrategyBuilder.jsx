import StrategyExperimentForm from "./StrategyExperimentForm";


export default function StrategyBuilder({
  form,
  isEditing,
  onCancelEdit,
  onFormChange,
  onRunRobustness,
  onSubmit,
  preview,
  runningRobustness,
  selectedExperiment,
  stockUniverses,
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
      </section>
  );
}
