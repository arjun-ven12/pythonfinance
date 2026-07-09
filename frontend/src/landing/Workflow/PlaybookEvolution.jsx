import { playbookVersions } from "../landingData";
import styles from "../LandingPage.module.css";

export default function PlaybookEvolution({ selectedVersion, onSelect }) {
  const version =
    playbookVersions.find((item) => item.version === selectedVersion) ||
    playbookVersions[0];

  return (
    <section className={styles.playbookTree}>
      <div className={styles.sectionIntro}>
        <span>Playbook evolution</span>
        <h2>Strategy changes become reviewable versions.</h2>
      </div>
      <div className={styles.versionRail}>
        {playbookVersions.map((item) => (
          <button
            className={item.version === version.version ? styles.activeVersion : ""}
            key={item.version}
            onClick={() => onSelect(item.version)}
            type="button"
          >
            {item.version}
          </button>
        ))}
      </div>
      <article className={styles.versionCard}>
        <span>{version.title}</span>
        <h3>{version.version}</h3>
        <div><span>Sharpe</span><strong>{version.sharpe}</strong></div>
        <div><span>Drawdown</span><strong>{version.drawdown}</strong></div>
        <p>{version.changes}</p>
        <button type="button">Promote after review</button>
      </article>
    </section>
  );
}
