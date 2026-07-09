import { demoTabs } from "../landingData";
import styles from "../LandingPage.module.css";

export default function CommandCenterDemo({ activeTab, onTab }) {
  return (
    <section className={styles.commandDemo}>
      <div className={styles.sectionIntro}>
        <span>Command center demo</span>
        <h2>Switch surfaces like you would inside the app.</h2>
      </div>
      <div className={styles.demoTabs}>
        {Object.keys(demoTabs).map((tab) => (
          <button
            className={tab === activeTab ? styles.activeDemoTab : ""}
            key={tab}
            onClick={() => onTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>
      <div className={styles.demoWindow}>
        {demoTabs[activeTab].map((line) => (
          <article key={line}>
            <span>{line.split(" ")[0]}</span>
            <strong>{line.replace(line.split(" ")[0], "").trim()}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
