const formatMoney = (value, currency = "USD") => value == null ? "Not available" : `${currency || "USD"} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function AccountSnapshot({ account }) {
  const currency = account?.currency || "USD";
  const hasFundValues =
    account?.cash != null || account?.buyingPower != null || account?.equity != null;
  return (
    <article className="ibkr-card">
      <div className="broker-card-header">
        <div><p className="eyebrow">Account Snapshot</p><h3>Broker Account Snapshot</h3></div>
        <span className={`ibkr-status ${hasFundValues ? "connected" : "limited"}`}>
          {hasFundValues ? "Funds available" : account?.available ? "Connected" : "Read-only unavailable"}
        </span>
      </div>
      {account?.reason && <p className="ibkr-note">{account.reason}</p>}
      <dl className="ibkr-status-grid">
        <div><dt>Cash</dt><dd>{formatMoney(account?.cash, currency)}</dd></div>
        <div><dt>Buying Power</dt><dd>{formatMoney(account?.buyingPower, currency)}</dd></div>
        <div><dt>Equity</dt><dd>{formatMoney(account?.equity, currency)}</dd></div>
        <div><dt>Currency</dt><dd>{account?.currency || "-"}</dd></div>
        <div><dt>Margin</dt><dd>{account?.margin ?? "-"}</dd></div>
        <div><dt>Account Type</dt><dd>{account?.accountType || "-"}</dd></div>
        <div><dt>Positions</dt><dd>{account?.positions?.length || 0}</dd></div>
        <div><dt>Open Orders</dt><dd>{account?.openOrders?.length || 0}</dd></div>
      </dl>
    </article>
  );
}
