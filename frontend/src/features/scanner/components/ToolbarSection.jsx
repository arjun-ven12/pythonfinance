export default function ToolbarSection({ children, className = "", label }) {
  return (
    <div className={`scanner-toolbar-section ${className}`.trim()}>
      {label && <span className="scanner-toolbar-section-label">{label}</span>}
      {children}
    </div>
  );
}
