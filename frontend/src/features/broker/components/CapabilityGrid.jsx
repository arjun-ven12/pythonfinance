function statusLabel(state) {
  if (state === "partial") return "Partial";
  if (state === "blocked") return "Unavailable";
  return "Available";
}

export default function CapabilityGrid({ items = [], notes = [] }) {
  return (
    <article className="ibkr-card">
      <div>
        <p className="eyebrow">Capability Matrix</p>
        <h3>Execution surface by broker</h3>
      </div>
      <div className="broker-capability-grid">
        {items.map((item) => (
          <div className={`broker-capability-card capability-${item.state || "blocked"}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{statusLabel(item.state)}</strong>
            <p>{item.detail}</p>
          </div>
        ))}
      </div>
      {notes.map((note) => <p className="ibkr-note" key={note}>{note}</p>)}
    </article>
  );
}
