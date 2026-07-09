import { useEffect, useMemo, useState } from "react";
import {
  ConfidenceBreakdownPanel,
  NewsHealthPanel,
  OpenAiReasoningPanel,
  PortfolioFitPanel,
} from "../scanner/StockDetailDrawer";
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

function formatPercent(value) {
  const numeric = Number(value || 0);
  return `${numeric.toFixed(1)}%`;
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

function ScannerCompareSection({ compareItems = [] }) {
  if (!compareItems.length) {
    return null;
  }

  return (
    <section className="watchlist-detail-section workspace-context-section">
      <div className="watchlist-detail-recommendation-header">
        <div>
          <p className="eyebrow">Compare Mode</p>
          <strong>{compareItems.length} opportunities selected</strong>
        </div>
      </div>
      <div className="scanner-compare-grid">
        {compareItems.map((item) => (
          <div className="scanner-compare-card" key={item.symbol}>
            <strong>{item.display_symbol || item.symbol}</strong>
            <span>Score {Number(item.opportunity_score || 0).toFixed(1)}</span>
            <span>Confidence {Number(item.confidence || 0).toFixed(0)}%</span>
            <span>Drawdown {Number(item.drawdown || 0).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScannerContextTab({ activeHorizonProfile, activeStrategy, compareItems, item, footerNote }) {
  const fit = item.portfolio_fit || {};

  return (
    <div className="workspace-modal-tabstack">
      <ScannerCompareSection compareItems={compareItems} />

      <section className="watchlist-detail-section workspace-context-section">
        <div className="watchlist-detail-recommendation-header">
          <div>
            <p className="eyebrow">Scanner Context</p>
            <strong>Opportunity attribution</strong>
          </div>
          <span className={`recommendation-pill ${String(item.signal || "hold").toLowerCase()}`}>
            {item.signal || "HOLD"}
          </span>
        </div>

        <dl className="detail-stats">
          <div>
            <dt>Latest close</dt>
            <dd>{formatMoney(item.close, item.currency || "USD")}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{Number(item.opportunity_score || 0).toFixed(1)}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{Number(item.confidence || 0).toFixed(0)}%</dd>
          </div>
          <div>
            <dt>Win rate</dt>
            <dd>{formatPercent(item.win_rate)}</dd>
          </div>
          <div>
            <dt>Drawdown</dt>
            <dd>{formatPercent(item.drawdown)}</dd>
          </div>
          <div>
            <dt>Backtest return</dt>
            <dd>{formatPercent(item.backtest_return)}</dd>
          </div>
          <div>
            <dt>Buy and hold</dt>
            <dd>{formatPercent(item.buy_and_hold)}</dd>
          </div>
          <div>
            <dt>Deployability</dt>
            <dd>
              {Math.round(
                Number(item.confidence || 0) * 0.55 +
                  Number(fit.portfolio_fit_score || 0) * 0.45
              )}
            </dd>
          </div>
          <div>
            <dt>Strategy</dt>
            <dd>{item.strategy_name || activeStrategy?.name || "Unknown"}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{item.strategy_version_id || activeStrategy?.strategyVersionId || "Default"}</dd>
          </div>
          <div>
            <dt>Bias</dt>
            <dd>{item.strategy_bias || activeHorizonProfile?.strategy_bias || "-"}</dd>
          </div>
          <div>
            <dt>Signal function</dt>
            <dd>{activeStrategy?.signalFunction || "generate_signal_from_row"}</dd>
          </div>
        </dl>

        {item.reasons?.length ? (
          <ul className="detail-reasons workspace-reason-list">
            {item.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <PortfolioFitPanel fit={item.portfolio_fit} />

      {footerNote ? (
        <section className="watchlist-detail-section workspace-context-section">
          <p className="eyebrow">Routing Note</p>
          <p>{footerNote}</p>
        </section>
      ) : null}
    </div>
  );
}

function ConfidenceTab({ item }) {
  return (
    <div className="workspace-modal-tabstack">
      <ConfidenceBreakdownPanel breakdown={item.confidence_breakdown} />
      <section className="watchlist-detail-section workspace-context-section">
        <div className="watchlist-detail-recommendation-header">
          <div>
            <p className="eyebrow">Confidence Summary</p>
            <strong>Signal quality at a glance</strong>
          </div>
        </div>
        <dl className="detail-stats">
          <div>
            <dt>Opportunity score</dt>
            <dd>{Number(item.opportunity_score || 0).toFixed(1)}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{Number(item.confidence || 0).toFixed(0)}%</dd>
          </div>
          <div>
            <dt>Win rate</dt>
            <dd>{formatPercent(item.win_rate)}</dd>
          </div>
          <div>
            <dt>Drawdown</dt>
            <dd>{formatPercent(item.drawdown)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function NewsTab({ item }) {
  return (
    <div className="workspace-modal-tabstack">
      <NewsHealthPanel newsFilter={item.news_filter} />
      <OpenAiReasoningPanel reasoning={item.openai_news_reasoning} />
    </div>
  );
}

function TradesTab({ currency, item, live, selectedPosition, workspace }) {
  const buyingPowerRemaining =
    workspace.preview?.preview?.buyingPowerRemaining ?? workspace.account?.buyingPower;

  return (
    <div className="workspace-modal-tabstack">
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
              <strong>{selectedPosition?.symbol || item.display_symbol || item.symbol}</strong>
            </div>
            <span className="recommendation-pill neutral">{workspace.positions.length} tracked</span>
          </div>

          {selectedPosition ? (
            <div className="workspace-position-grid">
              <DetailMetric label="Average Cost" value={formatMoney(selectedPosition.averageCost, currency)} />
              <DetailMetric label="Current Price" value={formatMoney(selectedPosition.currentPrice, currency)} />
              <DetailMetric label="Market Value" value={formatMoney(selectedPosition.marketValue, currency)} />
              <DetailMetric label="Unrealized Gain" value={formatMoney(selectedPosition.unrealizedGain, currency)} />
              <DetailMetric label="Daily P/L" value={formatMoney(selectedPosition.dailyGain, currency)} />
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
    </div>
  );
}

const TABS = [
  { key: "trades", label: "Trades" },
  { key: "scanner", label: "Scanner Context" },
  { key: "confidence", label: "Confidence" },
  { key: "news", label: "News" },
];

export default function StockWorkspaceModal({
  activeHorizonProfile = null,
  activeStrategy = null,
  compareItems = [],
  footerNote = "",
  isOpen,
  liveQuote,
  onClose,
  onToggleWatchlist,
  selected,
  watchlist = new Set(),
  workspace,
}) {
  const [activeTab, setActiveTab] = useState("trades");

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("trades");
    }
  }, [isOpen, selected?.symbol]);

  const item = selected?.item || null;
  const symbol = selected?.symbol || "";

  const selectedPosition = useMemo(() => {
    if (!item) return null;
    return (
      workspace.positions.find(
        (position) => position.symbol === (item.display_symbol || item.symbol || symbol)
      ) ||
      workspace.positions[0] ||
      null
    );
  }, [item, symbol, workspace.positions]);

  if (!isOpen || !selected || !item) {
    return null;
  }

  const market = item.market || (item.is_sgx ? "Singapore" : "US");
  const exchange = formatExchange(item.exchange, item);
  const live = liveQuote?.quote || {};
  const currency = liveQuote?.currency || item.currency || "USD";
  const watchlisted = watchlist.has(symbol);

  let tabContent = null;
  if (activeTab === "trades") {
    tabContent = (
      <TradesTab
        currency={currency}
        item={item}
        live={live}
        selectedPosition={selectedPosition}
        workspace={workspace}
      />
    );
  } else if (activeTab === "scanner") {
    tabContent = (
      <ScannerContextTab
        activeHorizonProfile={activeHorizonProfile}
        activeStrategy={activeStrategy}
        compareItems={compareItems}
        footerNote={footerNote}
        item={item}
      />
    );
  } else if (activeTab === "confidence") {
    tabContent = <ConfidenceTab item={item} />;
  } else if (activeTab === "news") {
    tabContent = <NewsTab item={item} />;
  }

  return (
    <div
      aria-modal="true"
      className="workspace-modal-overlay"
      onClick={onClose}
      role="dialog"
    >
      <section className="workspace-modal" onClick={(event) => event.stopPropagation()}>
        <div className="workspace-modal-header">
          <div className="workspace-modal-titleblock">
            <p className="eyebrow">Selected Opportunity</p>
            <div className="workspace-modal-title-row">
              <div>
                <h2>{item.display_symbol || item.symbol || symbol}</h2>
                <span>{item.company_name || item.companyName || `${exchange} · ${market}`}</span>
              </div>
              <span className={`badge ${String(item.signal || "hold").toLowerCase()}`}>
                {item.signal || "HOLD"}
              </span>
            </div>
            <div className="market-badge-row">
              <span className={`market-badge ${item.is_sgx ? "sgx" : "us"}`}>{exchange}</span>
              <span className="market-badge">{market}</span>
              <span className="market-badge currency">{currency}</span>
              <span className="market-badge">{live.marketStatus || liveQuote?.source || "Snapshot"}</span>
            </div>
          </div>

          <div className="workspace-modal-header-actions">
            <strong>{formatMoney(live.last ?? item.close, currency)}</strong>
            <div className="workspace-modal-header-buttons">
              <button className="direction-toggle" onClick={() => onToggleWatchlist?.(symbol)} type="button">
                {watchlisted ? "Unwatch" : "Watchlist"}
              </button>
              <button className="direction-toggle" onClick={workspace.refresh} type="button">
                Refresh
              </button>
              <button className="direction-toggle danger-action" onClick={onClose} type="button">
                Close
              </button>
            </div>
          </div>
        </div>

        <div className="workspace-modal-chart">
          <StockPriceChart
            defaultRange="1d"
            market={item.market}
            symbol={item.yahoo_symbol || item.yahooSymbol || item.display_symbol || item.symbol || symbol}
          />
        </div>

        <div className="workspace-modal-tabs" role="tablist" aria-label="Stock workspace sections">
          {TABS.map((tab) => (
            <button
              aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? "active" : ""}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="workspace-modal-tabpanel" role="tabpanel">
          {tabContent}
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

        {workspace.error ? <p className="engine-error">{workspace.error}</p> : null}
      </section>
    </div>
  );
}
