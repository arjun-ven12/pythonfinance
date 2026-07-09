import {
  STRATEGY_BUILDER_SECTIONS,
  STRATEGY_EXPERIMENT_FIELDS,
  STRATEGY_OBJECTIVES,
  STRATEGY_RULE_CONNECTORS,
  STRATEGY_RULE_GROUPS,
  STRATEGY_TEMPLATES,
  STRATEGY_WEIGHT_FIELDS,
} from "../constants";
import {
  serializeStrategyBuilderState,
  validateStrategyJson,
} from "../utils/strategyJsonContract";
import StrategyTransparencyPanel from "./StrategyTransparencyPanel";

const textFieldsBySection = {
  Market: [
    ["marketBias", "Market focus", "US_AND_SGX"],
    ["primaryTimeframe", "Primary timeframe", "1D"],
    ["entryTimeframe", "Entry timeframe", "1H"],
  ],
  Execution: [
    ["sizingMethod", "Sizing method", "risk_per_trade"],
    ["sizingPreviewCapital", "Preview capital", "50000"],
    ["capitalSimulation", "Capital simulation", "50000"],
  ],
  Risk: [
    ["maxDrawdown", "Max drawdown %", "12"],
    ["maxPositionSize", "Max position %", "8"],
    ["maxSectorExposure", "Max sector %", "30"],
    ["maxDailyLoss", "Max daily loss %", "3"],
  ],
};

const selectOptions = {
  marketBias: [
    ["US_AND_SGX", "US + Singapore"],
    ["US", "US only"],
    ["SGX", "Singapore only"],
  ],
  primaryTimeframe: [
    ["1D", "Daily"],
    ["1W", "Weekly"],
    ["4H", "4H"],
  ],
  entryTimeframe: [
    ["1H", "Hourly"],
    ["4H", "4H"],
    ["1D", "Daily"],
  ],
  sizingMethod: [
    ["risk_per_trade", "Risk per trade"],
    ["equal_weight", "Equal weight"],
    ["risk_parity", "Risk parity"],
    ["vol_targeting", "Vol targeting"],
    ["kelly_capped", "Kelly capped"],
  ],
  capitalSimulation: [
    ["10000", "$10k"],
    ["50000", "$50k"],
    ["100000", "$100k"],
    ["500000", "$500k"],
  ],
};

function getRules(settings) {
  return Array.isArray(settings.rules) && settings.rules.length > 0 ? settings.rules : [];
}

function toPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "0%";
}

function getFeatureImportance(settings) {
  const weights = [
    ["Technical", Number(settings.technicalWeight || 0)],
    ["Regime", Number(settings.regimeWeight || 0)],
    ["News", Number(settings.newsWeight || 0)],
    ["OpenAI", Number(settings.openaiWeight || 0)],
  ];
  const total = weights.reduce((sum, [, value]) => sum + (Number.isFinite(value) ? value : 0), 0) || 1;
  return weights.map(([label, value]) => ({
    label,
    value: Math.round(((Number.isFinite(value) ? value : 0) / total) * 100),
  }));
}

function getHealthScore(settings) {
  const ruleCount = getRules(settings).length;
  const weightCount = getFeatureImportance(settings).filter((item) => item.value > 0).length;
  const maxDrawdown = Number(settings.maxDrawdown || 0);
  const maxPosition = Number(settings.maxPositionSize || 0);
  let score = 62;
  if (ruleCount >= 2 && ruleCount <= 6) score += 10;
  if (weightCount >= 3) score += 8;
  if (maxDrawdown > 0 && maxDrawdown <= 15) score += 8;
  if (maxPosition > 0 && maxPosition <= 10) score += 7;
  if (settings.regimeFilter) score += 3;
  if (settings.newsFilter) score += 2;
  return Math.max(0, Math.min(100, score));
}

function getHealthLabel(score) {
  if (score >= 82) return "Paper";
  if (score >= 68) return "Research";
  return "Avoid";
}

