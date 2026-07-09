export default function FilterChip({ active, children, onClick }) {
  return (
    <button
      className={`scanner-filter-chip ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true">{active ? "✓" : ""}</span>
      {children}
    </button>
  );
}
