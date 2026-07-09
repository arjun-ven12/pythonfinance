import { useState } from "react";

function formatPercent(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(digits)}%` : "Not available";
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "Not available";
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(number);
}

function formatRuleValue(value) {
  if (value === null || value === undefined || value === "") {
    return "set threshold";
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    if (Number.isFinite(Number(value.min)) && Number.isFinite(Number(value.max))) {
      return `${value.min} to ${value.max}`;
    }
    return JSON.stringify(value);
  }

  return String(value);
}

function describeRule(rule) {
  if (!rule || typeof rule !== "object") {
    return "Unrecognized rule";
  }

  if (Array.isArray(rule.children) && rule.children.length > 0) {
    const joined = rule.children.map(describeRule).join(` ${rule.operator || "AND"} `);
    return `(${joined})`;
  }

  const indicator = rule.raw?.left || rule.indicator || "Indicator";
  const comparator = rule.raw?.comparator || rule.comparator || ">";
  const value = rule.raw?.right ?? formatRuleValue(rule.value);
  return `${indicator} ${comparator} ${value}`;
}

function buildSummary(compiledDsl, preview, readiness) {
  const executable = compiledDsl?.executable || {};
  const validation = executable.validation || {};
  const positionSizing = executable.positionSizing || {};
  const weights = executable.weights || {};
  const entryRules = Array.isArray(executable.entryRules) ? executable.entryRules : [];
  const exitRules = Array.isArray(executable.exitRules) ? executable.exitRules : [];
  const riskRules = Array.isArray(executable.riskRules) ? executable.riskRules : [];
  const previewMetrics = preview?.result?.metrics || {};

  return {
    entryLogic: entryRules.map(describeRule),
    exitLogic: exitRules.map(describeRule),
    riskLogic: riskRules.map(describeRule),
    executionRules: [
      `Universe: ${executable.universe?.type || "SINGLE"} on ${executable.universe?.market || "US_AND_SGX"}`,
      `Timeframe: ${executable.timeframe?.primary || "1D"} primary / ${executable.timeframe?.entry || "1H"} entry`,
      `Execution timing: ${executable.execution?.entryTiming || "next_bar"} with ${executable.execution?.confirmation || "close_confirmation"}`,
    ],
    sizingRules: [
      `Method: ${positionSizing.method || "risk_per_trade"}`,
      `Risk per trade: ${formatPercent((positionSizing.riskPerTrade || 0) * 100, 2)}`,
      `Preview capital: ${formatCurrency(positionSizing.previewCapital)}`,
    ],
    riskSummary: [
      `Max drawdown: ${formatPercent(validation.maxDrawdown, 1)}`,
      `Max position size: ${formatPercent(validation.maxPositionSize, 1)}`,
      `Max sector exposure: ${formatPercent(validation.maxSectorExposure, 1)}`,
      `Max daily loss: ${formatPercent(validation.maxDailyLoss, 1)}`,
    ],
    strategySummary: [
      `Template: ${compiledDsl?.metadata?.template || "Custom"}`,
      `Objective: ${compiledDsl?.metadata?.objective || "Not specified"}`,
      `Health weighting: technical ${formatPercent((weights.technical || 0) * 100, 0)}, regime ${formatPercent((weights.regime || 0) * 100, 0)}, news ${formatPercent((weights.news || 0) * 100, 0)}, OpenAI ${formatPercent((weights.openai || 0) * 100, 0)}`,
      `Preview sample: ${preview?.result?.config?.symbol || "AAPL"} over ${preview?.result?.config?.period || "6mo"} with ${previewMetrics.tradeCount ?? "-"} trades and ${formatPercent(previewMetrics.returnPct, 1)} return`,
      readiness?.label ? `Promotion readiness: ${readiness.label} ${readiness.score || 0}/100` : "Promotion readiness: evidence pending",
    ],
  };
}

function buildFutureCodeView(compiledDsl) {
  const executable = compiledDsl?.executable || {};
  const entryLogic = (Array.isArray(executable.entryRules) ? executable.entryRules : []).map(describeRule);
  const exitLogic = (Array.isArray(executable.exitRules) ? executable.exitRules : []).map(describeRule);
  const riskLogic = (Array.isArray(executable.riskRules) ? executable.riskRules : []).map(describeRule);

  return [
    `strategy "${compiledDsl?.metadata?.template || "Custom"}" {`,
    `  universe "${executable.universe?.type || "SINGLE"}" market "${executable.universe?.market || "US_AND_SGX"}";`,
    `  timeframe primary "${executable.timeframe?.primary || "1D"}" entry "${executable.timeframe?.entry || "1H"}";`,
    `  when ${entryLogic.length ? entryLogic.join(" and ") : "entry conditions are defined"} then enter_position();`,
    `  size method "${executable.positionSizing?.method || "risk_per_trade"}" risk_per_trade ${formatNumber((executable.positionSizing?.riskPerTrade || 0) * 100, 2)}%;`,
    `  validation max_drawdown ${formatNumber(executable.validation?.maxDrawdown, 1)} max_position ${formatNumber(executable.validation?.maxPositionSize, 1)};`,
    `  filters regime=${Boolean(executable.filters?.marketRegime)} news=${Boolean(executable.filters?.news)} earnings=${Boolean(executable.filters?.earnings)} market_hours=${Boolean(executable.filters?.marketHoursOnly)};`,
    `  manage exits ${exitLogic.length ? exitLogic.join(" ; ") : "with engine defaults"};`,
    `  manage risk ${riskLogic.length ? riskLogic.join(" ; ") : "with validation guardrails only"};`,
    `}`,
  ].join("\n");
}

export default function StrategyTransparencyPanel({
  compiledDsl,
  dslValidation,
  preview,
  readiness,
  versions = [],
}) {
  const [view, setView] = useState("human");

  if (!compiledDsl) {
    return null;
  }

  const summary = buildSummary(compiledDsl, preview, readiness);
  const schemaState = dslValidation?.success ? "Valid" : "Needs fixes";
  const previewState = preview?.loading ? "Running" : preview?.result ? "Ready" : "Waiting";
  const versionState = versions[0] ? `v${versions[0].version}` : "Unsaved";
  const entryLogic = summary.entryLogic.length ? summary.entryLogic : ["No entry rules compiled yet."];
  const exitLogic = summary.exitLogic.length ? summary.exitLogic : ["No dedicated exit rules compiled yet."];
  const riskLogic = summary.riskLogic.length ? summary.riskLogic : ["No dedicated risk rules compiled yet."];

  return (
    <div className="strategy-transparency-panel">
      <div className="strategy-transparency-header">
        <div>
          <p className="eyebrow">AI Transparency</p>
          <h3>Generated strategy representation</h3>
          <p>
            This is the normalized algorithm the app will validate and backtest.
            It exposes the generated strategy structure without exposing internal prompts.
          </p>
        </div>
        <div className="strategy-transparency-status">
          <article>
            <span>Schema</span>
            <strong>{schemaState}</strong>
          </article>
          <article>
            <span>Preview</span>
            <strong>{previewState}</strong>
          </article>
          <article>
            <span>Version</span>
            <strong>{versionState}</strong>
          </article>
        </div>
      </div>

      <div className="strategy-transparency-summary">
        {summary.strategySummary.map((item) => (
          <article key={item}>
            <span>Summary</span>
            <strong>{item}</strong>
          </article>
        ))}
      </div>

      <div className="strategy-transparency-grid">
        <section>
          <span>Entry logic</span>
          <ul>
            {entryLogic.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section>
          <span>Exit logic</span>
          <ul>
            {exitLogic.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section>
          <span>Risk rules</span>
          <ul>
            {riskLogic.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section>
          <span>Execution rules</span>
          <ul>
            {summary.executionRules.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section>
          <span>Position sizing</span>
          <ul>
            {summary.sizingRules.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section>
          <span>Validation guardrails</span>
          <ul>
            {summary.riskSummary.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>

      <div className="strategy-transparency-view-switcher" role="tablist" aria-label="Transparency views">
        {[
          ["human", "Human-readable view"],
          ["json", "JSON view"],
          ["code", "Future code view"],
        ].map(([key, label]) => (
          <button
            aria-selected={view === key}
            className={view === key ? "active" : ""}
            key={key}
            onClick={() => setView(key)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {view === "human" && (
        <div className="strategy-transparency-human">
          <article>
            <span>Strategy summary</span>
            <p>{summary.strategySummary.join(". ")}</p>
          </article>
          <article>
            <span>Generated execution rules</span>
            <p>{summary.executionRules.join(". ")}</p>
          </article>
          <article>
            <span>Risk posture</span>
            <p>{summary.riskSummary.join(". ")}</p>
          </article>
        </div>
      )}

      {view === "json" && (
        <pre className="strategy-dsl-preview">
          {JSON.stringify(compiledDsl, null, 2)}
        </pre>
      )}

      {view === "code" && (
        <pre className="strategy-dsl-preview">
          {buildFutureCodeView(compiledDsl)}
        </pre>
      )}
    </div>
  );
}
