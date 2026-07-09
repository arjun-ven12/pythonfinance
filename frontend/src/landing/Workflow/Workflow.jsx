import { workflowSteps } from "../landingData";
import styles from "../LandingPage.module.css";

export default function Workflow({ activeStep, onStep }) {
  const step = workflowSteps.find((item) => item.key === activeStep) || workflowSteps[0];

  return (
    <section className={styles.workflow}>
      <div className={styles.sectionIntro}>
        <span>Strategy timeline</span>
        <h2>Click a step to see what enters, exits, and gets stored.</h2>
      </div>
      <div className={styles.timeline}>
        {workflowSteps.map((item) => (
          <button
            className={item.key === activeStep ? styles.activeTimelineStep : ""}
            key={item.key}
            onClick={() => onStep(item.key)}
            type="button"
          >
            {item.key}
          </button>
        ))}
      </div>
      <article className={styles.workflowCard}>
        <div><span>Inputs</span><strong>{step.input}</strong></div>
        <div><span>Outputs</span><strong>{step.output}</strong></div>
        <div><span>Evidence</span><strong>{step.evidence}</strong></div>
      </article>
    </section>
  );
}
