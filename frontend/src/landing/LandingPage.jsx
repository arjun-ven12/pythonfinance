import { useState } from "react";
import styles from "./LandingPage.module.css";

const WORKFLOW = [
  ["01", "Idea", "Generate candidates from a selected market, universe, and strategy."],
  ["02", "Score", "Rank opportunities with confidence, backtest context, and regime inputs."],
  ["03", "Risk check", "Evaluate stop risk, sizing, exposure, liquidity, and safety rules."],
  ["04", "Approval", "Approve, reject, snooze, or reduce size with an audit trail."],
  ["05", "Portfolio", "See cash, concentration, open risk, and exposure before execution."],
  ["06", "Review", "Validate outcomes and fold the evidence back into the playbook."],
];

const SAFEGUARDS = [
  ["Human approval", "Proposed trades wait for review before any paper execution."],
  ["Risk manager", "Loss limits, exposure checks, concentration, and a kill switch stay central."],
  ["Immutable ledger", "Paper fills and fees become accounting events, not mutable guesses."],
  ["Validation loop", "Confidence is measured against outcomes, so conviction can be tested."],
];

const CHIPS = [
  "I scan manually",
  "I execute too quickly",
  "I want validation",
  "I research strategies",
];

function ArrowRightIcon() {
  return (
    <svg aria-hidden="true" className={styles.icon} viewBox="0 0 16 16">
      <path d="M3 8h8.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m8.5 4 4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className={styles.icon} viewBox="0 0 16 16">
      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className={styles.safeIconSvg} viewBox="0 0 20 20">
      <path d="M10 2.5 4.5 4.8v4.8c0 4 2.2 6.6 5.5 7.9 3.3-1.3 5.5-3.9 5.5-7.9V4.8Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="m7.3 10.2 1.7 1.7 3.7-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function UserCheckIcon() {
  return (
    <svg aria-hidden="true" className={styles.safeIconSvg} viewBox="0 0 20 20">
      <circle cx="8" cy="6.5" fill="none" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.8 15c.9-2.3 2.7-3.5 5.2-3.5S13.3 12.7 14.2 15" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="m13.5 8.8 1.4 1.4 2.3-2.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className={styles.safeIconSvg} viewBox="0 0 20 20">
      <rect fill="none" height="7.5" rx="1.8" stroke="currentColor" strokeWidth="1.7" width="9" x="5.5" y="9" />
      <path d="M7.5 9V7.4a2.5 2.5 0 0 1 5 0V9" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg aria-hidden="true" className={styles.safeIconSvg} viewBox="0 0 20 20">
      <path d="M4.5 7a4 4 0 0 1 4-4h5.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="m12.3 1.8 2 1.2-2 1.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M15.5 13a4 4 0 0 1-4 4H5.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="m7.7 17 -2-1.2 2-1.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

const SAFE_ICONS = [UserCheckIcon, ShieldIcon, LockIcon, RepeatIcon];

function ProductChrome({ label }) {
  return (
    <div className={styles.productChrome}>
      <span className={`${styles.dot} ${styles.red}`} />
      <span className={`${styles.dot} ${styles.yellow}`} />
      <span className={`${styles.dot} ${styles.green}`} />
      <em>{label}</em>
    </div>
  );
}

function ScorePreview() {
  const steps = [
    {
      key: "Idea",
      eyebrow: "Idea",
      heading: "New opportunity detected",
      note: "Scanner finds a candidate, tags the market context, and attaches the first layer of evidence before it reaches the queue.",
      stats: [
        ["Symbol", "RKLB", styles.inkStat],
        ["Market", "US", styles.accent],
        ["Signal", "BUY", styles.pos],
      ],
      progress: 1,
    },
    {
      key: "Score",
      eyebrow: "Score",
      heading: "Evidence score generated",
      note: "Signals are ranked on confidence, backtest context, and recent market behaviour — never a bare price cross.",
      stats: [
        ["Score", "78.4", styles.pos],
        ["Confidence", "84", styles.accent],
        ["Backtest", "+18.6%", styles.pos],
      ],
      progress: 2,
    },
    {
      key: "Risk",
      eyebrow: "Risk",
      heading: "Portfolio impact checked",
      note: "Position sizing, concentration, liquidity, and downside are reviewed before the trade can move closer to execution.",
      stats: [
        ["Exposure", "52%", styles.warn],
        ["Max loss", "$312", styles.neg],
        ["Size", "Reduced", styles.accent],
      ],
      progress: 3,
    },
    {
      key: "Approval",
      eyebrow: "Approval",
      heading: "Review before trading",
      note: "The trade has to explain itself. Thesis, risk, and safety findings are presented together before approval is possible.",
      stats: [
        ["Queue", "Pending", styles.warn],
        ["Safety", "Medium", styles.warn],
        ["Action", "Review", styles.accent],
      ],
      progress: 4,
    },
    {
      key: "Review",
      eyebrow: "Review",
      heading: "Outcome stored",
      note: "Every decision feeds the research loop, so returns, notes, and quality of execution improve the next version of the system.",
      stats: [
        ["Return", "+6.4%", styles.pos],
        ["Sharpe", "1.28", styles.accent],
        ["Notes", "Logged", styles.inkStat],
      ],
      progress: 5,
    },
  ];
  const [activeStep, setActiveStep] = useState("Score");
  const currentStep = steps.find((step) => step.key === activeStep) ?? steps[1];

  return (
    <div className={styles.heroPreview}>
      <div className={styles.previewGlow} />
      <div className={styles.previewShell}>
        <ProductChrome label="Workflow preview" />
        <div aria-label="Workflow preview steps" className={styles.previewTabs} role="tablist">
          {steps.map((step) => (
            <button
              aria-selected={step.key === currentStep.key}
              className={step.key === currentStep.key ? styles.previewTabActive : styles.previewTab}
              key={step.key}
              onClick={() => setActiveStep(step.key)}
              role="tab"
              type="button"
            >
              {step.key}
            </button>
          ))}
        </div>
        <div className={styles.previewBody} key={currentStep.key}>
          <span className={styles.previewEyebrow}>{currentStep.eyebrow}</span>
          <strong className={styles.previewHeading}>{currentStep.heading}</strong>
          <div className={styles.previewStats}>
            {currentStep.stats.map(([label, value, tone]) => (
              <div className={styles.previewStat} key={label}>
                <span>{label}</span>
                <strong className={`${styles.mono} ${tone}`}>{value}</strong>
              </div>
            ))}
          </div>
          <p className={styles.previewNote}>{currentStep.note}</p>
          <div className={styles.previewRecord}>
            <span>Connected record</span>
            <div className={styles.previewSteps}>
              {steps.map((step, index) => (
                <i className={index < currentStep.progress ? styles.stepOn : ""} key={step.key} />
              ))}
            </div>
            <b className={styles.mono}>{currentStep.progress} / 5</b>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScannerPreview() {
  const rows = [
    ["RKLB", "BUY", "78.4", "84", "USD 110.08", styles.pos, 78],
    ["D05.SI", "BUY", "66.1", "72", "SGD 48.20", styles.pos, 66],
    ["NVDA", "HOLD", "61.8", "69", "USD 144.31", styles.warn, 62],
  ];

  return (
    <div className={styles.previewBlock}>
      <div className={styles.previewShell}>
        <ProductChrome label="Scanner" />
        <div className={styles.ladderHead}>
          <span>Symbol</span>
          <span>Signal</span>
          <span>Score</span>
          <span className={styles.alignRight}>Conf</span>
          <span className={styles.alignRight}>Close</span>
        </div>
        {rows.map(([symbol, signal, score, confidence, close, tone, width]) => (
          <div className={styles.ladderRow} key={symbol}>
            <strong className={styles.mono}>{symbol}</strong>
            <span className={signal === "BUY" ? styles.signalPos : styles.signalWarn}>{signal}</span>
            <span className={styles.scoreCell}>
              <b className={styles.mono}>{score}</b>
              <span className={styles.scoreBar}>
                <i className={tone} style={{ width: `${width}%` }} />
              </span>
            </span>
            <span className={`${styles.mono} ${styles.alignRight} ${styles.tableCell}`}>{confidence}</span>
            <span className={`${styles.mono} ${styles.alignRight} ${styles.tableCell}`}>{close}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalPreview() {
  return (
    <div className={styles.previewBlock}>
      <div className={styles.previewShell}>
        <ProductChrome label="Approval queue" />
        <div className={styles.approvalPreview}>
          <div className={styles.approvalIdentity}>
            <strong className={styles.mono}>RKLB</strong>
            <span>BUY · pending review</span>
            <span className={`${styles.mono} ${styles.approvalSub}`}>Score 78.4 · Confidence 84</span>
          </div>
          <div className={styles.impactCard}>
            <span className={styles.previewEyebrow}>Pre-trade impact</span>
            <strong className={`${styles.previewRec} ${styles.warn}`}>Recommendation · Reduce size</strong>
            <div className={styles.impactRows}>
              <div><span>Max loss</span><b className={`${styles.mono} ${styles.neg}`}>$312</b></div>
              <div><span>Exposure</span><b className={styles.mono}>46% → 52%</b></div>
              <div><span>Safety</span><b className={`${styles.mono} ${styles.warn}`}>Medium</b></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioPreview() {
  return (
    <div className={styles.previewBlock}>
      <div className={styles.previewShell}>
        <ProductChrome label="Portfolio risk" />
        <div className={styles.portfolioGrid}>
          {[
            ["Equity", "$99,991", ""],
            ["Cash", "52.7%", styles.accent],
            ["Exposure", "47.3%", ""],
            ["Open risk", "2.1%", styles.pos],
          ].map(([label, value, tone]) => (
            <div className={styles.portfolioStat} key={label}>
              <span>{label}</span>
              <strong className={`${styles.mono} ${tone}`}>{value}</strong>
            </div>
          ))}
        </div>
        <div className={styles.constructCard}>
          <span className={styles.previewEyebrow}>Construction recommendation</span>
          <strong>Diversify before adding more Communications exposure.</strong>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({
  onDemo,
  onLogin,
  onRegister,
  onThemeToggle,
  theme,
}) {
  const [selectedChip, setSelectedChip] = useState("I want validation");

  return (
    <div className={styles.landing}>
      <header className={styles.nav}>
        <div className={styles.brand}>
          <span className={styles.eyebrow}>Quant&apos;s Trade</span>
          <strong>Trading Cockpit</strong>
        </div>
        <nav className={styles.navLinks}>
          <a href="#workflow">Workflow</a>
          <a href="#scanner">Scanner</a>
          <a href="#safeguards">Safeguards</a>
          <button className={styles.linkButton} onClick={onThemeToggle} type="button">
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button className={`${styles.button} ${styles.ghostButton} ${styles.smallButton}`} onClick={onLogin} type="button">
            Sign in
          </button>
          <button className={`${styles.button} ${styles.ghostButton} ${styles.smallButton}`} onClick={onDemo} type="button">
            View demo
          </button>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <span className={styles.tag}>
              <i />
              Evidence-based trading operating system
            </span>
            <h1 className={styles.heroTitle}>
              Stop making <span className={styles.grad}>isolated trading</span> decisions.
            </h1>
            <p className={styles.lede}>
              Research, score, approve, size, and review every trade in one connected workflow — before a dollar of capital is deployed.
            </p>
            <div className={styles.ctaRow}>
              <button className={`${styles.button} ${styles.primaryButton}`} onClick={onLogin} type="button">
                Enter trading cockpit
                <ArrowRightIcon />
              </button>
              <button className={`${styles.button} ${styles.ghostButton}`} onClick={onDemo} type="button">
                View demo
              </button>
              <button className={`${styles.button} ${styles.ghostButton}`} onClick={onRegister} type="button">
                Create account
              </button>
            </div>
            <div className={styles.heroMeta}>
              <span><b className={styles.mono}>6</b> connected stages</span>
              <span className={styles.metaDot} />
              <span><b className={styles.mono}>0</b> mock numbers</span>
              <span className={styles.metaDot} />
              <span>Paper-first, audit-backed</span>
            </div>
          </div>
          <ScorePreview />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <div className={styles.twoCopy}>
            <span className={`${styles.eyebrow} ${styles.accent}`}>Most traders use disconnected tools</span>
            <h2 className={styles.sectionTitle}>Signals, notes, sizing, and execution rarely share context.</h2>
            <p className={styles.sectionBody}>
              Scanners generate ideas. Spreadsheets track decisions. Brokers execute trades. Notes hold the reasoning.
              None of them understand each other — so the why behind a trade evaporates the moment it&apos;s placed.
            </p>
          </div>
          <div className={styles.disconnect}>
            <div className={styles.toolsGrid}>
              {["Scanner", "Spreadsheet", "Broker", "Notes"].map((item) => (
                <div className={styles.toolCard} key={item}>
                  <strong>{item}</strong>
                  <span>Separate context</span>
                </div>
              ))}
            </div>
            <div className={styles.connectedCard}>
              <span className={styles.connectedDot} />
              <div>
                <strong>One decision record</strong>
                <span>Idea, score, risk, approval, portfolio impact, and review stay linked.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionCenter}`} id="workflow">
        <span className={`${styles.eyebrow} ${styles.accent} ${styles.centerText}`}>Signature workflow</span>
        <h2 className={`${styles.sectionTitle} ${styles.centerText} ${styles.largeTitle}`}>
          Most trading tools stop at the signal.
          <br />
          <span className={styles.grad}>This one starts at the decision.</span>
        </h2>
        <div className={styles.thread}>
          <div className={styles.threadLine}><i /></div>
          {WORKFLOW.map(([number, title, description]) => (
            <div className={styles.stage} key={number}>
              <span className={styles.node}><b className={styles.mono}>{number}</b></span>
              <div className={styles.stageCard}>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} id="scanner">
        <div className={styles.twoColumn}>
          <div className={styles.twoCopy}>
            <span className={`${styles.eyebrow} ${styles.accent}`}>Scanner · opportunity discovery</span>
            <h2 className={styles.sectionTitle}>Find candidates without confusing signals for decisions.</h2>
            <p className={styles.sectionBody}>
              Ranked opportunities show signal, score, confidence, market, latest close, and the first pieces of thesis in one scan surface — sorted so the strongest names rise to the top.
            </p>
            <ul className={styles.features}>
              {["US and SGX universe support", "Confidence and score breakdowns", "Watchlist-aware scanning"].map((item) => (
                <li key={item}>
                  <CheckIcon />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <ScannerPreview />
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.twoColumn} ${styles.reverse}`}>
          <ApprovalPreview />
          <div className={styles.twoCopy}>
            <span className={`${styles.eyebrow} ${styles.accent}`}>Approval · trade reasoning</span>
            <h2 className={styles.sectionTitle}>See the trade before you take it.</h2>
            <p className={styles.sectionBody}>
              Every proposed order is reviewed with risk, thesis, safety checks, news context, and portfolio impact before approval — never placed on reflex.
            </p>
            <ul className={styles.features}>
              {["Pre-trade impact analysis", "Manual approval workflow", "Decision audit trail"].map((item) => (
                <li key={item}>
                  <CheckIcon />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <div className={styles.twoCopy}>
            <span className={`${styles.eyebrow} ${styles.accent}`}>Portfolio risk · construction</span>
            <h2 className={styles.sectionTitle}>Know what the trade does to the whole book.</h2>
            <p className={styles.sectionBody}>
              Portfolio views connect cash, exposure, open risk, concentration, construction recommendations, and accounting health — so one position never blindsides the rest.
            </p>
            <ul className={styles.features}>
              {["Ledger-backed paper portfolio", "Concentration warnings", "Construction recommendations"].map((item) => (
                <li key={item}>
                  <CheckIcon />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <PortfolioPreview />
        </div>
      </section>

      <section className={styles.section} id="safeguards">
        <span className={`${styles.eyebrow} ${styles.accent}`}>Safeguards</span>
        <h2 className={`${styles.sectionTitle} ${styles.wideTitle}`}>
          Every trade should explain itself before it reaches your portfolio.
        </h2>
        <div className={styles.safeguards}>
          {SAFEGUARDS.map(([title, description], index) => {
            const Icon = SAFE_ICONS[index];
            return (
              <div className={styles.safeCard} key={title}>
                <span className={styles.safeIcon}><Icon /></span>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.finalCard}>
          <div className={styles.finalGlow} />
          <span className={`${styles.eyebrow} ${styles.accent}`}>Before login</span>
          <h2 className={`${styles.sectionTitle} ${styles.largeTitle}`}>How do you trade today?</h2>
          <div className={styles.chips}>
            {CHIPS.map((chip) => (
              <button
                className={`${styles.chip} ${selectedChip === chip ? styles.chipActive : ""}`}
                key={chip}
                onClick={() => setSelectedChip(chip)}
                type="button"
              >
                {chip}
              </button>
            ))}
          </div>
          <p className={styles.finalSub}>
            Whatever the answer — prove confidence with outcomes, not gut feel.
          </p>
          <div className={styles.ctaRow}>
            <button className={`${styles.button} ${styles.primaryButton}`} onClick={onLogin} type="button">
              Sign in
              <ArrowRightIcon />
            </button>
            <button className={`${styles.button} ${styles.ghostButton}`} onClick={onRegister} type="button">
              Create account
            </button>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <span className={styles.eyebrow}>Quant&apos;s Trade</span>
          <strong>Trading Cockpit</strong>
        </div>
        <span className={styles.footerNote}>
          Evidence-based trading OS · paper execution only · not investment advice
        </span>
      </footer>
    </div>
  );
}
