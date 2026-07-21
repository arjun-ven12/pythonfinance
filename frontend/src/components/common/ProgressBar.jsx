import { formatNumber } from "../../utils/numberFormat";

export default function ProgressBar({ label, value, max = 100, invert = false }) {
  const numericValue = Number(value) || 0;
  const normalized = Math.max(0, Math.min((numericValue / max) * 100, 100));
  const fillWidth = invert ? 100 - normalized : normalized;

  return (
    <div className="progress-row">
      <div>
        <span>{label}</span>
        <strong>{formatNumber(numericValue)}</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${fillWidth}%` }} />
      </div>
    </div>
  );
}
