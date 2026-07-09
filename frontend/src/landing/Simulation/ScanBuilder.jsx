import { demoOpportunities } from "../landingData";
import styles from "../LandingPage.module.css";

export default function ScanBuilder({ scanConfig, onChange, onMetricEvent }) {
  const filtered = demoOpportunities
    .filter((item) => scanConfig.universe === "Both" || item.market === scanConfig.universe)
    .filter((item) => item.risk === scanConfig.risk || scanConfig.risk === "Medium")
    .filter((item) => item.horizon === scanConfig.horizon || scanConfig.horizon === "Swing")
    .filter((item) => item.score >= scanConfig.threshold)
    .slice(0, 4);

  function setField(field, value) {
    onChange({ ...scanConfig, [field]: value });
    onMetricEvent("scan");
  }

  return (
    <section className={styles.scanBuilder}>
      <div className={styles.sectionIntro}>
        <span>Build your own scan</span>
        <h2>Change inputs and the opportunity set responds.</h2>
      </div>
      <div className={styles.builderControls}>
        <label>
          Universe
          <select value={scanConfig.universe} onChange={(event) => setField("universe", event.target.value)}>
            <option>Both</option>
            <option>US</option>
            <option>SG</option>
          </select>
        </label>
        <label>
          Risk
          <select value={scanConfig.risk} onChange={(event) => setField("risk", event.target.value)}>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </label>
        <label>
          Horizon
          <select value={scanConfig.horizon} onChange={(event) => setField("horizon", event.target.value)}>
            <option>Swing</option>
            <option>Momentum</option>
          </select>
        </label>
        <label>
          Threshold {scanConfig.threshold}
          <input
            max="90"
            min="55"
            onChange={(event) => setField("threshold", Number(event.target.value))}
            type="range"
            value={scanConfig.threshold}
          />
        </label>
      </div>

      <div className={styles.opportunityPreview}>
        {filtered.length > 0 ? filtered.map((item) => (
          <article key={item.symbol}>
            <div>
              <strong>{item.symbol}</strong>
              <span>{item.market} · {item.risk}</span>
            </div>
            <b>{item.score}</b>
            <p>{item.signal} · confidence {item.confidence}</p>
          </article>
        )) : (
          <p>No opportunities match those scan rules.</p>
        )}
      </div>
    </section>
  );
}
