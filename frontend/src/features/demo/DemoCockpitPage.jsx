import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/Layout/AppShell";
import { API_BASE_URL, readJson } from "../../services/apiClient";
import "./demo.css";

const DEMO_USER = {
  id: "demo-session",
  email: "demo@quantstrade.local",
  name: "Demo Visitor",
  isDemoMode: true,
};

const THEME_STORAGE_KEY = "tradingDashboardTheme";
const DEMO_INTRO_STORAGE_KEY = "guidedTradingDayIntroSeen";
const STEP_QUERY_PARAM = "missionStep";

const DEMO_TAB_ROUTE = {
  Dashboard: "/demo",
  Scanner: "/demo/scanner",
  "Strategy Lab": "/demo/strategy",
  Approvals: "/demo/approvals",
  Portfolio: "/demo/portfolio",
  Validation: "/demo/validation",
  Playbook: "/demo/playbook",
};

const DEMO_SECTIONS = [
  { label: "Morning", tabs: ["Dashboard", "Scanner", "Approvals"] },
  { label: "Research", tabs: ["Strategy Lab", "Validation", "Playbook"] },
  { label: "Portfolio", tabs: ["Portfolio"] },
];

const TAB_ENDPOINTS = {
  Dashboard: "/api/demo/dashboard",
  Scanner: "/api/demo/scanner",
  "Strategy Lab": "/api/demo/strategy-lab",
  Approvals: "/api/demo/approvals",
  Portfolio: "/api/demo/portfolio",
  Validation: "/api/demo/validation",
  Playbook: "/api/demo/playbook",
};

const MISSION_STEPS = [
  {
    title: "Market Opens",
    route: "/demo",
    tab: "Dashboard",
    summary: "See the regime, active deployment set, and paper-only system status before the trading loop begins.",
  },
  {
    title: "Scanner Finds Opportunities",
    route: "/demo/scanner",
    tab: "Scanner",
    summary: "Watch the platform scan, rank, and filter names before surfacing the best candidate.",
  },
  {
    title: "Inspect Opportunity",
    route: "/demo/scanner",
    tab: "Scanner",
    summary: "Open AMD and review score, confidence, evidence, and portfolio fit.",
  },
  {
    title: "Strategy Attribution",
    route: "/demo/strategy",
    tab: "Strategy Lab",
    summary: "Understand which strategy version selected AMD and why the routing gate passed.",
  },
  {
    title: "Approval Gate",
    route: "/demo/approvals",
    tab: "Approvals",
    summary: "Review the pending approval, safety checklist, and human note before any execution path exists.",
  },
  {
    title: "Blocked Bad Trade",
    route: "/demo/approvals",
    tab: "Approvals",
    summary: "See how safety blocks a trade when exposure, risk budget, and news sensitivity go out of bounds.",
  },
  {
    title: "Paper Execution Preview",
    route: "/demo/approvals",
    tab: "Approvals",
    summary: "Preview the approval to paper-execution-to-ledger path without touching a broker.",
  },
  {
    title: "Portfolio Update",
    route: "/demo/portfolio",
    tab: "Portfolio",
    summary: "Visualize the cash, exposure, sector allocation, and risk impact the paper trade would create.",
  },
  {
    title: "Validation",
    route: "/demo/validation",
    tab: "Validation",
    summary: "See how the platform checks expected versus actual outcomes and calibrates confidence.",
  },
  {
    title: "Playbook",
    route: "/demo/playbook",
    tab: "Playbook",
    summary: "Close the loop with evidence updates, recorded decisions, and deployment score changes.",
  },
];

function readDemo(path) {
  return window.fetch(`${API_BASE_URL}${path}`).then(readJson);
}

function getCurrentPath() {
  if (typeof window === "undefined") return "/demo";
  return `${window.location.pathname || "/demo"}${window.location.search || ""}`;
}

function findStepIndexByRoute(route) {
  const fallbackBase = route.startsWith("/") ? "http://demo.local" : "http://demo.local/demo";
  const url = new URL(route, fallbackBase);
  const queryStep = Number(url.searchParams.get(STEP_QUERY_PARAM));

  if (Number.isInteger(queryStep) && queryStep >= 1 && queryStep <= MISSION_STEPS.length) {
    return queryStep - 1;
  }

  const normalized = url.pathname.toLowerCase();
  const index = MISSION_STEPS.findIndex((step) => step.route.toLowerCase() === normalized);
  return index >= 0 ? index : 0;
}

function buildMissionRoute(stepIndex) {
  const step = MISSION_STEPS[Math.max(0, Math.min(stepIndex, MISSION_STEPS.length - 1))];
  return `${step.route}?${STEP_QUERY_PARAM}=${stepIndex + 1}`;
}

