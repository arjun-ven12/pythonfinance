import { architectureNodes } from "../landingData";
import styles from "../LandingPage.module.css";

export default function TrustMap({ activeNode, onNode }) {
  const current = architectureNodes.find(([name]) => name === activeNode) || architectureNodes[0];

  return (
    <section className={styles.trustMap}>
      <div className={styles.sectionIntro}>
        <span>Trust architecture</span>
        <h2>Every stage adds a safeguard before learning happens.</h2>
      </div>
      <div className={styles.architectureRail}>
        {architectureNodes.map(([name]) => (
          <button
            className={name === current[0] ? styles.activeNode : ""}
            key={name}
            onMouseEnter={() => onNode(name)}
            onFocus={() => onNode(name)}
            type="button"
          >
            {name}
          </button>
        ))}
      </div>
      <article className={styles.nodeReadout}>
        <span>{current[0]}</span>
        <p>{current[1]}</p>
      </article>
    </section>
  );
}
