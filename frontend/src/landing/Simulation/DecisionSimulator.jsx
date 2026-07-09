import { motion } from "framer-motion";
import styles from "../LandingPage.module.css";

const outcomes = {
  approve: {
    title: "Approved for paper review",
    expected: "Validation tracking starts after execution.",
    risk: "Portfolio exposure increases to 58%.",
    exposure: 58,
  },
  reject: {
    title: "Rejected",
    expected: "Opportunity leaves the approval queue.",
    risk: "No portfolio exposure change.",
    exposure: 46,
  },
  reduce: {
    title: "Reduced size",
    expected: "Trade stays reviewable with lower risk.",
    risk: "Portfolio exposure settles at 51%.",
    exposure: 51,
  },
};

export default function DecisionSimulator({ decision, onDecision }) {
  const outcome = outcomes[decision];

  return (
    <section className={styles.panelGrid}>
      <div className={styles.sectionIntro}>
        <span>Make a decision</span>
        <h2>Trading decisions should show consequences immediately.</h2>
        <p>
          The cockpit teaches the workflow by turning each approval action into
          visible risk, exposure, and validation consequences.
        </p>
      </div>

      <motion.article className={styles.decisionCard} layout>
        <div className={styles.symbolHeader}>
          <div>
            <span>RKLB</span>
            <strong>BUY</strong>
          </div>
          <b>Score 78</b>
        </div>
        <div className={styles.decisionMetrics}>
          <div><span>Confidence</span><strong>84</strong></div>
          <div><span>Stop Risk</span><strong>2.1%</strong></div>
          <div><span>Signal</span><strong>Momentum</strong></div>
        </div>
        <div className={styles.decisionButtons}>
          <button onClick={() => onDecision("approve")} type="button">Approve</button>
          <button onClick={() => onDecision("reject")} type="button">Reject</button>
          <button onClick={() => onDecision("reduce")} type="button">Reduce Size</button>
        </div>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={styles.outcomeCard}
          initial={false}
          key={decision}
        >
          <span>{outcome.title}</span>
          <p>{outcome.expected}</p>
          <div className={styles.exposureBar}>
            <i style={{ width: `${outcome.exposure}%` }} />
          </div>
          <strong>{outcome.risk}</strong>
        </motion.div>
      </motion.article>
    </section>
  );
}
