import { useState } from "react";
import HistoricalContextUsed from "../../../components/common/HistoricalContextUsed";
import { formatNumber, formatNumericValue } from "../../../utils/numberFormat";
import {
  STRATEGY_COPILOT_HOLDING_PERIOD_OPTIONS,
  STRATEGY_COPILOT_MARKET_OPTIONS,
  STRATEGY_COPILOT_OBJECTIVE_OPTIONS,
  STRATEGY_COPILOT_RISK_LEVEL_OPTIONS,
  STRATEGY_COPILOT_SECTOR_OPTIONS,
  STRATEGY_COPILOT_TRADING_STYLE_OPTIONS,
  createStrategyCopilotPreferences,
} from "../strategyCopilotPreferences";

const COPILOT_MODES = [
  { key: "draft", label: "Generate Draft" },
  { key: "edit", label: "Modify Strategy" },
  { key: "research", label: "Research Report" },
  { key: "research-question", label: "Research Q&A" },
  { key: "version-compare", label: "Version Compare" },
  { key: "explain", label: "Explain" },
  { key: "review", label: "Review" },
  { key: "question", label: "Q&A" },
  { key: "compare", label: "Compare" },
];

function renderList(items = [], emptyCopy) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="strategy-copilot-empty">{emptyCopy}</p>;
  }

  return (
    <ul className="strategy-copilot-list">
      {items.map((item) => (
        <li key={typeof item === "string" ? item : JSON.stringify(item)}>
          {typeof item === "string" ? item : formatJson(item)}
        </li>
      ))}
    </ul>
  );
}

function renderKeyValueChanges(items = [], emptyCopy) {
  if (!items.length) {
    return <p className="strategy-copilot-empty">{emptyCopy}</p>;
  }

  return (
    <ul className="strategy-copilot-list">
      {items.map((item) => (
        <li key={`${item.field}-${item.before}-${item.after}`}>
          {item.label}: {formatNumericValue(item.before)} -&gt; {formatNumericValue(item.after)}
        </li>
      ))}
    </ul>
  );
}

function formatJson(value) {
  return JSON.stringify(
    value,
    (_key, item) =>
      typeof item === "number" ? Math.round((item + Number.EPSILON) * 100) / 100 : item,
    2
  );
}

function renderEvidenceCards(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="strategy-copilot-empty">Insufficient evidence available.</p>;
  }

  return (
    <div className="strategy-copilot-evidence-grid">
      {items.map((item) => (
        <article className="strategy-copilot-evidence-card" key={`${item.sourceType}-${item.sourceId}-${item.metricName}`}>
          <span>{item.sourceType}</span>
          <strong>{item.metricName}</strong>
          <p>{formatNumericValue(item.metricValue)}</p>
          <small>{item.interpretation}</small>
          <em>{item.strength}</em>
        </article>
      ))}
    </div>
  );
}

function AdvisorySections({ advisory }) {
  if (!advisory) {
    return null;
  }

  return (
    <>
      <div className="strategy-copilot-metadata">
        <article>
          <span>Confidence</span>
          <strong>{formatNumber(advisory.confidenceScore)}/100</strong>
        </article>
        <article>
          <span>Next Action</span>
          <strong>{advisory.nextAction}</strong>
        </article>
      </div>

      <div className="strategy-copilot-grid">
        <article className="strategy-copilot-section">
          <h3>Summary</h3>
          <p>{advisory.summary}</p>
        </article>
        <article className="strategy-copilot-section">
          <h3>Recommendation</h3>
          <p>{advisory.recommendation}</p>
        </article>
        <article className="strategy-copilot-section">
          <h3>Reasoning</h3>
          {renderList(advisory.reasoning, "No reasoning provided.")}
        </article>
        <article className="strategy-copilot-section">
          <h3>Risks / Limitations</h3>
          {renderList(advisory.limitations, "No limitations listed.")}
        </article>
      </div>

      <section className="strategy-copilot-section">
        <h3>Evidence</h3>
        {renderEvidenceCards(advisory.evidence)}
      </section>
    </>
  );
}

const DRAFT_EXAMPLES = [
  "Build a momentum strategy for large-cap US technology stocks.",
  "Create a low-volatility swing strategy with strong downside protection.",
  "Design a breakout strategy that avoids sideways markets.",
];

