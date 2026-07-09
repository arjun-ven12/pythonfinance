export default function SignalStatPill({ active, count, signal, onClick }) {
  return (
    <button
      className={`scanner-signal-pill ${signal.toLowerCase()} ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span>{signal}</span>
      <strong>{count || 0}</strong>
    </button>
  );
}