function navigateTo(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function ExplainerChip({ label, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="demo-chip-wrap">
      <button
        className={`demo-explainer-chip${open ? " is-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {label}
      </button>
      {open ? <div className="demo-explainer-popover">{text}</div> : null}
    </div>
  );
}

function Hotspot({ label, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="demo-hotspot">
      <button
        aria-label={label}
        className={`demo-hotspot__button${open ? " is-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        ?
      </button>
      {open ? <div className="demo-hotspot__popover">{text}</div> : null}
    </div>
  );
}

function DisabledAction({ label, detail = "Demo is read-only. Create an account and get verified to use this." }) {
  return (
    <button className="demo-action demo-action--disabled" type="button">
      Sign up to use this
      <span>{label}</span>
      <small>{detail}</small>
    </button>
  );
}

function DemoMetric({ label, value, helper, hotspot }) {
  return (
    <div className="demo-metric">
      <div className="demo-metric__label">
        <span>{label}</span>
        {hotspot ? <Hotspot label={`${label} explainer`} text={hotspot} /> : null}
      </div>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
}

function DemoMetricPlain({ label, value, helper, hotspot }) {
  return (
    <div className="demo-metric demo-metric--plain">
      <div className="demo-metric__label">
        <span>{label}</span>
        {hotspot ? <Hotspot label={`${label} explainer`} text={hotspot} /> : null}
      </div>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
}

function HistoricalPricePreview() {
  const points = [
    [0, 136],
    [24, 132],
    [48, 138],
    [72, 141],
    [96, 145],
    [120, 143],
    [144, 150],
    [168, 156],
    [192, 154],
    [216, 162],
    [240, 168],
    [264, 172],
    [288, 178],
  ];

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,180 ${line} 288,180`;

  return (
    <div className="demo-price-chart" aria-hidden="true">
      <div className="demo-price-chart__header">
        <span>AMD</span>
        <strong>+12.4% / 3M</strong>
      </div>
      <svg viewBox="0 0 288 180" preserveAspectRatio="none" role="presentation">
        <defs>
          <linearGradient id="demoPriceArea" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(77, 214, 156, 0.38)" />
            <stop offset="100%" stopColor="rgba(77, 214, 156, 0)" />
          </linearGradient>
          <linearGradient id="demoPriceLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#65d6ff" />
            <stop offset="100%" stopColor="#4dd69c" />
          </linearGradient>
        </defs>
        <path className="demo-price-chart__grid" d="M0 32H288 M0 72H288 M0 112H288 M0 152H288" />
        <path className="demo-price-chart__area" d={`M${area} Z`} />
        <polyline className="demo-price-chart__line" points={line} />
        <circle className="demo-price-chart__point" cx="288" cy="178" r="5.5" />
      </svg>
      <div className="demo-price-chart__footer">
        <span>Apr</span>
        <span>May</span>
        <span>Jun</span>
      </div>
    </div>
  );
}

function PortfolioPnlPreview({ pnl }) {
  const points = [
    [0, 134],
    [30, 140],
    [60, 136],
    [90, 128],
    [120, 144],
    [150, 138],
    [180, 149],
    [210, 156],
    [240, 151],
    [270, 160],
    [300, 154],
    [330, 166],
  ];
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,180 ${line} 330,180`;

  return (
    <div className="demo-pnl-chart">
      <div className="demo-pnl-chart__header">
        <div>
          <span>Paper PnL trend</span>
          <strong>+$ {Number(pnl || 0).toLocaleString()}</strong>
        </div>
        <b>+4.8%</b>
      </div>
      <svg viewBox="0 0 330 180" preserveAspectRatio="none" role="presentation">
        <defs>
          <linearGradient id="demoPnlArea" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(77, 214, 156, 0.32)" />
            <stop offset="100%" stopColor="rgba(77, 214, 156, 0)" />
          </linearGradient>
          <linearGradient id="demoPnlLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#7aa2ff" />
            <stop offset="100%" stopColor="#4dd69c" />
          </linearGradient>
        </defs>
        <path className="demo-price-chart__grid" d="M0 28H330 M0 68H330 M0 108H330 M0 148H330" />
        <path className="demo-price-chart__area" d={`M${area} Z`} style={{ fill: "url(#demoPnlArea)" }} />
        <polyline className="demo-pnl-chart__line" points={line} />
        <circle className="demo-pnl-chart__point" cx="330" cy="166" r="5.5" />
      </svg>
      <div className="demo-pnl-chart__footer">
        <span>Pre-trade</span>
        <span>Repriced</span>
        <span>Post-trade</span>
      </div>
    </div>
  );
}

function IntroModal({ onStart, onSkip }) {
  return (
    <div className="demo-modal-overlay" role="dialog" aria-modal="true" aria-label="Guided Trading Day">
      <div className="demo-modal">
        <span className="demo-kicker">Guided Trading Day</span>
        <h1>Explore how the platform turns market data into validated trading decisions.</h1>
        <div className="demo-workflow">
          {["Market", "Scanner", "Strategy", "Approval", "Execution", "Portfolio", "Validation", "Playbook"].map((item, index, array) => (
            <div className="demo-workflow__node" key={item}>
              <span>{item}</span>
              {index < array.length - 1 ? <i aria-hidden="true" /> : null}
            </div>
          ))}
        </div>
        <div className="demo-modal__actions">
          <button className="demo-banner__button demo-banner__button--primary" onClick={onStart} type="button">
            Start Demo
          </button>
          <button className="demo-banner__button" onClick={onSkip} type="button">
            Skip tour
          </button>
        </div>
      </div>
    </div>
  );
}

function DemoHeader({ currentStep, currentIndex, onBack, onNext, onRestart }) {
  return (
    <div className="demo-mission-shell">
      <div className="demo-banner demo-banner--mission">
        <div className="demo-banner__copy">
          <span className="demo-kicker">Guided Trading Day</span>
          <strong>Demo data only</strong>
          <p>{currentStep.summary}</p>
        </div>
        <div className="demo-banner__status">
          <span className="demo-progress-count">
            {currentIndex + 1} / {MISSION_STEPS.length}
          </span>
          <strong>{currentStep.title}</strong>
        </div>
      </div>
      <div className="demo-progress-row">
        {MISSION_STEPS.map((step, index) => (
          <button
            className={`demo-progress-dot${index === currentIndex ? " is-active" : index < currentIndex ? " is-complete" : ""}`}
            key={`${step.title}-${index}`}
            onClick={() => navigateTo(buildMissionRoute(index))}
            type="button"
          >
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
      <div className="demo-shell-actions">
        <button className="demo-banner__button" disabled={currentIndex === 0} onClick={onBack} type="button">
          Back
        </button>
        <button className="demo-banner__button demo-banner__button--primary" onClick={onNext} type="button">
          {currentIndex === MISSION_STEPS.length - 1 ? "Mission Complete" : "Next"}
        </button>
        <button className="demo-banner__button" onClick={onRestart} type="button">
          Restart mission
        </button>
        <button className="demo-banner__button" onClick={() => navigateTo("/register")} type="button">
          Create Account
        </button>
      </div>
    </div>
  );
}

function DashboardScene({ data }) {
  const payload = data?.payload;
  if (!payload) return null;

  return (
    <section className="demo-grid">
      <div className="demo-card demo-card--hero">
        <div className="demo-card__header">
          <div>
            <span className="demo-kicker">Step 1</span>
            <h2>Market Opens</h2>
          </div>
          <div className="demo-chip-row">
            <ExplainerChip label="Demo only" text="This is a guided sample environment. It never reads a real account or runs a live broker session." />
            <ExplainerChip label="Paper-only" text="Every execution shown in the demo is simulated. Real execution remains locked behind verification, approvals, safety, and broker checks." />
          </div>
        </div>
        <div className="demo-hero-grid">
          <div className="demo-hero-copy-block">
            <strong className="demo-hero-value">{payload.marketOpen.regime}</strong>
            <p>{payload.marketOpen.marketTone}</p>
          </div>
          <div className="demo-stack">
            <DemoMetricPlain label="Deployment set" value={payload.marketOpen.activeDeploymentSet} helper={payload.marketOpen.universe} hotspot="The active deployment set decides which validated strategy currently owns each market context." />
            <DemoMetricPlain label="System status" value={payload.marketOpen.systemStatus} helper={payload.missionSnapshot.brokerState} hotspot="The demo keeps execution paper-only to teach the workflow without exposing real broker access." />
          </div>
          <HistoricalPricePreview />
        </div>
      </div>

      <div className="demo-card">
        <h3>Deployment lineup</h3>
        <ul className="demo-list">
          {payload.deploymentSet.map((item) => (
            <li key={item.strategy}>
              <strong>{item.strategy}</strong>
              <small>{item.regimes.join(", ")} · {item.sectors.join(", ")} · {item.status}</small>
            </li>
          ))}
        </ul>
      </div>

      <div className="demo-card">
        <h3>Risk dashboard</h3>
        <div className="demo-metric-grid demo-metric-grid--compact">
          <DemoMetricPlain label="Equity" value={`$${payload.riskSummary.accountEquity.toLocaleString()}`} />
          <DemoMetricPlain label="Cash" value={`$${payload.riskSummary.cash.toLocaleString()}`} />
          <DemoMetricPlain label="Daily risk usage" value={`${payload.riskSummary.dailyRiskUsagePct}%`} hotspot="Daily risk usage helps the system keep new trades inside configured loss and notional limits." />
          <DemoMetricPlain label="Open exposure" value={`${payload.riskSummary.openExposurePct}%`} />
        </div>
      </div>

      <div className="demo-card">
        <h3>Why this matters</h3>
        <div className="demo-chip-row">
          <ExplainerChip label="Routed by regime" text="Before scanning, the system already knows which validated strategy is supposed to act in this environment." />
          <ExplainerChip label="Validated strategy" text="Only strategies that pass readiness, walk-forward, and robustness gates become part of the deployment set." />
          <ExplainerChip label="Read-only" text="You can inspect the whole loop in demo mode, but you cannot mutate approvals, strategies, settings, or brokers." />
        </div>
      </div>
    </section>
  );
}

function ScannerScene({ data, currentStepIndex, selectedSymbol, setSelectedSymbol, filter, setFilter, scanStageIndex }) {
  const payload = data?.payload;
  if (!payload) return null;

  const visibleRows = payload.opportunities.filter((item) =>
    filter === "ALL" ? true : item.disposition === filter
  );
  const detail = payload.opportunities.find((item) => item.symbol === selectedSymbol) || payload.opportunityDetail;

  return (
    <section className="demo-grid">
      <div className="demo-card demo-card--hero">
        <div className="demo-card__header">
          <div>
            <span className="demo-kicker">{currentStepIndex === 1 ? "Step 2" : "Step 3"}</span>
            <h2>{currentStepIndex === 1 ? "Scanner Finds Opportunities" : "Inspect Opportunity"}</h2>
          </div>
          <div className="demo-chip-row">
            <ExplainerChip label="Why this matters" text="The scanner narrows a broad market into a few context-aware ideas before any approval or execution path opens." />
            <ExplainerChip label="Demo only" text="The scan progress animation is a guided visualization. It never hits the real scanner endpoint in demo mode." />
          </div>
        </div>
        <div className="demo-scan-progress">
          {payload.progressStages.map((stage, index) => (
            <div className={`demo-scan-progress__step${index <= scanStageIndex ? " is-active" : ""}`} key={stage}>
              <i aria-hidden="true" />
              <span>{stage}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="demo-card">
        <div className="demo-section-header">
          <div>
            <h3>Opportunity board</h3>
            <small>Highlighted outcome: AMD now, NVDA watch, XOM avoid.</small>
          </div>
          <div className="demo-pill-row">
            {payload.filters.map((item) => (
              <button
                className={`demo-filter-pill${item === filter ? " is-active" : ""}`}
                key={item}
                onClick={() => setFilter(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="demo-table">
          <div className="demo-table__head">
            <span>Symbol</span>
            <span>Disposition</span>
            <span>Strategy</span>
            <span>Regime</span>
            <span>Score</span>
          </div>
          {visibleRows.map((item) => (
            <button
              className={`demo-table__row${item.symbol === selectedSymbol ? " is-selected" : ""}`}
              key={item.symbol}
              onClick={() => setSelectedSymbol(item.symbol)}
              type="button"
            >
              <span>
                <strong>{item.symbol}</strong>
                <small>{item.company}</small>
              </span>
              <span>{item.disposition}</span>
              <span>{item.strategyVersion}</span>
              <span>{item.regime}</span>
              <span>{item.opportunityScore}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="demo-card">
        <div className="demo-section-header">
          <div>
            <h3>{detail.symbol} detail</h3>
            <small>Selected as the clearest sample opportunity for today&apos;s guided mission.</small>
          </div>
          <Hotspot label="Scanner score explainer" text="Opportunity scoring combines signal quality, validation confidence, strategy fit, and current portfolio context." />
        </div>
        <div className="demo-metric-grid demo-metric-grid--compact">
          <DemoMetric label="Score" value={detail.opportunityScore || payload.opportunityDetail.score} hotspot="Score ranks the setup relative to the rest of the day’s candidates after risk and strategy filters." />
          <DemoMetric label="Confidence" value={`${Math.round((detail.confidence || payload.opportunityDetail.confidence) * 100)}%`} hotspot="Confidence comes from post-trade validation and calibration, not just the raw trading signal." />
          <DemoMetric label="Strategy version" value={detail.strategyVersion || payload.opportunityDetail.strategyVersion} hotspot="Every signal is attributed to a specific version-controlled strategy so the team can learn which research build generated it." />
        </div>
        <ul className="demo-list">
          {(payload.opportunityDetail.validationEvidence || []).map((item) => (
            <li key={item}>{item}</li>
          ))}
          <li><strong>News / risk context:</strong> {payload.opportunityDetail.newsRiskContext}</li>
          <li><strong>Portfolio fit:</strong> {payload.opportunityDetail.portfolioFit}</li>
        </ul>
      </div>
    </section>
  );
}

function StrategyScene({ data, compareMode, setCompareMode, showTimeline, setShowTimeline }) {
  const payload = data?.payload;
  if (!payload) return null;

  return (
    <section className="demo-grid">
      <div className="demo-card demo-card--hero">
        <div className="demo-card__header">
          <div>
            <span className="demo-kicker">Step 4</span>
            <h2>Strategy Attribution</h2>
          </div>
          <div className="demo-chip-row">
            <ExplainerChip label="Routed by regime" text="The scanner does not choose a random model. It resolves one strategy owner for the current sector and regime cell." />
            <ExplainerChip label="Validated strategy" text="Only strategies that pass readiness, validation, walk-forward, and robustness checks stay eligible for deployment." />
          </div>
        </div>
        <div className="demo-attribution-grid">
          <DemoMetric label="Selected symbol" value={payload.attribution.selectedSymbol} />
          <DemoMetric label="Selected by" value={payload.attribution.selectedBy} hotspot="Version-controlled strategy research lets the team attribute every decision to a specific build and evidence trail." />
          <DemoMetric label="Readiness gate" value={payload.attribution.readinessGate} />
          <DemoMetric label="Walk-forward" value={payload.attribution.walkForwardStatus} />
        </div>
      </div>

      <div className="demo-card">
        <div className="demo-section-header">
          <div>
            <h3>Strategy comparison</h3>
            <small>Compare the current routing owner with fallback strategies.</small>
          </div>
          <button className="demo-banner__button" onClick={() => setCompareMode((current) => !current)} type="button">
            {compareMode ? "Hide compare" : "Compare strategies"}
          </button>
        </div>
        {compareMode ? (
          <div className="demo-compare-table">
            <div className="demo-compare-table__head">
              <span>Metric</span>
              <span>Momentum Lab v12</span>
              <span>Defensive Reversion v4</span>
              <span>Breakout Guard v3</span>
            </div>
            {payload.comparison.map((row) => (
              <div className="demo-compare-table__row" key={row.metric}>
                <span>{row.metric}</span>
                <span>{row.momentum}</span>
                <span>{row.defensive}</span>
                <span>{row.breakout}</span>
              </div>
            ))}
          </div>
        ) : (
          <ul className="demo-list">
            {payload.strategies.map((item) => (
              <li key={item.name}>
                <strong>{item.name}</strong>
                <small>{item.note}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="demo-card">
        <div className="demo-section-header">
          <div>
            <h3>Version timeline</h3>
            <small>See how strategy research stays version-controlled over time.</small>
          </div>
          <button className="demo-banner__button" onClick={() => setShowTimeline((current) => !current)} type="button">
            {showTimeline ? "Hide timeline" : "Open version timeline"}
          </button>
        </div>
        {showTimeline ? (
          <ul className="demo-list">
            {payload.versionTimeline.map((item) => (
              <li key={item.version}>
                <strong>{item.version}</strong>
                <small>{item.note}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="demo-copy-muted">Open the timeline to inspect how the model evolved from v10 to v12.</p>
        )}
      </div>
    </section>
  );
}

function ApprovalsScene({ data, currentStepIndex, selectedApprovalId, setSelectedApprovalId, showBlockedReason, setShowBlockedReason, showExecutionPath, setShowExecutionPath }) {
  const payload = data?.payload;
  if (!payload) return null;
  const selectedApproval =
    payload.approvals.find((item) => item.id === selectedApprovalId) ||
    payload.approvals[0];

  return (
    <section className="demo-grid">
      <div className="demo-card demo-card--hero">
        <div className="demo-card__header">
          <div>
            <span className="demo-kicker">{currentStepIndex === 4 ? "Step 5" : currentStepIndex === 5 ? "Step 6" : "Step 7"}</span>
            <h2>
              {currentStepIndex === 4
                ? "Approval Gate"
                : currentStepIndex === 5
                  ? "Blocked Bad Trade"
                  : "Paper Execution Preview"}
            </h2>
          </div>
          <div className="demo-chip-row">
            <ExplainerChip label="Human-in-the-loop safety" text="Approvals force every candidate through a human-readable risk and safety review before any broker path is even previewed." />
            <ExplainerChip label="Read-only" text="Demo approvals can be opened and compared, but never approved, rejected, or executed." />
          </div>
        </div>
        <div className="demo-pill-row">
          <ExplainerChip label="Blocked by safety" text={payload.blockedTrade.reason} />
          <ExplainerChip label="Why this matters" text="The platform’s value is not only surfacing good trades. It also blocks bad ones before they become portfolio damage." />
          <ExplainerChip label="Paper-only" text="Even approved trades shown here stop at a simulation preview in the guided demo." />
        </div>
      </div>

      <div className="demo-card">
        <h3>Approval queue</h3>
        <div className="demo-approval-stack">
          {payload.approvals.map((item) => (
            <button
              className={`demo-approval-card${item.id === selectedApproval.id ? " is-selected" : ""}`}
              key={item.id}
              onClick={() => setSelectedApprovalId(item.id)}
              type="button"
            >
              <strong>{item.symbol}</strong>
              <span>{item.status}</span>
              <small>{item.strategy}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="demo-card">
        <div className="demo-section-header">
          <div>
            <h3>{selectedApproval.symbol} approval detail</h3>
            <small>{selectedApproval.note}</small>
          </div>
          <Hotspot label="Approval gate explainer" text="The approval gate explains the trade, checks safety, and records the decision context before any paper execution is allowed." />
        </div>
        <div className="demo-metric-grid demo-metric-grid--compact">
          <DemoMetric label="Pending approval" value={payload.approvalDetail.pendingApproval ? "Yes" : "No"} />
          <DemoMetric label="Pre-trade risk" value={payload.approvalDetail.preTradeRisk} />
          <DemoMetric label="Position sizing" value={payload.approvalDetail.positionSizeAdjustment} helper="Risk-aware sizing adjusts the raw idea before it becomes a potential order." />
        </div>
        <ul className="demo-list">
          {payload.approvalDetail.safetyChecklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
          <li><strong>Approval note:</strong> {payload.approvalDetail.approvalNote}</li>
        </ul>
        <div className="demo-action-grid">
          <DisabledAction label="Approve trade" />
          <DisabledAction label="Execute order" />
        </div>
      </div>

      <div className="demo-card">
        <div className="demo-section-header">
          <div>
            <h3>Safety block and execution preview</h3>
            <small>Demonstrate how the platform explains a blocked trade and previews the paper-only path.</small>
          </div>
          <div className="demo-pill-row">
            <button className="demo-banner__button" onClick={() => setShowBlockedReason((current) => !current)} type="button">
              {showBlockedReason ? "Hide block reason" : "See why NVDA was blocked"}
            </button>
            <button className="demo-banner__button" onClick={() => setShowExecutionPath((current) => !current)} type="button">
              {showExecutionPath ? "Hide execution path" : "View simulated execution path"}
            </button>
          </div>
        </div>
        {showBlockedReason ? (
          <div className="demo-inline-panel">
            <strong>{payload.blockedTrade.symbol} blocked</strong>
            <p>{payload.blockedTrade.reason}</p>
          </div>
        ) : null}
        {showExecutionPath ? (
          <div className="demo-inline-panel">
            <strong>Paper execution preview</strong>
            <p>{payload.executionPreview.paperOnlyOutcome}</p>
            <ul className="demo-list">
              <li>Broker disabled: {payload.executionPreview.brokerDisabled ? "Yes" : "No"}</li>
              <li>Ledger preview: {payload.executionPreview.ledgerPreview.symbol} · {payload.executionPreview.ledgerPreview.quantity} shares · ${payload.executionPreview.ledgerPreview.estimatedFill}</li>
              <li>Estimated fee: ${payload.executionPreview.ledgerPreview.fee}</li>
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PortfolioScene({ data }) {
  const payload = data?.payload;
  if (!payload) return null;

  return (
    <section className="demo-grid">
      <div className="demo-card demo-card--hero">
        <div className="demo-card__header">
          <div>
            <span className="demo-kicker">Step 8</span>
            <h2>Portfolio Update</h2>
          </div>
          <div className="demo-chip-row">
            <ExplainerChip label="Portfolio fit" text="Portfolio fit explains whether a new trade improves diversification or accidentally crowds existing exposure." />
            <ExplainerChip label="Ledger" text="Immutable paper accounting means every simulated execution has a durable portfolio and audit trail." />
          </div>
        </div>
        <div className="demo-metric-grid demo-metric-grid--compact">
          <DemoMetric label="Cash" value={`$${payload.summary.cash.toLocaleString()}`} />
          <DemoMetric label="Paper PnL" value={`$${payload.summary.paperPnL.toLocaleString()}`} />
          <DemoMetric label="Post-trade exposure" value={`${payload.summary.riskImpact.exposureAfterTradePct}%`} hotspot="Exposure impact lets the team see how one trade changes aggregate portfolio risk before execution." />
        </div>
        <PortfolioPnlPreview pnl={payload.summary.paperPnL} />
      </div>

      <div className="demo-card demo-card--plain">
        <h3>Positions</h3>
        <ul className="demo-list">
          {payload.positions.map((item) => (
            <li key={item.symbol}>
              <strong>{item.symbol}</strong>
              <small>{item.quantity} shares · ${item.marketValue.toLocaleString()} · {item.status}</small>
            </li>
          ))}
        </ul>
      </div>

      <div className="demo-card demo-card--plain">
        <h3>Impact preview</h3>
        <ul className="demo-list">
          <li>Cash after trade: ${payload.summary.riskImpact.cashAfterTrade.toLocaleString()}</li>
          <li>{payload.summary.riskImpact.sectorImpact}</li>
          {payload.summary.sectorAllocation.map((row) => (
            <li key={row.sector}>{row.sector}: {row.pct}%</li>
          ))}
        </ul>
      </div>

      <div className="demo-card demo-card--plain">
        <h3>Execution path</h3>
        <ol className="demo-list demo-list--ordered">
          {payload.executionPath.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ValidationScene({ data }) {
  const payload = data?.payload;
  if (!payload) return null;
  return (
    <section className="demo-grid">
      <div className="demo-card demo-card--hero">
        <div className="demo-card__header">
          <div>
            <span className="demo-kicker">Step 9</span>
            <h2>Validation</h2>
          </div>
          <div className="demo-chip-row">
            {payload.labels.map((label) => (
              <ExplainerChip
                key={label}
                label={label}
                text={
                  label === "Validated strategy"
                    ? "Post-trade validation measures whether the strategy is actually delivering what its confidence scores promise."
                    : label === "Why this matters"
                      ? "Validation closes the loop between predicted edge and observed outcome so future confidence stays grounded."
                      : "This panel uses sample outcomes only."
                }
              />
            ))}
          </div>
        </div>
        <p className="demo-copy-muted">Tomorrow, the system checks whether AMD behaved like a true high-confidence signal.</p>
      </div>

      <div className="demo-card">
        <div className="demo-section-header">
          <div>
            <h3>Confidence buckets</h3>
            <small>Expected versus actual win rate by confidence range.</small>
          </div>
          <Hotspot label="Confidence explainer" text="Confidence buckets show whether model certainty stays calibrated over time instead of drifting into false confidence." />
        </div>
        <div className="demo-compare-table">
          <div className="demo-compare-table__head">
            <span>Bucket</span>
            <span>Expected</span>
            <span>Actual</span>
          </div>
          {payload.confidenceBuckets.map((row) => (
            <div className="demo-compare-table__row" key={row.bucket}>
              <span>{row.bucket}</span>
              <span>{row.expectedWinRate}%</span>
              <span>{row.actualWinRate}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="demo-card">
        <h3>Sample outcome</h3>
        <ul className="demo-list">
          <li><strong>Expected:</strong> {payload.sampleOutcome.expected}</li>
          <li><strong>Actual:</strong> {payload.sampleOutcome.actual}</li>
          <li><strong>Calibration:</strong> {payload.sampleOutcome.calibration}</li>
        </ul>
      </div>
    </section>
  );
}

function PlaybookScene({ data }) {
  const payload = data?.payload;
  if (!payload) return null;
  return (
    <section className="demo-grid">
      <div className="demo-card demo-card--hero">
        <div className="demo-card__header">
          <div>
            <span className="demo-kicker">Step 10</span>
            <h2>Playbook</h2>
          </div>
          <div className="demo-chip-row">
            {payload.labels.map((label) => (
              <ExplainerChip
                key={label}
                label={label}
                text={
                  label === "Read-only"
                    ? "The demo lets you inspect the learning loop, but only verified users can save real playbook changes."
                    : label === "Validated strategy"
                      ? "Validated outcomes update the long-term evidence for the strategy version that generated the trade."
                      : "This is a demo summary, not a production playbook entry."
                }
              />
            ))}
          </div>
        </div>
        <p className="demo-copy-muted">{payload.versionNote}</p>
      </div>

      <div className="demo-card">
        <h3>Evidence update</h3>
        <ul className="demo-list">
          <li><strong>Lesson:</strong> {payload.strategyLesson}</li>
          <li><strong>Decision recorded:</strong> {payload.decisionRecorded}</li>
          <li><strong>Evidence updated:</strong> {payload.evidenceUpdated ? "Yes" : "No"}</li>
          <li><strong>Deployment score:</strong> {payload.deploymentScoreChange.previous} → {payload.deploymentScoreChange.current}</li>
        </ul>
      </div>

      <div className="demo-card">
        <h3>Mission Complete</h3>
        <ul className="demo-list">
          <li>✓ Scanned market</li>
          <li>✓ Inspected opportunity</li>
          <li>✓ Viewed strategy evidence</li>
          <li>✓ Passed approval</li>
          <li>✓ Saw safety block a bad trade</li>
          <li>✓ Previewed execution</li>
          <li>✓ Reviewed portfolio impact</li>
          <li>✓ Learned from validation</li>
        </ul>
        <div className="demo-action-grid">
          <button className="demo-banner__button demo-banner__button--primary" onClick={() => navigateTo("/register")} type="button">
            Create Account
          </button>
          <button className="demo-banner__button" onClick={() => navigateTo("/register")} type="button">
            Request Verification
          </button>
        </div>
      </div>
    </section>
  );
}

export default function DemoCockpitPage() {
  const [routePath, setRoutePath] = useState(getCurrentPath);
  const [demoData, setDemoData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showIntro, setShowIntro] = useState(() =>
    typeof window === "undefined"
      ? false
      : !window.sessionStorage.getItem(DEMO_INTRO_STORAGE_KEY)
  );
  const [scannerFilter, setScannerFilter] = useState("ALL");
  const [selectedSymbol, setSelectedSymbol] = useState("AMD");
  const [compareMode, setCompareMode] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [selectedApprovalId, setSelectedApprovalId] = useState("demo-appr-1");
  const [showBlockedReason, setShowBlockedReason] = useState(false);
  const [showExecutionPath, setShowExecutionPath] = useState(false);
  const [scanStageIndex, setScanStageIndex] = useState(0);

  const currentStepIndex = useMemo(() => findStepIndexByRoute(routePath), [routePath]);
  const currentStep = MISSION_STEPS[currentStepIndex];
  const activeTab = currentStep.tab;

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
  }, []);

  useEffect(() => {
    const handlePopState = () => setRoutePath(getCurrentPath());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const entries = await Promise.all(
          Object.entries(TAB_ENDPOINTS).map(async ([tab, endpoint]) => [tab, await readDemo(endpoint)])
        );
        if (!cancelled) {
          setDemoData(Object.fromEntries(entries));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentStepIndex !== 1) {
      setScanStageIndex(0);
      return;
    }

    let index = 0;
    setScanStageIndex(0);
    const interval = window.setInterval(() => {
      index += 1;
      setScanStageIndex(Math.min(index, 3));
      if (index >= 3) {
        window.clearInterval(interval);
      }
    }, 700);
    return () => window.clearInterval(interval);
  }, [currentStepIndex]);

  function dismissIntro() {
    window.sessionStorage.setItem(DEMO_INTRO_STORAGE_KEY, "true");
    setShowIntro(false);
  }

  function handleStartDemo() {
    dismissIntro();
    navigateTo(buildMissionRoute(0));
  }

  function handleTabChange(tab) {
    const targetPath = DEMO_TAB_ROUTE[tab] || "/demo";
    const firstMatchingStepIndex = MISSION_STEPS.findIndex((step) => step.tab === tab && step.route === targetPath);
    navigateTo(firstMatchingStepIndex >= 0 ? buildMissionRoute(firstMatchingStepIndex) : targetPath);
  }

  function handleBack() {
    if (currentStepIndex <= 0) return;
    navigateTo(buildMissionRoute(currentStepIndex - 1));
  }

  function handleNext() {
    if (currentStepIndex >= MISSION_STEPS.length - 1) return;
    navigateTo(buildMissionRoute(currentStepIndex + 1));
  }

  function handleRestart() {
    setScannerFilter("ALL");
    setSelectedSymbol("AMD");
    setCompareMode(false);
    setShowTimeline(false);
    setSelectedApprovalId("demo-appr-1");
    setShowBlockedReason(false);
    setShowExecutionPath(false);
    setScanStageIndex(0);
    setShowIntro(true);
    window.sessionStorage.removeItem(DEMO_INTRO_STORAGE_KEY);
    navigateTo(buildMissionRoute(0));
  }

  const scene = useMemo(() => {
    if (loading) {
      return <div className="demo-empty-state">Loading guided trading day…</div>;
    }
    if (error) {
      return <div className="demo-empty-state">Unable to load demo data: {error}</div>;
    }

    switch (currentStep.tab) {
      case "Dashboard":
        return <DashboardScene data={demoData.Dashboard} />;
      case "Scanner":
        return (
          <ScannerScene
            currentStepIndex={currentStepIndex}
            data={demoData.Scanner}
            filter={scannerFilter}
            scanStageIndex={scanStageIndex}
            selectedSymbol={selectedSymbol}
            setFilter={setScannerFilter}
            setSelectedSymbol={setSelectedSymbol}
          />
        );
      case "Strategy Lab":
        return (
          <StrategyScene
            compareMode={compareMode}
            data={demoData["Strategy Lab"]}
            setCompareMode={setCompareMode}
            setShowTimeline={setShowTimeline}
            showTimeline={showTimeline}
          />
        );
      case "Approvals":
        return (
          <ApprovalsScene
            currentStepIndex={currentStepIndex}
            data={demoData.Approvals}
            selectedApprovalId={selectedApprovalId}
            setSelectedApprovalId={setSelectedApprovalId}
            setShowBlockedReason={setShowBlockedReason}
            setShowExecutionPath={setShowExecutionPath}
            showBlockedReason={showBlockedReason}
            showExecutionPath={showExecutionPath}
          />
        );
      case "Portfolio":
        return <PortfolioScene data={demoData.Portfolio} />;
      case "Validation":
        return <ValidationScene data={demoData.Validation} />;
      case "Playbook":
        return <PlaybookScene data={demoData.Playbook} />;
      default:
        return null;
    }
  }, [
    compareMode,
    currentStep.tab,
    currentStepIndex,
    demoData,
    error,
    loading,
    scanStageIndex,
    scannerFilter,
    selectedApprovalId,
    selectedSymbol,
    showBlockedReason,
    showExecutionPath,
    showTimeline,
  ]);

  return (
    <AppShell
      activeTab={activeTab}
      hideThemeToggle
      logoutLabel="Exit demo"
      onLogout={() => navigateTo("/")}
      onTabChange={handleTabChange}
      onThemeToggle={() => {}}
      tabSections={DEMO_SECTIONS}
      tabs={Object.keys(DEMO_TAB_ROUTE)}
      theme="dark"
      user={DEMO_USER}
    >
      <div className="demo-shell">
        {showIntro ? <IntroModal onSkip={dismissIntro} onStart={handleStartDemo} /> : null}
        <DemoHeader
          currentIndex={currentStepIndex}
          currentStep={currentStep}
          onBack={handleBack}
          onNext={handleNext}
          onRestart={handleRestart}
        />
        <div className="demo-banner">
          <div className="demo-banner__body">
            <strong>Demo Mode</strong>
            <span>Sample data only. Sign up and get verified to use the full cockpit.</span>
          </div>
          <div className="demo-banner__actions">
            <button className="demo-banner__button demo-banner__button--primary" onClick={() => navigateTo("/register")} type="button">
              Create Account
            </button>
            <button className="demo-banner__button" onClick={() => navigateTo("/login")} type="button">
              Sign In
            </button>
          </div>
        </div>
        {scene}
      </div>
    </AppShell>
  );
}