export default function StrategyExperimentForm({
  form,
  isEditing,
  onCancel,
  onChange,
  onRunRobustness,
  onSubmit,
  preview,
  runningRobustness,
  selectedExperiment,
  stockUniverses = [],
}) {
  const update = (field, value) => onChange({ ...form, [field]: value });
  const updateSetting = (field, value) =>
    onChange({
      ...form,
      settings: {
        ...form.settings,
        [field]: value,
      },
    });
  const applyTemplate = (templateName) => {
    const template = STRATEGY_TEMPLATES[templateName];
    updateSetting("template", templateName);
    if (!template) return;
    onChange({
      ...form,
      settings: {
        ...form.settings,
        ...(template.settings || {}),
        template: templateName,
      },
    });
  };
  const applyObjective = (objectiveKey) => {
    const objective = STRATEGY_OBJECTIVES[objectiveKey] || STRATEGY_OBJECTIVES.custom;
    onChange({
      ...form,
      settings: {
        ...form.settings,
        ...(objective.defaults || {}),
        objective: objectiveKey,
      },
    });
  };
  const updateRule = (index, field, value) => {
    const rules = [...getRules(form.settings)];
    rules[index] = { ...rules[index], [field]: value };
    updateSetting("rules", rules);
  };
  const addRule = () => {
    updateSetting("rules", [
      ...getRules(form.settings),
      {
        id: `rule-${Date.now()}`,
        group: "Signal",
        operator: "AND",
        left: "Indicator",
        comparator: ">",
        right: "Threshold",
        connector: "AND",
      },
    ]);
  };
  const removeRule = (index) => {
    updateSetting("rules", getRules(form.settings).filter((_, ruleIndex) => ruleIndex !== index));
  };
  const selectedTemplate = STRATEGY_TEMPLATES[form.settings.template || "Momentum"];
  const selectedObjective =
    STRATEGY_OBJECTIVES[form.settings.objective || "max_risk_adjusted_return"] ||
    STRATEGY_OBJECTIVES.max_risk_adjusted_return;
  const featureImportance = getFeatureImportance(form.settings);
  const healthScore = getHealthScore(form.settings);
  const healthLabel = getHealthLabel(healthScore);
  const expectedExposure = Number(form.settings.riskPerTrade || 0) * Number(form.settings.sizingPreviewCapital || 0);
  let compiledDsl;
  let dslValidationError = "";
  try {
    compiledDsl = serializeStrategyBuilderState(form);
  } catch (error) {
    compiledDsl = form.settings.strategyJson || selectedExperiment?.settingsJson?.strategyJson;
    dslValidationError = error.message;
  }
  const dslValidation = compiledDsl ? validateStrategyJson(compiledDsl) : null;
  const designNotes = compiledDsl?.metadata?.designNotes || [];
  const robustness = form.settings.robustness || selectedExperiment?.settingsJson?.robustness;
  const versions = selectedExperiment?.versions || [];
  const readiness =
    selectedExperiment?.versions?.[0]?.evidenceJson?.deploymentReadiness ||
    selectedExperiment?.settingsJson?.deploymentReadiness ||
    selectedExperiment?.settingsJson?.robustness?.deploymentReadiness ||
    null;
  const readinessGates = readiness?.gates || {};

  return (
    <article className="strategy-lab-card">
      <div className="alerts-panel-header">
        <div>
          <p className="eyebrow">Experiment Builder</p>
          <h2>{isEditing ? "Edit experiment" : "Create experiment"}</h2>
        </div>
      </div>

      <div className="strategy-form-grid">
        <label>
          <span>Strategy name</span>
          <input onChange={(event) => update("name", event.target.value)} value={form.name} />
        </label>
        <label>
          <span>Status</span>
          <select onChange={(event) => update("status", event.target.value)} value={form.status}>
            <option value="DRAFT">Draft</option>
            <option value="TESTED">Tested</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label>
          <span>Template</span>
          <select
            onChange={(event) => applyTemplate(event.target.value)}
            value={form.settings.template || "Momentum"}
          >
            {Object.keys(STRATEGY_TEMPLATES).map((templateName) => (
              <option key={templateName} value={templateName}>
                {templateName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Universe</span>
          <select
            onChange={(event) => updateSetting("universeType", event.target.value)}
            value={form.settings.universeType || "SINGLE"}
          >
            <option value="SINGLE">Single symbol</option>
            <option value="STOCK_UNIVERSE">Saved stock universe</option>
            <option value="WATCHLIST">Watchlist</option>
            <option value="SECTOR">Sector group</option>
            <option value="INDUSTRY">Industry group</option>
            <option value="CUSTOM_SCREEN">Custom screen</option>
          </select>
        </label>
        <label className="wide">
          <span>Description</span>
          <textarea
            onChange={(event) => update("description", event.target.value)}
            rows="3"
            value={form.description}
          />
        </label>
        <label className="wide">
          <span>Default stock universe</span>
          <select
            onChange={(event) => {
              const universe = stockUniverses.find((item) => item.id === event.target.value);
              onChange({
                ...form,
                settings: {
                  ...form.settings,
                  universeId: event.target.value,
                  universeName: universe?.name || "",
                },
              });
            }}
            value={form.settings.universeId || ""}
          >
            <option value="">No saved universe</option>
            {stockUniverses.map((universe) => (
              <option key={universe.id} value={universe.id}>
                {universe.name} ({universe.members?.length || 0})
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="strategy-builder-intent">
        <div>
          <p className="eyebrow">Intent</p>
          <h3>What should this strategy optimize for?</h3>
          <p>{selectedObjective.description}</p>
        </div>
        <div className="strategy-objective-grid">
          {Object.entries(STRATEGY_OBJECTIVES).map(([key, objective]) => (
            <button
              className={form.settings.objective === key ? "active" : ""}
              key={key}
              onClick={() => applyObjective(key)}
              type="button"
            >
              <strong>{objective.label}</strong>
              <span>{objective.template}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="strategy-builder-guided">
        <div className="strategy-builder-rail">
          {STRATEGY_BUILDER_SECTIONS.map((section, index) => (
            <div key={section}>
              <span>{index + 1}</span>
              <strong>{section}</strong>
            </div>
          ))}
        </div>

        <div className="strategy-template-panel">
          <div>
            <p className="eyebrow">Template Guardrails</p>
            <h3>{form.settings.template || "Momentum"}</h3>
            <p>{selectedTemplate?.description || "Custom strategy configuration."}</p>
          </div>
          <ul>
            {(selectedTemplate?.guardrails || ["Keep this strategy research-only until validated."]).map((guardrail) => (
              <li key={guardrail}>{guardrail}</li>
            ))}
          </ul>
        </div>

        <div className="strategy-coach-panel">
          <div>
            <p className="eyebrow">Coach</p>
            <h3>{selectedObjective.label}</h3>
          </div>
          <p>
            This objective biases the builder toward {selectedObjective.template} defaults.
            Changing thresholds affects only executable fields shown in the DSL preview below.
          </p>
          <ul>
            <li>Higher signal thresholds reduce trade frequency and require stronger evidence.</li>
            <li>Higher ATR stops tolerate more noise but increase risk per position.</li>
            <li>Regime/news/OpenAI weights adjust confidence; they do not create BUY/SELL signals.</li>
          </ul>
        </div>

        <div className="strategy-builder-block">
          <div>
            <p className="eyebrow">Market Selection</p>
            <h3>Where this strategy is allowed to operate</h3>
          </div>
          <div className="strategy-form-grid compact">
            {(textFieldsBySection.Market || []).map(([field, label, fallback]) => (
              <label key={field}>
                <span>{label}</span>
                <select
                  onChange={(event) => updateSetting(field, event.target.value)}
                  value={form.settings[field] || fallback}
                >
                  {(selectOptions[field] || [[fallback, fallback]]).map(([value, optionLabel]) => (
                    <option key={value} value={value}>{optionLabel}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="strategy-builder-block">
          <div>
            <p className="eyebrow">Operating Envelope</p>
            <h3>Sector, regime, instrument, volatility, and liquidity fit</h3>
            <p>
              These fields are executable. Scanner and backtests use them for fit checks,
              instrument guards, and regime-aware routing.
            </p>
          </div>
          <div className="strategy-form-grid compact">
            <label className="wide">
              <span>Allowed sectors</span>
              <input
                onChange={(event) => updateSetting("allowedSectors", event.target.value)}
                placeholder="Technology, Communication Services, Financial Services"
                value={form.settings.allowedSectors || ""}
              />
            </label>
            <label className="wide">
              <span>Allowed regimes</span>
              <input
                onChange={(event) => updateSetting("allowedRegimes", event.target.value)}
                placeholder="BULL_LOW_VOL, BULL_HIGH_VOL, SIDEWAYS"
                value={form.settings.allowedRegimes || ""}
              />
            </label>
            <label className="wide">
              <span>Instrument types</span>
              <input
                onChange={(event) => updateSetting("instrumentTypes", event.target.value)}
                placeholder="SINGLE_STOCK, ETF, LEVERAGED_ETF"
                value={form.settings.instrumentTypes || ""}
              />
            </label>
            <label>
              <span>Volatility min</span>
              <input
                onChange={(event) => updateSetting("volatilityMin", event.target.value)}
                type="number"
                value={form.settings.volatilityMin || "0"}
              />
            </label>
            <label>
              <span>Volatility max</span>
              <input
                onChange={(event) => updateSetting("volatilityMax", event.target.value)}
                type="number"
                value={form.settings.volatilityMax || "0.03"}
              />
            </label>
            <label>
              <span>Liquidity floor</span>
              <input
                onChange={(event) => updateSetting("liquidityFloor", event.target.value)}
                type="number"
                value={form.settings.liquidityFloor || "1000000"}
              />
            </label>
            <label>
              <span>Max hold days</span>
              <input
                onChange={(event) => updateSetting("holdingPeriodDays", event.target.value)}
                type="number"
                value={form.settings.holdingPeriodDays || "15"}
              />
            </label>
            <label className="wide">
              <span>Regime overlays (JSON)</span>
              <textarea
                onChange={(event) => updateSetting("regimeOverlays", event.target.value)}
                rows="5"
                value={
                  typeof form.settings.regimeOverlays === "string"
                    ? form.settings.regimeOverlays
                    : JSON.stringify(form.settings.regimeOverlays || {}, null, 2)
                }
              />
            </label>
            <label className="wide">
              <span>Sector x regime allocation matrix (JSON)</span>
              <textarea
                onChange={(event) => updateSetting("allocationMatrix", event.target.value)}
                rows="6"
                value={
                  typeof form.settings.allocationMatrix === "string"
                    ? form.settings.allocationMatrix
                    : JSON.stringify(form.settings.allocationMatrix || {}, null, 2)
                }
              />
            </label>
          </div>
        </div>

        <div className="strategy-builder-block">
          <div>
            <p className="eyebrow">Live Consequence Preview</p>
            <h3>Bounded real-data sample</h3>
            <p>
              Preview runs use the same backtest execution path on a short sample. They are useful
              for tradeoff direction, not deployment validation.
            </p>
          </div>
          <div className="strategy-preview-grid">
            <article>
              <span>Status</span>
              <strong>{preview?.loading ? "Running..." : preview?.result ? "Ready" : "Waiting"}</strong>
              <small>{preview?.result?.label || "Preview — bounded sample, not a validated result."}</small>
            </article>
            <article>
              <span>Signals</span>
              <strong>{preview?.result?.metrics?.signalCount ?? "-"}</strong>
              <small>{preview?.result?.config?.symbol || "AAPL"} · {preview?.result?.config?.period || "6mo"}</small>
            </article>
            <article>
              <span>Trades</span>
              <strong>{preview?.result?.metrics?.tradeCount ?? "-"}</strong>
              <small>Completed trades</small>
            </article>
            <article>
              <span>Hit rate</span>
              <strong>
                {Number.isFinite(Number(preview?.result?.metrics?.hitRate))
                  ? `${Number(preview.result.metrics.hitRate).toFixed(1)}%`
                  : "-"}
              </strong>
              <small>Sample only</small>
            </article>
            <article>
              <span>Return</span>
              <strong>
                {Number.isFinite(Number(preview?.result?.metrics?.returnPct))
                  ? `${Number(preview.result.metrics.returnPct).toFixed(1)}%`
                  : "-"}
              </strong>
              <small>Bounded period</small>
            </article>
            <article>
              <span>Avg hold</span>
              <strong>
                {Number.isFinite(Number(preview?.result?.metrics?.averageHoldingPeriodDays))
                  ? `${Number(preview.result.metrics.averageHoldingPeriodDays).toFixed(1)}d`
                  : "-"}
              </strong>
              <small>Closed trades</small>
            </article>
          </div>
          {preview?.error && <p className="engine-error">{preview.error}</p>}
        </div>

        <div className="strategy-builder-block">
          <div>
            <p className="eyebrow">Executable DSL</p>
            <h3>Builder → DSL → Python execution</h3>
            <p>
              Save this strategy to compile the current blocks into normalized executable JSON.
              Backtests use this DSL when present.
            </p>
          </div>
          <div className="strategy-dsl-grid">
            <article>
              <span>Entry rules</span>
              <strong>{compiledDsl?.executable?.entryRules?.length || getRules(form.settings).length}</strong>
            </article>
            <article>
              <span>Execution</span>
              <strong>{compiledDsl?.executable?.execution?.entryTiming || "next_bar"}</strong>
            </article>
            <article>
              <span>Latest version</span>
              <strong>{versions[0] ? `v${versions[0].version}` : "Save to create v1"}</strong>
            </article>
          </div>
          {dslValidationError && (
            <p className="engine-error">Strategy JSON invalid: {dslValidationError}</p>
          )}
          {dslValidation && !dslValidation.success && (
            <p className="engine-error">
              Strategy JSON invalid: {dslValidation.error.issues[0]?.message || "Unknown schema error"}
            </p>
          )}
          {designNotes.length > 0 && (
            <div className="strategy-design-note-list">
              {designNotes.map((note) => (
                <span key={note.field}>{note.field}: {note.label}</span>
              ))}
            </div>
          )}
          {compiledDsl && (
            <pre className="strategy-dsl-preview">
              {JSON.stringify(compiledDsl.executable, null, 2)}
            </pre>
          )}
          <StrategyTransparencyPanel
            compiledDsl={compiledDsl}
            dslValidation={dslValidation}
            preview={preview}
            readiness={readiness}
            versions={versions}
          />
        </div>

        <div className="strategy-builder-block">
          <div>
            <p className="eyebrow">Promotion Readiness</p>
            <h3>{readiness ? `${readiness.label} · ${readiness.score}/100` : "Evidence required"}</h3>
            <p>
              Activation is enforced by the backend. A direct API request cannot promote this strategy
              while gates are failing.
            </p>
          </div>
          <div className="strategy-readiness-grid">
            {[
              ["minimumTrades", "Minimum trades"],
              ["minimumRobustness", "Robustness"],
              ["minimumWalkForwardStability", "Walk-forward"],
              ["validationConfidenceThreshold", "Validation"],
              ["perRegimeEvidence", "Per-regime"],
              ["outOfRegimeWalkForward", "Out-of-regime"],
            ].map(([key, label]) => {
              const gate = readinessGates[key];
              const gateValue = key === "perRegimeEvidence"
                ? gate
                  ? gate.pass
                    ? "Pass"
                    : `${gate.failingRegimes?.length || 0} failing`
                  : "Not run"
                : key === "outOfRegimeWalkForward"
                  ? gate
                    ? gate.pass
                      ? "Pass"
                      : "Fail"
                    : "Not run"
                  : gate
                    ? `${gate.actual}/${gate.required}`
                    : "Not run";
              return (
                <article className={gate?.pass ? "pass" : "fail"} key={key}>
                  <span>{label}</span>
                  <strong>{gateValue}</strong>
                </article>
              );
            })}
          </div>
          {readiness?.reasons?.length > 0 && (
            <ul className="strategy-readiness-reasons">
              {readiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          )}
        </div>

        <div className="strategy-builder-block">
          <div>
            <p className="eyebrow">Signal Generation</p>
            <h3>Rule builder</h3>
          </div>
          <div className="strategy-rule-builder">
            {getRules(form.settings).map((rule, index) => (
              <div className="strategy-rule-row" key={rule.id || index}>
                <select value={rule.group || "Signal"} onChange={(event) => updateRule(index, "group", event.target.value)}>
                  {STRATEGY_RULE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
                <select value={rule.operator || "AND"} onChange={(event) => updateRule(index, "operator", event.target.value)}>
                  {["WHEN", "AND", "OR", "NOT", "GROUP", "THEN"].map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                </select>
                <input value={rule.left || ""} onChange={(event) => updateRule(index, "left", event.target.value)} />
                <input value={rule.comparator || ""} onChange={(event) => updateRule(index, "comparator", event.target.value)} />
                <input value={rule.right || ""} onChange={(event) => updateRule(index, "right", event.target.value)} />
                <select value={rule.connector || "AND"} onChange={(event) => updateRule(index, "connector", event.target.value)}>
                  {STRATEGY_RULE_CONNECTORS.map((connector) => <option key={connector} value={connector}>{connector}</option>)}
                </select>
                <button onClick={() => removeRule(index)} type="button">Remove</button>
              </div>
            ))}
            <button className="strategy-secondary-action" onClick={addRule} type="button">Add Rule</button>
          </div>
        </div>

        <div className="strategy-builder-block">
          <div>
            <p className="eyebrow">Execution</p>
            <h3>Position sizing and capital impact</h3>
          </div>
          <div className="strategy-form-grid compact">
            {(textFieldsBySection.Execution || []).map(([field, label, fallback]) => (
              <label key={field}>
                <span>{label}</span>
                {selectOptions[field] ? (
                  <select onChange={(event) => updateSetting(field, event.target.value)} value={form.settings[field] || fallback}>
                    {selectOptions[field].map(([value, optionLabel]) => (
                      <option key={value} value={value}>{optionLabel}</option>
                    ))}
                  </select>
                ) : (
                  <input onChange={(event) => updateSetting(field, event.target.value)} type="number" value={form.settings[field] || fallback} />
                )}
              </label>
            ))}
            <div className="strategy-impact-card">
              <span>Expected risk budget</span>
              <strong>${Number.isFinite(expectedExposure) ? expectedExposure.toFixed(0) : "0"}</strong>
              <small>{toPercent(form.settings.riskPerTrade)} of preview capital</small>
            </div>
          </div>
        </div>

        <div className="strategy-builder-block">
          <div>
            <p className="eyebrow">Risk Rules</p>
            <h3>Constraints before optimization</h3>
          </div>
          <div className="strategy-form-grid compact">
            {(textFieldsBySection.Risk || []).map(([field, label, fallback]) => (
              <label key={field}>
                <span>{label}</span>
                <input onChange={(event) => updateSetting(field, event.target.value)} step="0.1" type="number" value={form.settings[field] || fallback} />
              </label>
            ))}
            <div className={`strategy-health-card ${healthLabel.toLowerCase()}`}>
              <span>Strategy health</span>
              <strong>{healthScore}/100</strong>
              <small>{healthLabel}</small>
            </div>
          </div>
        </div>

        <div className="strategy-builder-block">
          <div>
            <p className="eyebrow">Validation</p>
            <h3>Explainability and robustness</h3>
          </div>
          <div className="strategy-explainability-grid">
            <article>
              <span>Feature importance</span>
              {featureImportance.map((item) => (
                <div className="strategy-importance-row" key={item.label}>
                  <small>{item.label}</small>
                  <div><span style={{ width: `${item.value}%` }} /></div>
                  <strong>{item.value}%</strong>
                </div>
              ))}
            </article>
            <article>
              <span>Robustness mode</span>
              <label className="compact-toggle strategy-builder-toggle">
                <input
                  checked={Boolean(form.settings.robustnessMode)}
                  onChange={(event) => updateSetting("robustnessMode", event.target.checked)}
                  type="checkbox"
                />
                Test RSI/EMA/date perturbations
              </label>
              <p>{form.settings.robustnessMode ? "Stable zones will be reviewed during optimization." : "Enable before promoting from research to paper."}</p>
              <button
                className="strategy-secondary-action"
                disabled={!selectedExperiment?.id || runningRobustness}
                onClick={() => selectedExperiment?.id && onRunRobustness?.(selectedExperiment.id)}
                type="button"
              >
                {runningRobustness ? "Testing..." : "Test Robustness"}
              </button>
              {robustness && (
                <p>
                  {robustness.rating} · score {robustness.score}/100 · sensitivity{" "}
                  {Number(robustness.parameterSensitivity || 0).toFixed(2)}
                </p>
              )}
            </article>
            <article>
              <span>Strategy search</span>
              <textarea
                onChange={(event) => updateSetting("strategyPrompt", event.target.value)}
                placeholder="Example: Low drawdown SG dividend strategy"
                rows="3"
                value={form.settings.strategyPrompt || ""}
              />
              <p>
                Stores research intent for ideation only. The generated strategy representation is
                shown in AI Transparency below, and it never deploys automatically.
              </p>
            </article>
          </div>
        </div>

        <div className="strategy-graph">
          {["Market", "Signal", "Entry", "Risk", "Exit", "Validation"].map((node) => (
            <div key={node}>
              <span>{node}</span>
              <strong>{getRules(form.settings).filter((rule) => rule.group === node).length || "Guarded"}</strong>
            </div>
          ))}
        </div>

        <details className="strategy-advanced-parameters" open>
          <summary>Advanced parameters used by existing backtests</summary>
          <div className="strategy-form-grid">
            {STRATEGY_EXPERIMENT_FIELDS.map(([field, label]) => (
              <label key={field}>
                <span>{label}</span>
                <input
                  onChange={(event) => updateSetting(field, event.target.value)}
                  step={field === "emaFast" || field === "emaSlow" ? "1" : "0.01"}
                  type="number"
                  value={form.settings[field]}
                />
              </label>
            ))}
            {STRATEGY_WEIGHT_FIELDS.map(([field, label]) => (
              <label key={field}>
                <span>{label}</span>
                <input
                  max="1"
                  min="0"
                  onChange={(event) => updateSetting(field, event.target.value)}
                  step="0.01"
                  type="number"
                  value={form.settings[field]}
                />
              </label>
            ))}
            {[
              ["regimeFilter", "Regime filter"],
              ["newsFilter", "News filter"],
              ["marketHoursOnly", "Market hours only"],
              ["earningsFilter", "Earnings filter"],
            ].map(([field, label]) => (
              <label className="compact-toggle strategy-builder-toggle" key={field}>
                <input
                  checked={Boolean(form.settings[field])}
                  onChange={(event) => updateSetting(field, event.target.checked)}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
        </details>
      </section>

      <div className="strategy-lab-actions">
        <button onClick={onSubmit} type="button">
          {isEditing ? "Save Experiment" : "Create Experiment"}
        </button>
        {isEditing && (
          <button onClick={onCancel} type="button">
            Cancel
          </button>
        )}
      </div>
    </article>
  );
}
