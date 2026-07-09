import SignalStatPill from "./SignalStatPill";

export default function ScannerSignalStrip({
  FILTERS,
  counts,
  filter,
  setFilter,
}) {
  return (
    <section className="scanner-signal-strip" aria-label="Signal filters">
      <div className="scanner-signal-strip-header">
        <span className="scanner-toolbar-section-label">Signals</span>
      </div>
      <div className="scanner-signal-strip-grid">
        {FILTERS.map((type) => (
          <SignalStatPill
            active={filter === type}
            count={counts[type]}
            key={type}
            onClick={() => setFilter(type)}
            signal={type}
          />
        ))}
      </div>
    </section>
  );
}
