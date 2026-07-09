export default function TradesFeaturePage({
  closedTrades,
  handleTradeFieldChange,
  handleTradeSubmit,
  openTrades,
  renderTradeRows,
  tradeError,
  tradeForm,
}) {
  return (
        <section className="journal-panel">
        <div className="journal-form-panel">
          <div>
            <p className="eyebrow">Trade journal</p>
            <h2>Log Manual Trade</h2>
          </div>

          <form className="trade-form" onSubmit={handleTradeSubmit}>
            <label>
              Symbol
              <input
                onChange={(event) => handleTradeFieldChange("symbol", event.target.value)}
                required
                value={tradeForm.symbol}
              />
            </label>
            <label>
              Side
              <select
                onChange={(event) => handleTradeFieldChange("side", event.target.value)}
                value={tradeForm.side}
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </label>
            <label>
              Status
              <select
                onChange={(event) => handleTradeFieldChange("status", event.target.value)}
                value={tradeForm.status}
              >
                <option value="OPEN">OPEN</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </label>
            <label>
              Entry Price
              <input
                min="0"
                onChange={(event) =>
                  handleTradeFieldChange("entryPrice", event.target.value)
                }
                required
                step="0.01"
                type="number"
                value={tradeForm.entryPrice}
              />
            </label>
            <label>
              Quantity
              <input
                min="0"
                onChange={(event) => handleTradeFieldChange("quantity", event.target.value)}
                required
                step="0.0001"
                type="number"
                value={tradeForm.quantity}
              />
            </label>
            <label>
              Stop Loss
              <input
                min="0"
                onChange={(event) => handleTradeFieldChange("stopLoss", event.target.value)}
                step="0.01"
                type="number"
                value={tradeForm.stopLoss}
              />
            </label>
            <label>
              Take Profit
              <input
                min="0"
                onChange={(event) => handleTradeFieldChange("takeProfit", event.target.value)}
                step="0.01"
                type="number"
                value={tradeForm.takeProfit}
              />
            </label>
            <label className="notes-field">
              Notes
              <textarea
                onChange={(event) => handleTradeFieldChange("notes", event.target.value)}
                value={tradeForm.notes}
              />
            </label>
            <button className="watchlist-button" type="submit">
              Save Trade
            </button>
          </form>
          {tradeError && <p className="subtitle">Trade error: {tradeError}</p>}
        </div>

        <div className="journal-list-panel">
          <div className="journal-section">
            <div className="list-header">
              <div>
                <p className="eyebrow">Open trades</p>
                <h2>{openTrades.length}</h2>
              </div>
            </div>
            {renderTradeRows(openTrades, true)}
          </div>

          <div className="journal-section">
            <div className="list-header">
              <div>
                <p className="eyebrow">Closed trades</p>
                <h2>{closedTrades.length}</h2>
              </div>
            </div>
            {renderTradeRows(closedTrades)}
          </div>
        </div>
        </section>

  );
}
