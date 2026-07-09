import { useState } from "react";
import { motion } from "framer-motion";
import styles from "../LandingPage.module.css";

const workflowPreview = [
  {
    id: "idea",
    label: "Idea",
    title: "New opportunity detected",
    copy: "Scanner finds a candidate and attaches market, thesis, and source context.",
    metrics: [
      ["Symbol", "RKLB"],
      ["Market", "NASDAQ · US"],
      ["Signal", "BUY"],
    ],
  },
  {
    id: "score",
    label: "Score",
    title: "Evidence score generated",
    copy: "Signals are ranked with confidence, backtest context, and recent market behavior.",
    metrics: [
      ["Score", "78.4"],
      ["Confidence", "84"],
      ["Backtest", "18.6%"],
    ],
  },
  {
    id: "risk",
    label: "Risk",
    title: "Portfolio impact checked",
    copy: "The system checks concentration, downside, exposure, and position size before execution.",
    metrics: [
      ["Exposure", "46% → 52%"],
      ["Max loss", "$312"],
      ["Size", "Reduced"],
    ],
  },
  {
    id: "approval",
    label: "Approval",
    title: "Review before trading",
    copy: "Approve only when the proposed trade explains its thesis, risk, and expected impact.",
    metrics: [
      ["Thesis", "Bullish"],
      ["Risk", "Medium"],
      ["Decision", "Review"],
    ],
  },
  {
    id: "review",
    label: "Review",
    title: "Outcome stored",
    copy: "Every trade becomes part of the feedback loop for validation and playbook learning.",
    metrics: [
      ["Return", "Tracked"],
      ["Sharpe", "0.87"],
      ["Notes", "Saved"],
    ],
  },
];

export default function Hero({ onLogin, onThemeToggle, theme }) {
  const [activeStepId, setActiveStepId] = useState("score");
  const activeStep = workflowPreview.find((step) => step.id === activeStepId) ?? workflowPreview[0];

  return (
    <section className={styles.hero}>
      <nav className={styles.nav}>
        <div>
          <span>QUANT'S TRADE</span>
          <strong>Trading Cockpit</strong>
        </div>
        <div className={styles.navActions}>
          <button onClick={onThemeToggle} type="button">
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button onClick={onLogin} type="button">Sign In</button>
        </div>
      </nav>

      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>Evidence-based trading operating system</p>
        <h1>
          Stop making{" "}
          <span className={styles.heroAccent}>isolated</span>{" "}
          <span className={styles.heroAccent}>trading</span>{" "}
          <span className={styles.heroAccent}>decisions</span>.
        </h1>
        <p>
          Research, score, approve, size, and review every trade in one connected
          workflow before capital is deployed.
        </p>
        <div className={styles.heroActions}>
          <button className={styles.primaryButton} onClick={onLogin} type="button">
            Enter Trading Cockpit
          </button>
          <a className={styles.secondaryButton} href="#workflow">
            View Workflow
          </a>
        </div>
      </div>

      <motion.aside
        animate={{ y: [0, -8, 0] }}
        className={styles.heroProductFrame}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className={styles.productChrome}>
          <span />
          <span />
          <span />
          <strong>Workflow Preview</strong>
        </div>
        <div className={styles.heroWorkflowMockup}>
          <div className={styles.heroStepTabs}>
            {workflowPreview.map((step) => (
              <button
                className={step.id === activeStepId ? styles.activeHeroStep : ""}
                key={step.id}
                onClick={() => setActiveStepId(step.id)}
                type="button"
              >
                {step.label}
              </button>
            ))}
          </div>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={styles.heroWorkflowPanel}
            initial={{ opacity: 0, y: 8 }}
            key={activeStep.id}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className={styles.heroWorkflowHeader}>
              <span>{activeStep.label}</span>
              <strong>{activeStep.title}</strong>
            </div>
            <div className={styles.heroMetricGrid}>
              {activeStep.metrics.map(([label, value]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <p>{activeStep.copy}</p>
            <div className={styles.heroDecisionRail}>
              <span>Connected record</span>
              <strong>{workflowPreview.findIndex((step) => step.id === activeStep.id) + 1} / {workflowPreview.length}</strong>
            </div>
          </motion.div>
        </div>
      </motion.aside>
    </section>
  );
}
