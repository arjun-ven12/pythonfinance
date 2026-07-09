import StockPriceChart from "./StockPriceChart";
import { formatExchange } from "../../utils/marketMetadata";

function formatMoney(value, currency = "USD") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${currency} -`;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric);
}

function formatCompactNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric);
}

function executionTimelineFor(order, fills = []) {
  return [
    { label: "Created", timestamp: order?.createdAt || null },
    { label: "Validated", timestamp: order?.createdAt || null },
    { label: "Sent", timestamp: order?.updatedAt || order?.createdAt || null },
    {
      label: "Accepted",
      timestamp: ["SUBMITTED", "PARTIALLY_FILLED", "FILLED"].includes(order?.status)
        ? order?.updatedAt || order?.createdAt || null
        : null,
    },
    {
      label: "Partially Filled",
      timestamp: order?.status === "PARTIALLY_FILLED" ? order?.updatedAt || null : null,
    },
    {
      label: "Filled",
      timestamp:
        order?.status === "FILLED"
          ? fills?.[0]?.filledAt || order?.updatedAt || null
          : null,
    },
    {
      label: "Cancelled",
      timestamp: order?.status === "CANCELLED" ? order?.updatedAt || null : null,
    },
    {
      label: "Rejected",
      timestamp: order?.status === "REJECTED" ? order?.updatedAt || null : null,
    },
  ];
}

function DetailMetric({ label, value }) {
  return (
    <div className="workspace-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function WorkspaceEmptyState({ symbol, onSecondaryAction, secondaryActionLabel }) {
  return (
    <aside className="watchlist-detail-panel empty">
      <p className="eyebrow">Trading Workspace</p>
      <h2>{symbol || "Select a symbol"}</h2>
      <p>
        {symbol
          ? "No latest scan data is available for this symbol yet. Run a scan to populate analysis and route it into the workspace."
          : "Select a watchlist or scanner symbol to open the live trading workspace."}
      </p>
      {onSecondaryAction && secondaryActionLabel ? (
        <div className="watchlist-detail-actions">
          <button className="direction-toggle" onClick={onSecondaryAction} type="button">
            {secondaryActionLabel}
          </button>
        </div>
      ) : null}
    </aside>
  );
}

export default function StockWorkspaceSidebar({
  emptySymbol = "",
  footerNote,
  headerEyebrow = "Live Trading Workspace",
  liveQuote,
  onPrimaryAction,
  onSecondaryAction,
  primaryActionLabel = "",
  secondaryActionLabel = "",
  secondaryActionTone = "neutral",
  selected,
  workspace,
  extraContent = null,
}) {
  if (!selected) {
    return <WorkspaceEmptyState />;
  }

  const item = selected.item || null;
  const symbol = selected.symbol || "";

  if (!item) {
    return (
      <WorkspaceEmptyState
        symbol={symbol}
        onSecondaryAction={onSecondaryAction}
        secondaryActionLabel={secondaryActionLabel}
      />
    );
  }

  const market = item.market || (item.is_sgx ? "Singapore" : "US");
  const exchange = formatExchange(item.exchange, item);
  const live = liveQuote?.quote || {};
  const currency = liveQuote?.currency || item.currency || "USD";
  const buyingPowerRemaining =
    workspace.preview?.preview?.buyingPowerRemaining ?? workspace.account?.buyingPower;
  const selectedPosition =
    workspace.positions.find(
      (position) => position.symbol === (item.display_symbol || item.symbol || symbol)
    ) ||
    workspace.positions[0] ||
    null;
  const secondaryActionClass =
    secondaryActionTone === "danger"
      ? "direction-toggle danger-action"
      : "direction-toggle";

  return (
    <aside className="watchlist-detail-panel workspace-panel">
      <div className="watchlist-detail-header workspace-header">
        <div className="workspace-header-copy">
          <p className="eyebrow">{headerEyebrow}</p>
          <h2>{item.display_symbol || item.symbol || symbol}</h2>
          <span>{item.company_name || item.companyName || `${exchange} · ${market}`}</span>
        </div>
        <div className="workspace-header-side">
          <span className={`badge ${String(item.signal || "hold").toLowerCase()}`}>
            {item.signal || "HOLD"}
          </span>
          <strong>{formatMoney(live.last ?? item.close, currency)}</strong>
        </div>
      </div>

      <div className="market-badge-row">
        <span className={`market-badge ${item.is_sgx ? "sgx" : "us"}`}>{exchange}</span>
        <span className="market-badge">{market}</span>
        <span className="market-badge currency">{currency}</span>
        <span className="market-badge">{live.marketStatus || liveQuote?.source || "Snapshot"}</span>
      </div>

      <StockPriceChart
        defaultRange="1d"
        market={item.market}
        symbol={item.yahoo_symbol || item.yahooSymbol || item.display_symbol || item.symbol || symbol}
      />

      <div className="workspace-two-column">
        <section className="watchlist-detail-section workspace-trade-ticket">
          <div className="watchlist-detail-recommendation-header">
            <div>
              <p className="eyebrow">Trade Ticket</p>
              <strong>Paper routing only</strong>
            </div>
            <span className="recommendation-pill review">BrokerService</span>
          </div>

          <div className="workspace-ticket-grid">
            <label>
              <span>Side</span>
              <select
                disabled={workspace.ticketLocked}
                value={workspace.ticket.side}
                onChange={(event) => workspace.updateTicketField("side", event.target.value)}
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </label>
            <label>
              <span>Quantity</span>
              <input
                disabled={workspace.ticketLocked}
                min="1"
                step="1"
                type="number"
                value={workspace.ticket.quantity}
                onChange={(event) => workspace.updateTicketField("quantity", event.target.value)}
              />
            </label>
            <label>
              <span>Order Type</span>
              <select
                disabled={workspace.ticketLocked}
                value={workspace.ticket.orderType}
                onChange={(event) => workspace.updateTicketField("orderType", event.target.value)}
              >
                <option value="MARKET">Market</option>
                <option value="LIMIT">Limit</option>
                <option value="STOP">Stop</option>
                <option value="STOP_LIMIT">Stop Limit</option>
              </select>
            </label>
            <label>
              <span>Time in Force</span>
              <select
                disabled={workspace.ticketLocked}
                value={workspace.ticket.timeInForce}
                onChange={(event) => workspace.updateTicketField("timeInForce", event.target.value)}
              >
                <option value="DAY">DAY</option>
                <option value="GTC">GTC</option>
                <option value="IOC">IOC</option>
              </select>
            </label>
            <label>
              <span>Limit</span>
              <input
                disabled={workspace.ticketLocked}
                min="0"
                step="0.01"
                type="number"
                value={workspace.ticket.limitPrice}
                onChange={(event) => workspace.updateTicketField("limitPrice", event.target.value)}
              />
            </label>
            <label>
              <span>Stop</span>
              <input
                disabled={workspace.ticketLocked}
                min="0"
                step="0.01"
                type="number"
                value={workspace.ticket.stopPrice}
                onChange={(event) => workspace.updateTicketField("stopPrice", event.target.value)}
              />
            </label>
          </div>

          <div className="watchlist-detail-actions">
            <button
              className="direction-toggle"
              disabled={workspace.ticketLocked}
              onClick={workspace.previewOrder}
              type="button"
            >
              {workspace.previewing ? "Previewing..." : "Preview Order"}
            </button>
            <button
              className="direction-toggle primary-action"
              disabled={workspace.ticketLocked}
              onClick={workspace.submitOrder}
              type="button"
            >
              {workspace.submitting
                ? "Submitting..."
                : workspace.ticket.brokerOrderId
                  ? "Modify Order"
                  : "Submit Order"}
            </button>
          </div>

          {workspace.preview ? (
            <div className="workspace-preview-card">
              <DetailMetric
                label="Estimated Cost"
                value={formatMoney(workspace.preview.preview?.estimatedNotional, currency)}
              />
              <DetailMetric
                label="Buying Power Remaining"
                value={formatMoney(
                  workspace.preview.preview?.buyingPowerRemaining,
                  workspace.account?.currency || currency
                )}
              />
              <DetailMetric
                label="Commission"
                value={formatMoney(workspace.preview.preview?.commissionEstimate, currency)}
              />
              <DetailMetric
                label="Slippage Estimate"
                value={formatMoney(workspace.preview.preview?.slippageEstimate, currency)}
              />
              <div className="workspace-preview-warnings">
                <strong>Order Validation</strong>
                <ul>
                  {(workspace.preview.validation?.warnings || []).length > 0 ? (
                    workspace.preview.validation.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))
                  ) : (
                    <li>No blocking broker preflight warnings.</li>
                  )}
                </ul>
              </div>
            </div>
          ) : null}
        </section>

        <section className="watchlist-detail-section">
          <div className="watchlist-detail-recommendation-header">
            <div>
              <p className="eyebrow">Live Position</p>
              <strong>{selectedPosition?.symbol || "No open position"}</strong>
            </div>
            <span className="recommendation-pill neutral">{workspace.positions.length} tracked</span>
          </div>

          {selectedPosition ? (
            <div className="workspace-position-grid">
              <DetailMetric
                label="Average Cost"
                value={formatMoney(selectedPosition.averageCost, currency)}
              />
              <DetailMetric
                label="Current Price"
                value={formatMoney(selectedPosition.currentPrice, currency)}
              />
              <DetailMetric
                label="Market Value"
                value={formatMoney(selectedPosition.marketValue, currency)}
              />
              <DetailMetric
                label="Unrealized Gain"
                value={formatMoney(selectedPosition.unrealizedGain, currency)}
              />
              <DetailMetric
                label="Daily P/L"
                value={formatMoney(selectedPosition.dailyGain, currency)}
              />
              <DetailMetric
                label="Buying Power Remaining"
                value={formatMoney(buyingPowerRemaining, workspace.account?.currency || currency)}
              />
            </div>
          ) : (
            <p className="alerts-empty">No open broker-backed paper positions for this workspace yet.</p>
          )}
        </section>
      </div>

      {workspace.submissionNotice ? (
        <section className={`watchlist-detail-section workspace-ticket-status ${workspace.submissionNotice.tone || "success"}`}>
          <div className="watchlist-detail-recommendation-header">
            <div>
              <p className="eyebrow">Order Submission</p>
              <strong>{workspace.submissionNotice.title}</strong>
            </div>
            <span className="recommendation-pill neutral">
              {workspace.submissionNotice.status || "SUBMITTED"}
            </span>
          </div>
          <p>{workspace.submissionNotice.detail}</p>
          {workspace.submissionNotice.warning ? <p>{workspace.submissionNotice.warning}</p> : null}
        </section>
      ) : null}

      <div className="workspace-two-column">
        <section className="watchlist-detail-section">
          <div className="watchlist-detail-recommendation-header">
            <div>
              <p className="eyebrow">Open Orders</p>
              <strong>{workspace.account?.openOrders?.length || 0} broker orders</strong>
            </div>
            <span className="recommendation-pill review">{workspace.preflight?.overall || "SYNC"}</span>
          </div>

          {(workspace.account?.openOrders || []).length > 0 ? (
            <div className="workspace-order-list">
              {workspace.account.openOrders.map((order) => (
                <article
                  className="workspace-order-card"
                  key={`${order.brokerOrderId || order.clientOrderId || order.symbol}-${order.createdAt || ""}`}
                >
                  <div>
                    <strong>{order.symbol}</strong>
                    <span>
                      {order.side} · {order.orderType}
                    </span>
                  </div>
                  <div>
                    <strong>{order.status}</strong>
                    <span>
                      {Number(order.quantity || 0)} @ {formatMoney(order.limitPrice || live.last, currency)}
                    </span>
                  </div>
                  <div className="workspace-order-actions">
                    <button
                      disabled={workspace.ticketLocked}
                      type="button"
                      onClick={() => workspace.loadOrderIntoTicket(order)}
                    >
                      Modify
                    </button>
                    <button type="button" onClick={() => workspace.cancelOrder(order.brokerOrderId)}>
                      Cancel
                    </button>
                    <button type="button" onClick={workspace.refresh}>
                      Refresh
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="alerts-empty">No open orders from the connected broker account.</p>
          )}
        </section>

        <section className="watchlist-detail-section">
          <div className="watchlist-detail-recommendation-header">
            <div>
              <p className="eyebrow">Execution Timeline</p>
              <strong>Recent submissions</strong>
            </div>
            <span className="recommendation-pill review">{workspace.recentTimeline.length}</span>
          </div>

          {workspace.recentTimeline.length > 0 ? (
            <div className="workspace-timeline-list">
              {workspace.recentTimeline.map((entry) => (
                <article className="workspace-timeline-card" key={entry.id}>
                  <strong>
                    {entry.order.symbol} · {entry.order.status}
                  </strong>
                  <div className="workspace-timeline-steps">
                    {executionTimelineFor(entry.order, entry.fills).map((step) => (
                      <div key={`${entry.id}-${step.label}`} className={step.timestamp ? "complete" : ""}>
                        <span>{step.label}</span>
                        <strong>{step.timestamp ? new Date(step.timestamp).toLocaleString() : "-"}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="alerts-empty">Submit a paper order to populate the execution timeline.</p>
          )}
        </section>
      </div>

      {extraContent}

      {footerNote ? (
        <section className="watchlist-detail-section workspace-context-section">
          <p className="eyebrow">Scanner Context</p>
          <p>{footerNote}</p>
        </section>
      ) : null}

      {workspace.error ? <p className="engine-error">{workspace.error}</p> : null}

      {(primaryActionLabel || secondaryActionLabel) && (onPrimaryAction || onSecondaryAction) ? (
        <div className="watchlist-detail-actions workspace-footer-actions">
          {onPrimaryAction && primaryActionLabel ? (
            <button className="direction-toggle" onClick={onPrimaryAction} type="button">
              {primaryActionLabel}
            </button>
          ) : null}
          {onSecondaryAction && secondaryActionLabel ? (
            <button className={secondaryActionClass} onClick={onSecondaryAction} type="button">
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
