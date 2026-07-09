function mapReasonToChip(reason) {
  const normalized = String(reason || "").toLowerCase();

  if (normalized.includes("liquidity")) return "Liquidity";
  if (normalized.includes("risk") || normalized.includes("drawdown")) return "Risk";
  if (normalized.includes("volatility")) return "Volatility";
  if (
    normalized.includes("bullish") ||
    normalized.includes("price above") ||
    normalized.includes("momentum")
  ) {
    return "Momentum";
  }
  if (normalized.includes("rsi")) return "RSI";
  if (normalized.includes("ema")) return "Trend";
  if (normalized.includes("news")) return "News";
  if (normalized.includes("openai") || normalized.includes("ai")) return "AI";
  if (normalized.includes("value")) return "Value";

  const [firstWord = "Thesis"] = String(reason || "").trim().split(/\s+/);
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

export default function ReasonPreview({ limit = 3, reasons = [] }) {
  const visibleReasons = reasons.slice(0, limit).map(mapReasonToChip);
  const extraCount = Math.max(0, reasons.length - visibleReasons.length);

  if (visibleReasons.length === 0) {
    return <p className="watchlist-reason-empty">No thesis available</p>;
  }

  return (
    <div className="watchlist-reason-preview">
      {visibleReasons.map((reason, index) => (
        <span key={`${reason}-${index}`}>{reason}</span>
      ))}
      {extraCount > 0 && <b>+{extraCount}</b>}
    </div>
  );
}
