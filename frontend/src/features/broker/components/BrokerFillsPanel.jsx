export default function BrokerFillsPanel({ fills = [] }) {
  return (
    <article className="ibkr-card">
      <div className="broker-card-header">
        <div>
          <p className="eyebrow">Broker Fills</p>
          <h3>Broker fills</h3>
        </div>
        <span className="ibkr-status connected">{fills.length} fills</span>
      </div>
      <div className="broker-reconciliation-table">
        <div className="broker-table-head broker-fill-grid">
          <span>Symbol</span>
          <span>Side</span>
          <span>Qty</span>
          <span>Price</span>
          <span>Commission</span>
          <span>Filled</span>
        </div>
        {fills.length ? (
          fills.map((fill) => (
            <div className="broker-table-row broker-fill-grid" key={fill.id}>
              <strong>{fill.symbol}</strong>
              <span>{fill.side}</span>
              <span>{fill.quantity}</span>
              <span>{fill.price}</span>
              <span>{fill.commission ?? 0}</span>
              <span>{fill.filledAt ? new Date(fill.filledAt).toLocaleString() : "-"}</span>
            </div>
          ))
        ) : (
          <p className="alerts-empty">No broker fills recorded yet.</p>
        )}
      </div>
    </article>
  );
}
