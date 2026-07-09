import { formatExchange } from "../../utils/marketMetadata";

const TABLE_COLUMNS = [
  { key: "symbol", label: "Symbol", type: "text" },
  { key: "market", label: "Market", type: "market" },
  { key: "sector", label: "Sector", type: "text" },
  { key: "market_cap", label: "Market Cap", type: "compact" },
  { key: "signal", label: "Signal", type: "text" },
  { key: "close", label: "Latest Close", type: "money" },
  { key: "opportunity_score", label: "Score", type: "number" },
  { key: "confidence", label: "Confidence", type: "number" },
  { key: "backtest_return", label: "Backtest Return", type: "percent" },
  { key: "buy_and_hold", label: "Buy & Hold", type: "percent" },
  { key: "win_rate", label: "Win Rate", type: "percent" },
  { key: "drawdown", label: "Drawdown", type: "percent" },
];

export default function OpportunityTable({
  formatPercent,
  items,
  onSelect,
  onSort,
  selectedSymbol,
  sortDirection,
  sortKey,
}) {
  const formatCell = (item, column) => {
    const value = item[column.key];

    if (column.key === "signal") {
      return <span className={`badge ${item.signal.toLowerCase()}`}>{item.signal}</span>;
    }

    if (column.key === "symbol") {
      return (
        <div className="table-symbol-cell">
          <strong>{item.display_symbol || item.symbol}</strong>
          <span>{item.company_name || item.symbol}</span>
        </div>
      );
    }

    if (column.type === "market") {
      const exchange = formatExchange(item.exchange, item);

      return (
        <div className="market-badge-row">
          <span className={`market-badge ${item.is_sgx ? "sgx" : "us"}`}>
            {exchange}
          </span>
          <span className="market-badge">{item.market || "US"}</span>
          <span className="market-badge currency">{item.currency || "USD"}</span>
        </div>
      );
    }

    if (column.type === "compact") {
      return value == null
        ? "-"
        : Intl.NumberFormat(undefined, {
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(Number(value));
    }

    if (column.type === "money") {
      const number = Number(value);
      return Number.isFinite(number) ? `${item.currency || "USD"} ${number.toFixed(2)}` : "-";
    }

    if (column.type === "percent") {
      return formatPercent(value);
    }

    return value;
  };

  return (
    <div className="scanner-table-panel">
      <table className="scanner-table">
        <thead>
          <tr>
            {TABLE_COLUMNS.map((column) => (
              <th key={column.key}>
                <button onClick={() => onSort(column.key)} type="button">
                  <span>{column.label}</span>
                  {sortKey === column.key && (
                    <b>{sortDirection === "desc" ? "Down" : "Up"}</b>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              className={selectedSymbol === item.symbol ? "selected" : ""}
              key={item.symbol}
              onClick={() => onSelect(item.symbol)}
            >
              {TABLE_COLUMNS.map((column) => (
                <td key={column.key}>{formatCell(item, column)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="alerts-empty">No matching opportunities.</p>}
    </div>
  );
}
