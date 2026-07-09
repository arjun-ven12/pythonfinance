import styles from "../LandingPage.module.css";

const ctaCopy = {
  scan: "Start with scanner discipline.",
  fast: "Slow down execution with approvals.",
  validate: "Prove confidence with outcomes.",
  research: "Turn research into a versioned playbook.",
};

export default function FinalCTA({ selectedIntent, onIntent, onLogin, onRegister }) {
  return (
    <section className={styles.finalCta}>
      <span>Before login</span>
      <h2>How do you trade today?</h2>
      <div className={styles.intentGrid}>
        <button className={selectedIntent === "scan" ? styles.activeIntent : ""} onClick={() => onIntent("scan")} type="button">I scan manually</button>
        <button className={selectedIntent === "fast" ? styles.activeIntent : ""} onClick={() => onIntent("fast")} type="button">I execute too quickly</button>
        <button className={selectedIntent === "validate" ? styles.activeIntent : ""} onClick={() => onIntent("validate")} type="button">I want validation</button>
        <button className={selectedIntent === "research" ? styles.activeIntent : ""} onClick={() => onIntent("research")} type="button">I research strategies</button>
      </div>
      <p>{ctaCopy[selectedIntent]}</p>
      <div className={styles.heroActions}>
        <button className={styles.primaryButton} onClick={onLogin} type="button">Sign in</button>
        <button className={styles.secondaryButton} onClick={onRegister} type="button">Create account</button>
      </div>
    </section>
  );
}
