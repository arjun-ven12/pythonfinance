import { validationBuckets } from "../landingData";
import styles from "../LandingPage.module.css";

export default function ValidationVisual({ hoveredBucket, onHover }) {
  const selected = hoveredBucket || validationBuckets[2];

  return (
    <section className={styles.validationVisual}>
      <div className={styles.sectionIntro}>
        <span>Validation</span>
        <h2>Confidence means nothing without outcomes.</h2>
      </div>
      <div className={styles.bucketGrid}>
        {validationBuckets.map((bucket) => (
          <button
            className={selected.bucket === bucket.bucket ? styles.activeBucket : ""}
            key={bucket.bucket}
            onMouseEnter={() => onHover(bucket)}
            onFocus={() => onHover(bucket)}
            type="button"
          >
            <span>{bucket.bucket}</span>
            <i style={{ height: `${bucket.winRate}%` }} />
          </button>
        ))}
      </div>
      <article className={styles.bucketReadout}>
        <strong>{selected.bucket}</strong>
        <div><span>Trades</span><b>{selected.trades}</b></div>
        <div><span>Win rate</span><b>{selected.winRate}%</b></div>
        <div><span>Avg return</span><b>{selected.avgReturn}%</b></div>
      </article>
    </section>
  );
}
