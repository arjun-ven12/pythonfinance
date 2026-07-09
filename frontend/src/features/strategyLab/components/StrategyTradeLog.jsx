export default function StrategyTradeLog({ trades }) {
  const rows = trades || [];

  if (rows.length === 0) {
    return <p className="alerts-empty">No trades in this backtest.</p>;
  }

  const getTradeValue = (trade, keys, fallback = "-") => {
    const key = keys.find((item) => trade[item] !== undefined && trade[item] !== null && trade[item] !== "");
    return key ? trade[key] : fallback;
  };
  const formatTradeNumber = (value, decimals = 2, suffix = "") => {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(decimals)}${suffix}` : "-";
  };
  const getDecisionSnapshot = (trade) => trade.decisionSnapshot || trade.decision_snapshot || trade.raw?.decision_snapshot || null;

  return (
    <div className="backtest-trade-log strategy-trade-log">
      <div className="strategy-trade-log-head">
        <span>Entry</span>
        <span>Exit</span>
        <span>Side</span>
        <span>Entry Price</span>
        <span>Exit Price</span>
        <span>Shares</span>
        <span>P/L</span>
        <span>Return</span>
        <span>Hold</span>
        <span>Exit Reason</span>
        <span>Decision</span>
      </div>
      {rows.slice().reverse().slice(0, 40).map((trade, index) => {
        const snapshot = getDecisionSnapshot(trade);
        return (
          <article className="strategy-trade-log-row" key={`${trade.date}-${trade.type}-${index}`}>
            <span>{getTradeValue(trade, ["entry_date", "entryDate", "date"])}</span>
            <span>{getTradeValue(trade, ["exit_date", "exitDate", "date"])}</span>
            <strong>{getTradeValue(trade, ["side", "type"], "BUY")}</strong>
            <span>{formatTradeNumber(getTradeValue(trade, ["entry_price", "entryPrice", "price"], null))}</span>
            <span>{formatTradeNumber(getTradeValue(trade, ["exit_price", "exitPrice", "price"], null))}</span>
            <span>{formatTradeNumber(getTradeValue(trade, ["shares", "quantity"], 0))}</span>
            <span>{formatTradeNumber(getTradeValue(trade, ["profit", "p_l", "pnl", "profit_loss"], null))}</span>
            <span>{formatTradeNumber(getTradeValue(trade, ["return_pct", "returnPct"], null), 2, "%")}</span>
            <span>{getTradeValue(trade, ["holding_period", "holdingPeriod", "holding_days"], "-")}</span>
            <span>{getTradeValue(trade, ["reason", "exit_reason", "exitReason"], "-")}</span>
            <span>{snapshot?.entryReason || snapshot?.exitReason || "Rules snapshot saved"}</span>
          </article>
        );
      })}
    </div>
  );
}