function renderSelectOptions(options = []) {
  return options.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ));
}

export default function StrategyCopilotPanel({
  draft,
  experiments = [],
  onAskQuestion,
  onAskResearchQuestion,
  onApplyDraft,
  onApproveAndSave,
  onCompare,
  onCompareVersions,
  onDismiss,
  onExplain,
  onGenerate,
  onGenerateResearchReport,
  onProposeEdit,
  onReview,
  preferences = createStrategyCopilotPreferences(),
  prompt,
  selectedCompareTargetId,
  selectedCompareVersionId,
  selectedExperiment,
  setCompareTargetId,
  setCompareVersionId,
  setPreferences,
  setPrompt,
}) {
  const [mode, setMode] = useState("draft");
  const result = draft?.result || null;
  const activeMode = draft?.loading ? draft.mode || mode : mode;
  const compareCandidates = experiments.filter((experiment) => experiment.id !== selectedExperiment?.id);
  const advisory = result?.advisory || null;
  const advancedEnabled = Boolean(preferences?.advancedMode);
  const advancedSectionId = "strategy-copilot-advanced-settings";

  const handleRun = () => {
    if (mode === "draft") return onGenerate();
    if (mode === "edit") return onProposeEdit();
    if (mode === "research") return onGenerateResearchReport();
    if (mode === "research-question") return onAskResearchQuestion();
    if (mode === "version-compare") return onCompareVersions();
    if (mode === "explain") return onExplain();
    if (mode === "review") return onReview();
    if (mode === "question") return onAskQuestion();
    return onCompare();
  };

  const primaryLabel = (() => {
    if (draft?.loading) return "Working...";
    if (mode === "draft") return "Generate Strategy";
    if (mode === "edit") return "Propose Changes";
    if (mode === "research") return "Generate Research Report";
    if (mode === "research-question") return "Ask Research Copilot";
    if (mode === "version-compare") return "Compare Versions";
    if (mode === "explain") return "Explain Strategy";
    if (mode === "review") return "Review Strategy";
    if (mode === "question") return "Ask Copilot";
    return "Compare Strategies";
  })();

  const promptLabel = (() => {
    if (mode === "edit") return "Describe the change you want";
    if (mode === "research-question") return "Ask a research question about results";
    if (mode === "question") return "Ask a question about this strategy";
    return "Optional notes";
  })();

  const promptPlaceholder = (() => {
    if (mode === "draft") {
      return "Build a swing strategy that buys large-cap technology stocks when RSI crosses above 30 while price is above the 50 EMA...";
    }
    if (mode === "edit") {
      return "Reduce drawdown, add trend confirmation, remove RSI, trade fewer signals...";
    }
    if (mode === "research-question") {
      return "Why is the Sharpe ratio low? What caused the drawdown? Which regimes hurt performance?";
    }
    if (mode === "question") {
      return "Why are there so few trades?";
    }
    return "Add context if helpful.";
  })();

  const updatePreferences = (updater) => {
    if (typeof setPreferences !== "function") {
      return;
    }
    setPreferences((current) => {
      const base = current || createStrategyCopilotPreferences();
      return typeof updater === "function" ? updater(base) : updater;
    });
  };

  const setPreferenceField = (field, value) => {
    updatePreferences((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const setConstraintField = (field, value) => {
    updatePreferences((current) => ({
      ...current,
      constraints: {
        ...(current?.constraints || {}),
        [field]: value,
      },
    }));
  };

  const toggleObjective = (value) => {
    updatePreferences((current) => {
      const objectives = new Set(current?.objectives || []);
      if (objectives.has(value)) {
        objectives.delete(value);
      } else {
        objectives.add(value);
      }
      return {
        ...current,
        objectives: Array.from(objectives),
      };
    });
  };

  const toggleSector = (value) => {
    updatePreferences((current) => {
      const sectors = new Set(current?.sectors || []);
      if (value === "NO_PREFERENCE") {
        return {
          ...current,
          sectors: ["NO_PREFERENCE"],
        };
      }
      sectors.delete("NO_PREFERENCE");
      if (sectors.has(value)) {
        sectors.delete(value);
      } else {
        sectors.add(value);
      }
      return {
        ...current,
        sectors: sectors.size ? Array.from(sectors) : ["NO_PREFERENCE"],
      };
    });
  };

  return (
    <article className="strategy-lab-card strategy-copilot-card">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Strategy Copilot</p>
          <h2>Collaborate on strategy drafts and edits</h2>
        </div>
      </div>

      <div className="strategy-copilot-mode-row">
        {COPILOT_MODES.map((item) => (
          <button
            className={mode === item.key ? "active" : ""}
            key={item.key}
            onClick={() => setMode(item.key)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {selectedExperiment ? (
        <p className="strategy-copilot-context">
          Current strategy: <strong>{selectedExperiment.name}</strong>
        </p>
      ) : null}

      {mode === "compare" ? (
        <label className="strategy-copilot-prompt">
          <span>Compare against</span>
          <select onChange={(event) => setCompareTargetId(event.target.value)} value={selectedCompareTargetId}>
            <option value="">Choose another saved strategy</option>
            {compareCandidates.map((experiment) => (
              <option key={experiment.id} value={experiment.id}>
                {experiment.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {mode === "version-compare" ? (
        <label className="strategy-copilot-prompt">
          <span>Compare latest version against</span>
          <select onChange={(event) => setCompareVersionId(event.target.value)} value={selectedCompareVersionId}>
            <option value="">Choose an earlier saved version</option>
            {(selectedExperiment?.versions || [])
              .filter((version, index) => index > 0)
              .map((version) => (
              <option key={version.id} value={version.id}>
                  Version {version.version} {version.changeNote ? `- ${version.changeNote}` : ""}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      {mode === "draft" ? (
        <section className="strategy-copilot-draft-shell">
          <div className="strategy-copilot-draft-header">
            <div>
              <h3>What would you like to build?</h3>
              <p>Describe your strategy in plain English.</p>
            </div>
            {selectedExperiment ? (
              <p className="strategy-copilot-context">
                Current strategy: <strong>{selectedExperiment.name}</strong>
              </p>
            ) : null}
          </div>

          <label className="strategy-copilot-prompt" htmlFor="strategy-copilot-draft-prompt">
            <span className="sr-only">Strategy description</span>
            <textarea
              id="strategy-copilot-draft-prompt"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={promptPlaceholder}
              rows="6"
              value={prompt}
            />
          </label>

          <div className="strategy-copilot-examples">
            <span>Examples</span>
            <ul>
              {DRAFT_EXAMPLES.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </div>

          <div className="strategy-copilot-actions strategy-copilot-actions-draft">
            <button
              aria-controls={advancedSectionId}
              aria-expanded={advancedEnabled}
              className={`strategy-secondary-action strategy-copilot-advanced-toggle${advancedEnabled ? " active" : ""}`}
              onClick={() => setPreferenceField("advancedMode", !advancedEnabled)}
              type="button"
            >
              Advanced Mode
            </button>
            <button className="strategy-primary-action" disabled={draft?.loading} onClick={handleRun} type="button">
              {primaryLabel}
            </button>
            {result ? (
              <button className="strategy-secondary-action" onClick={onDismiss} type="button">
                Clear
              </button>
            ) : null}
          </div>

          {advancedEnabled ? (
            <section
              aria-label="Advanced strategy generation preferences"
              className="strategy-copilot-advanced-panel"
              id={advancedSectionId}
            >
              <div className="strategy-copilot-advanced-grid">
                <label className="strategy-copilot-prompt" htmlFor="strategy-copilot-trading-style">
                  <span>Trading Style</span>
                  <select
                    id="strategy-copilot-trading-style"
                    onChange={(event) => setPreferenceField("tradingStyle", event.target.value)}
                    value={preferences?.tradingStyle || ""}
                  >
                    {renderSelectOptions(STRATEGY_COPILOT_TRADING_STYLE_OPTIONS)}
                  </select>
                </label>

                <label className="strategy-copilot-prompt" htmlFor="strategy-copilot-market">
                  <span>Market / Universe</span>
                  <select
                    id="strategy-copilot-market"
                    onChange={(event) => setPreferenceField("market", event.target.value)}
                    value={preferences?.market || ""}
                  >
                    {renderSelectOptions(STRATEGY_COPILOT_MARKET_OPTIONS)}
                  </select>
                </label>

                <label className="strategy-copilot-prompt" htmlFor="strategy-copilot-risk-level">
                  <span>Risk Level</span>
                  <select
                    id="strategy-copilot-risk-level"
                    onChange={(event) => setPreferenceField("riskLevel", event.target.value)}
                    value={preferences?.riskLevel || ""}
                  >
                    {renderSelectOptions(STRATEGY_COPILOT_RISK_LEVEL_OPTIONS)}
                  </select>
                </label>

                <label className="strategy-copilot-prompt" htmlFor="strategy-copilot-holding-period">
                  <span>Holding Period</span>
                  <select
                    id="strategy-copilot-holding-period"
                    onChange={(event) => setPreferenceField("holdingPeriod", event.target.value)}
                    value={preferences?.holdingPeriod || ""}
                  >
                    {renderSelectOptions(STRATEGY_COPILOT_HOLDING_PERIOD_OPTIONS)}
                  </select>
                </label>
              </div>

              <section className="strategy-copilot-chip-section">
                <div className="strategy-copilot-chip-header">
                  <h3>Primary Objectives</h3>
                </div>
                <div className="strategy-copilot-chip-grid">
                  {STRATEGY_COPILOT_OBJECTIVE_OPTIONS.map((option) => {
                    const selected = (preferences?.objectives || []).includes(option.value);
                    return (
                      <button
                        aria-pressed={selected}
                        className={`strategy-copilot-chip${selected ? " active" : ""}`}
                        key={option.value}
                        onClick={() => toggleObjective(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="strategy-copilot-chip-section">
                <div className="strategy-copilot-chip-header">
                  <h3>Sector Preferences</h3>
                  <p>Only applied if the generated Strategy Lab contract can represent them.</p>
                </div>
                <div className="strategy-copilot-chip-grid">
                  {STRATEGY_COPILOT_SECTOR_OPTIONS.map((option) => {
                    const selected = (preferences?.sectors || []).includes(option.value);
                    return (
                      <button
                        aria-pressed={selected}
                        className={`strategy-copilot-chip${selected ? " active" : ""}`}
                        key={option.value}
                        onClick={() => toggleSector(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="strategy-copilot-constraints">
                <div className="strategy-copilot-chip-header">
                  <h3>Optional Constraints</h3>
                  <p>These only surface controls the current Strategy Lab contract can support.</p>
                </div>
                <div className="strategy-copilot-advanced-grid">
                  <label className="strategy-copilot-prompt" htmlFor="strategy-copilot-max-drawdown">
                    <span>Maximum Drawdown Target (%)</span>
                    <input
                      id="strategy-copilot-max-drawdown"
                      inputMode="decimal"
                      onChange={(event) => setConstraintField("maxDrawdownTarget", event.target.value)}
                      placeholder="e.g. 12"
                      type="text"
                      value={preferences?.constraints?.maxDrawdownTarget || ""}
                    />
                  </label>

                  <label className="strategy-copilot-prompt" htmlFor="strategy-copilot-min-liquidity">
                    <span>Minimum Liquidity Preference</span>
                    <input
                      id="strategy-copilot-min-liquidity"
                      inputMode="numeric"
                      onChange={(event) => setConstraintField("minimumLiquidity", event.target.value)}
                      placeholder="e.g. 1000000"
                      type="text"
                      value={preferences?.constraints?.minimumLiquidity || ""}
                    />
                  </label>
                </div>

                <label className="strategy-copilot-checkbox" htmlFor="strategy-copilot-avoid-earnings">
                  <input
                    checked={Boolean(preferences?.constraints?.avoidEarningsPeriods)}
                    id="strategy-copilot-avoid-earnings"
                    onChange={(event) => setConstraintField("avoidEarningsPeriods", event.target.checked)}
                    type="checkbox"
                  />
                  <span>Avoid earnings periods</span>
                </label>
              </section>
            </section>
          ) : null}
        </section>
      ) : null}

      {mode !== "draft" &&
      mode !== "explain" &&
      mode !== "review" &&
      mode !== "compare" &&
      mode !== "version-compare" &&
      mode !== "research" ? (
        <label className="strategy-copilot-prompt">
          <span>{promptLabel}</span>
          <textarea
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={promptPlaceholder}
            rows="5"
            value={prompt}
          />
        </label>
      ) : null}

      {mode === "research" ? (
        <p className="strategy-copilot-context">
          Generates an evidence-backed research report from the latest backtest, robustness,
          walk-forward, Monte Carlo, regime, matrix replay, allocation, and version history data
          that already exists for this strategy.
        </p>
      ) : null}

      {mode !== "draft" ? (
        <div className="strategy-copilot-actions">
          <button className="strategy-primary-action" disabled={draft?.loading} onClick={handleRun} type="button">
            {primaryLabel}
          </button>
          {result ? (
            <button className="strategy-secondary-action" onClick={onDismiss} type="button">
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      {draft?.error ? <p className="engine-error">{draft.error}</p> : null}
      {result ? <HistoricalContextUsed context={result.historicalContextUsed} /> : null}

      {activeMode === "draft" && result?.review ? (
        <div className="strategy-copilot-review">
          <div className="strategy-copilot-status-row">
            <span className={`strategy-copilot-status strategy-copilot-status-${String(result.status || "").toLowerCase()}`}>
              {result.status}
            </span>
            <strong>{result.review.title}</strong>
          </div>

          <p className="strategy-copilot-description">{result.review.description}</p>
          <AdvisorySections advisory={advisory} />

          <section className="strategy-copilot-section">
            <h3>Explanation</h3>
            <p>{result.review.explanation?.summary}</p>
          </section>

          <div className="strategy-copilot-grid">
            <article className="strategy-copilot-section">
              <h3>Entry Rules</h3>
              {renderList(result.review.entryRules, "No entry rules generated.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Exit Rules</h3>
              {renderList(result.review.exitRules, "No exit rules generated.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Assumptions</h3>
              {renderList(result.review.assumptions, "No assumptions were needed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Potential Risks</h3>
              {renderList(result.review.potentialRisks, "No additional risks were listed.")}
            </article>
          </div>

          {result?.draft?.strategyJson ? (
            <>
              <section className="strategy-copilot-section">
                <h3>Generated Strategy Contract</h3>
                <pre>{formatJson(result.draft.strategyJson)}</pre>
              </section>
              <section className="strategy-copilot-section">
                <h3>JSON Preview</h3>
                <pre>{formatJson(result.draft.form)}</pre>
              </section>
            </>
          ) : null}

          {result.canApprove ? (
            <div className="strategy-copilot-actions">
              <button className="strategy-secondary-action" onClick={onApplyDraft} type="button">
                Load into Builder
              </button>
              <button className="strategy-primary-action" onClick={onApproveAndSave} type="button">
                Approve & Save
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeMode === "edit" && result?.review ? (
        <div className="strategy-copilot-review">
          <div className="strategy-copilot-status-row">
            <span className={`strategy-copilot-status strategy-copilot-status-${String(result.status || "").toLowerCase()}`}>
              {result.status}
            </span>
            <strong>{result.review.title}</strong>
          </div>

          <p className="strategy-copilot-description">{result.review.summaryOfChanges}</p>
          <AdvisorySections advisory={advisory} />

          <div className="strategy-copilot-grid">
            <article className="strategy-copilot-section">
              <h3>Change Highlights</h3>
              {renderList(result.review.changeHighlights, "No change highlights provided.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Tradeoffs</h3>
              {renderList(result.review.tradeoffs, "No tradeoffs listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Possible Downsides</h3>
              {renderList(result.review.possibleDownsides, "No downsides listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Assumptions</h3>
              {renderList(result.review.assumptions, "No assumptions were needed.")}
            </article>
          </div>

          {result.diff ? (
            <>
              <section className="strategy-copilot-section">
                <h3>Diff Summary</h3>
                {renderList(result.diff.summary, "No differences detected.")}
              </section>
              <div className="strategy-copilot-grid">
                <article className="strategy-copilot-section">
                  <h3>Rules Added</h3>
                  {renderList(result.diff.rulesAdded, "No rules added.")}
                </article>
                <article className="strategy-copilot-section">
                  <h3>Rules Removed</h3>
                  {renderList(result.diff.rulesRemoved, "No rules removed.")}
                </article>
                <article className="strategy-copilot-section">
                  <h3>Indicator Changes</h3>
                  {renderKeyValueChanges(result.diff.indicatorChanges, "No indicator changes.")}
                </article>
                <article className="strategy-copilot-section">
                  <h3>Validation Changes</h3>
                  {renderKeyValueChanges(result.diff.validationChanges, "No validation changes.")}
                </article>
                <article className="strategy-copilot-section">
                  <h3>Risk Changes</h3>
                  {renderKeyValueChanges(result.diff.riskChanges, "No risk changes.")}
                </article>
                <article className="strategy-copilot-section">
                  <h3>Position Sizing Changes</h3>
                  {renderKeyValueChanges(result.diff.positionSizingChanges, "No sizing changes.")}
                </article>
              </div>
            </>
          ) : null}

          {result?.draft?.strategyJson ? (
            <>
              <section className="strategy-copilot-section">
                <h3>Proposed Strategy Contract</h3>
                <pre>{formatJson(result.draft.strategyJson)}</pre>
              </section>
              <section className="strategy-copilot-section">
                <h3>Proposed Builder State</h3>
                <pre>{formatJson(result.draft.after)}</pre>
              </section>
            </>
          ) : null}

          {result.canApprove ? (
            <div className="strategy-copilot-actions">
              <button className="strategy-secondary-action" onClick={onApplyDraft} type="button">
                Load into Builder
              </button>
              <button className="strategy-primary-action" onClick={onApproveAndSave} type="button">
                Approve Changes
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeMode === "explain" && result?.explanation ? (
        <div className="strategy-copilot-review">
          <AdvisorySections advisory={advisory} />
          <section className="strategy-copilot-section">
            <h3>Overall Philosophy</h3>
            <p>{result.explanation.philosophy}</p>
            <p>{result.explanation.summary}</p>
          </section>
          <div className="strategy-copilot-grid">
            <article className="strategy-copilot-section">
              <h3>Indicators</h3>
              {renderList(result.explanation.indicators, "No indicators explained.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Entry Rules</h3>
              {renderList(result.explanation.entryRules, "No entry rules explained.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Exit Rules</h3>
              {renderList(result.explanation.exitRules, "No exit rules explained.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Validation & Risk</h3>
              {renderList([
                ...(result.explanation.validationRules || []),
                ...(result.explanation.riskRules || []),
              ], "No validation or risk notes available.")}
            </article>
          </div>
        </div>
      ) : null}

      {activeMode === "review" && result?.review ? (
        <div className="strategy-copilot-review">
          <AdvisorySections advisory={advisory} />
          <section className="strategy-copilot-section">
            <h3>Review Summary</h3>
            <p>{result.review.summary}</p>
          </section>
          <div className="strategy-copilot-grid">
            <article className="strategy-copilot-section">
              <h3>Findings</h3>
              {renderList(
                (result.review.findings || []).map(
                  (item) => `${item.severity}: ${item.category} - ${item.finding} (${item.impact})`
                ),
                "No review findings."
              )}
            </article>
            <article className="strategy-copilot-section">
              <h3>Recommendations</h3>
              {renderList(result.review.recommendations, "No recommendations listed.")}
            </article>
          </div>
        </div>
      ) : null}

      {activeMode === "question" && result?.answer ? (
        <div className="strategy-copilot-review">
          <AdvisorySections advisory={advisory} />
          <section className="strategy-copilot-section">
            <h3>Answer</h3>
            <p>{result.answer.answer}</p>
          </section>
          <div className="strategy-copilot-grid">
            <article className="strategy-copilot-section">
              <h3>Reasoning</h3>
              {renderList(result.answer.reasoning, "No reasoning provided.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Implications</h3>
              {renderList(result.answer.implications, "No implications listed.")}
            </article>
          </div>
        </div>
      ) : null}

      {activeMode === "compare" && result?.comparison ? (
        <div className="strategy-copilot-review">
          <AdvisorySections advisory={advisory} />
          <section className="strategy-copilot-section">
            <h3>Comparison Summary</h3>
            <p>{result.comparison.summary}</p>
          </section>
          <div className="strategy-copilot-grid">
            <article className="strategy-copilot-section">
              <h3>Key Differences</h3>
              {renderList(result.comparison.differences, "No differences listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Current Strategy Advantages</h3>
              {renderList(result.comparison.advantagesLeft, "No advantages listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Other Strategy Advantages</h3>
              {renderList(result.comparison.advantagesRight, "No advantages listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Risk & Complexity</h3>
              {renderList(
                [
                  result.comparison.riskComparison,
                  result.comparison.complexityComparison,
                  result.comparison.marketSuitability,
                  result.comparison.tradeFrequency,
                  result.comparison.expectedHoldingPeriod,
                ].filter(Boolean),
                "No comparison notes available."
              )}
            </article>
          </div>
        </div>
      ) : null}

      {activeMode === "research" && result?.report ? (
        <div className="strategy-copilot-review">
          <AdvisorySections advisory={advisory} />
          <section className="strategy-copilot-section">
            <h3>Executive Summary</h3>
            <p>{result.report.executiveSummary}</p>
          </section>
          <section className="strategy-copilot-section">
            <h3>Performance Summary</h3>
            <p>{result.report.performanceSummary}</p>
          </section>
          <div className="strategy-copilot-grid">
            <article className="strategy-copilot-section">
              <h3>Strengths</h3>
              {renderList(result.report.strengths, "No strengths listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Weaknesses</h3>
              {renderList(result.report.weaknesses, "No weaknesses listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Risk Assessment</h3>
              {renderList(result.report.riskAssessment, "No risk assessment available.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Regime Analysis</h3>
              {renderList(result.report.regimeAnalysis, "No regime analysis available.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Robustness</h3>
              {renderList(result.report.robustnessReview, "No robustness review available.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Execution & Capital</h3>
              {renderList(
                [...(result.report.executionAnalysis || []), ...(result.report.capitalUsage || [])],
                "No execution analysis available."
              )}
            </article>
            <article className="strategy-copilot-section">
              <h3>Failure Modes</h3>
              {renderList(result.report.failureModes, "No failure modes listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Supporting Metrics</h3>
              {renderList(result.report.supportingMetrics, "No supporting metrics cited.")}
            </article>
          </div>
          <section className="strategy-copilot-section">
            <h3>Research Recommendations</h3>
            {renderList(
              (result.report.researchRecommendations || []).map(
                (item) =>
                  `${item.recommendation} (confidence ${formatNumber(item.confidence)}/100; evidence: ${(item.evidence || []).join(", ")}; limitations: ${(item.limitations || []).join(", ")})`
              ),
              "No research recommendations available."
            )}
          </section>
        </div>
      ) : null}

      {activeMode === "research-question" && result?.answer ? (
        <div className="strategy-copilot-review">
          <AdvisorySections advisory={advisory} />
          <section className="strategy-copilot-section">
            <h3>Answer</h3>
            <p>{result.answer.answer}</p>
          </section>
          <div className="strategy-copilot-grid">
            <article className="strategy-copilot-section">
              <h3>Evidence</h3>
              {renderList(result.answer.evidence, "No evidence listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Supporting Metrics</h3>
              {renderList(result.answer.supportingMetrics, "No supporting metrics listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Limitations</h3>
              {renderList(result.answer.limitations, "No limitations listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Next Research Steps</h3>
              {renderList(result.answer.nextResearchSteps, "No next steps suggested.")}
            </article>
          </div>
        </div>
      ) : null}

      {activeMode === "version-compare" && result?.comparison ? (
        <div className="strategy-copilot-review">
          <AdvisorySections advisory={advisory} />
          <section className="strategy-copilot-section">
            <h3>Version Comparison</h3>
            <p>{result.comparison.executiveSummary}</p>
          </section>
          <div className="strategy-copilot-grid">
            <article className="strategy-copilot-section">
              <h3>Rule Changes</h3>
              {renderList(result.comparison.ruleChanges, "No rule changes listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Performance Differences</h3>
              {renderList(result.comparison.performanceDifferences, "No performance differences listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Risk Differences</h3>
              {renderList(result.comparison.riskDifferences, "No risk differences listed.")}
            </article>
            <article className="strategy-copilot-section">
              <h3>Improvements & Regressions</h3>
              {renderList(
                [...(result.comparison.improvements || []), ...(result.comparison.regressions || [])],
                "No improvements or regressions listed."
              )}
            </article>
          </div>
        </div>
      ) : null}
    </article>
  );
}
