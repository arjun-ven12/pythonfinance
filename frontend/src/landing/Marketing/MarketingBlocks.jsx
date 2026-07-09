import styles from "../LandingPage.module.css";

const pillars = [
  {
    title: "Signal quality before speed",
    body: "The scanner does not just surface symbols. It shows confidence, risk, regime context, and whether a setup deserves attention.",
  },
  {
    title: "Human approval stays central",
    body: "High-conviction ideas move through approvals, safety checks, and paper execution before anything becomes part of the record.",
  },
  {
    title: "Research becomes memory",
    body: "Validation and playbooks turn outcomes into evidence so the system can show what worked, where, and why.",
  },
];

const outcomes = [
  "Scan US and SGX opportunities from one cockpit",
  "Review proposed trades with portfolio impact before approving",
  "Validate whether confidence scores predict real outcomes",
  "Version strategies instead of losing research in notebooks",
];

export default function MarketingBlocks() {
  return (
    <>
      <section className={styles.positioningBand}>
        <div>
          <span className={styles.eyebrow}>Built for disciplined traders</span>
          <h2>A trading cockpit for people who want evidence, not adrenaline.</h2>
        </div>
        <p>
          Most dashboards stop at showing a signal. This one connects the whole
          loop: scan, explain, approve, paper execute, validate, and improve the
          strategy playbook over time.
        </p>
      </section>

      <section className={styles.pillarGrid} aria-label="Product pillars">
        {pillars.map((pillar) => (
          <article key={pillar.title}>
            <span>{pillar.title}</span>
            <p>{pillar.body}</p>
          </article>
        ))}
      </section>

      <section className={styles.outcomeBand}>
        <div>
          <span className={styles.eyebrow}>What it replaces</span>
          <h2>Less spreadsheet drift. Less impulse. More traceable decisions.</h2>
        </div>
        <ul>
          {outcomes.map((outcome) => (
            <li key={outcome}>{outcome}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
