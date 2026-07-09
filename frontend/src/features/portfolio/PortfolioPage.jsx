import SummaryPanel from "../../components/dashboard/SummaryPanel";
import RiskDashboard from "../../components/risk/RiskTab";

function getBrokerOrderDisplayPrice(order) {
  if (order?.displayLimitPrice != null && Number.isFinite(Number(order.displayLimitPrice))) {
    return Number(order.displayLimitPrice);
  }
  if (order?.limitPrice != null && Number.isFinite(Number(order.limitPrice))) {
    return Number(order.limitPrice);
  }
  if (
    order?.metadata?.preview?.referencePrice != null &&
    Number.isFinite(Number(order.metadata.preview.referencePrice))
  ) {
    return Number(order.metadata.preview.referencePrice);
  }
  if (
    order?.metadata?.latestStatus?.limitPrice != null &&
    Number.isFinite(Number(order.metadata.latestStatus.limitPrice))
  ) {
    return Number(order.metadata.latestStatus.limitPrice);
  }
  return null;
}

export default function PortfolioPage({
  portfolio,
  formatMoney,
  formatSafetyPercent,
  handleRebuildPortfolio,
  isRebuildingPortfolio,
  manualOpenTradePositions,
  manualOpenTradeValue,
  paperError,
  paperPortfolio,
  portfolioConstructionData,
  portfolioConstructionError,
  portfolioReconciliation,
  portfolioReconciliationError,
  reconciliationSyncState,
  requestBrokerLedgerSync,
  riskDashboardData,
  riskDashboardError,
  setDetailSymbol,
  setSelectedSymbol,
  syncInProgress = false,
}) {
  const {
    activeBrokerOrders = [],
    bestPortfolioAdditions,
    brokerOpenOrders = [],
    brokerPositions = [],
    constructionCash,
    constructionEquity,
    constructionLimits,
    constructionPortfolio,
    constructionPositions,
    constructionRecommendations,
    constructionRisk,
    constructionSectors,
    constructionWarnings,
    constructionWeights,
    headlineCash,
    headlineEquity,
    headlineFees,
    isInternalPaperMode,
    headlineModeLabel,
    inactiveBrokerOrders = [],
    largestConstructionPosition,
    largestConstructionSector,
    paperPositions,
    paperTrades,
    portfolioSection,
    setPortfolioSection,
  } = portfolio;
  return (
        <>
          <section className="portfolio-section-header">
            <div>
              <p className="eyebrow">Portfolio</p>
              <h2>Paper Portfolio Workspace</h2>
            </div>
            <div className="portfolio-section-tabs">
              {["Overview", "Construction", "Risk"].map((section) => (
                <button
                  className={portfolioSection === section ? "active" : ""}
                  key={section}
                  onClick={() => setPortfolioSection(section)}
                  type="button"
                >
                  {section}
                </button>
              ))}
            </div>
          </section>

          {portfolioSection === "Overview" && (
            <>
          <section className="alerts-panel">
        <div className="alerts-panel-header">
          <div>
            <p className="eyebrow">{headlineModeLabel}</p>
            <h2>${Number(headlineEquity).toFixed(2)}</h2>
          </div>
          <span>
            Cash ${Number(headlineCash).toFixed(2)} · Fees $
            {Number(headlineFees ?? 0).toFixed(2)}
          </span>
        </div>

        {paperError && <p className="engine-error">{paperError}</p>}
        <div className="portfolio-overview-stack">
          <section className="portfolio-overview-section">
            <div className="alerts-panel-header">
              <div>
                <p className="eyebrow">Broker Account</p>
                <h2>{headlineModeLabel}</h2>
              </div>
              <span>
                {brokerPositions.length} positions · {activeBrokerOrders.length} active orders
              </span>
            </div>

            <div className="paper-portfolio-grid">
              <div>
                <span>Broker Equity</span>
                <strong>{formatMoney(headlineEquity)}</strong>
              </div>
              <div>
                <span>Broker Cash</span>
                <strong>{formatMoney(headlineCash)}</strong>
              </div>
              <div>
                <span>Broker Positions</span>
                <strong>{brokerPositions.length}</strong>
              </div>
              <div>
                <span>Active Open Orders</span>
                <strong>{activeBrokerOrders.length}</strong>
              </div>
              <div>
                <span>Recent Inactive Orders</span>
                <strong>{inactiveBrokerOrders.length}</strong>
              </div>
            </div>

            <div className="portfolio-broker-layout">
              <article className="portfolio-broker-card">
                <div className="alerts-panel-header">
                  <div>
                    <p className="eyebrow">Broker Positions</p>
                    <h2>{brokerPositions.length} tracked</h2>
                  </div>
                </div>
                {brokerPositions.length > 0 ? (
                  <div className="paper-table">
                    {brokerPositions.map((position) => (
                      <article className="paper-row" key={`${position.symbol}-${position.brokerPositionId || position.symbol}`}>
                        <div>
                          <span>Symbol</span>
                          <strong>{position.symbol}</strong>
                        </div>
                        <div>
                          <span>Qty</span>
                          <strong>{position.quantity}</strong>
                        </div>
                        <div>
                          <span>Average Cost</span>
                          <strong>{formatMoney(position.averageCost, position.currency || "USD")}</strong>
                        </div>
                        <div>
                          <span>Last</span>
                          <strong>{formatMoney(position.lastPrice, position.currency || "USD")}</strong>
                        </div>
                        <div>
                          <span>Market Value</span>
                          <strong>{formatMoney(position.marketValue, position.currency || "USD")}</strong>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="alerts-empty">No broker positions loaded from the connected account.</p>
                )}
              </article>

              <article className="portfolio-broker-card">
                <div className="alerts-panel-header">
                  <div>
                    <p className="eyebrow">Broker Orders</p>
                    <h2>{brokerOpenOrders.length} tracked</h2>
                  </div>
                  <span>Active first, then recent inactive broker orders</span>
                </div>
                {brokerOpenOrders.length > 0 ? (
                  <div className="paper-table">
                    {[...activeBrokerOrders, ...inactiveBrokerOrders.slice(0, 5)].map((order) => {
                      const displayPrice = getBrokerOrderDisplayPrice(order);
                      return (
                      <article
                        className={`paper-row portfolio-broker-order-row ${String(order.status || "unknown").toLowerCase()}`}
                        key={`${order.brokerOrderId || order.clientOrderId || order.symbol}-${order.updatedAt || order.createdAt || order.status}`}
                      >
                        <div>
                          <span>Symbol</span>
                          <strong>{order.symbol}</strong>
                        </div>
                        <div>
                          <span>Side / Type</span>
                          <strong>{order.side} · {order.orderType}</strong>
                        </div>
                        <div>
                          <span>Status</span>
                          <strong>{order.status}</strong>
                        </div>
                        <div>
                          <span>Quantity</span>
                          <strong>{order.filledQuantity || 0} / {order.quantity}</strong>
                        </div>
                        <div>
                          <span>Limit / Avg Fill</span>
                          <strong>
                            {displayPrice != null ? formatMoney(displayPrice) : "Market"}
                            {" / "}
                            {order.averageFillPrice != null && Number(order.averageFillPrice) > 0
                              ? formatMoney(order.averageFillPrice)
                              : "-"}
                          </strong>
                        </div>
                      </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="alerts-empty">No broker orders are currently available from the connected account.</p>
                )}
              </article>
            </div>
          </section>

          <section className="portfolio-overview-section">
            <div className="alerts-panel-header">
              <div>
                <p className="eyebrow">Ledger / Reconciliation</p>
                <h2>
                  {portfolioReconciliation?.ledgerVerified === false
                    ? "Ledger integrity failed"
                    : portfolioReconciliation?.matched
                      ? "Ledger Verified"
                      : "Reconciliation required"}
                </h2>
              </div>
              <span
                className={`accounting-status ${
                  portfolioReconciliation?.matched ? "verified" : "warning"
                }`}
              >
                {portfolioReconciliation?.status || "CHECKING"}
              </span>
            </div>

            <section className="accounting-health-panel">
              {reconciliationSyncState?.status && reconciliationSyncState.status !== "IDLE" ? (
                <div
                  className={`portfolio-sync-notice ${
                    reconciliationSyncState.status === "FAILED"
                      ? "warning"
                      : reconciliationSyncState.status === "SUCCESS"
                        ? "success"
                        : "active"
                  }`}
                >
                  <div className="portfolio-sync-notice__copy">
                    <strong>
                      {reconciliationSyncState.status === "FAILED"
                        ? "Broker reconciliation needs attention"
                        : reconciliationSyncState.status === "SUCCESS"
                          ? "Broker successfully synchronized."
                          : "Broker reconciliation in progress..."}
                    </strong>
                    <span>
                      {reconciliationSyncState.error ||
                        reconciliationSyncState.message ||
                        "Reconciling broker cash and positions in the background."}
                    </span>
                  </div>
                  <div className="portfolio-sync-notice__actions">
                    {syncInProgress ? <span className="status-pill info">Syncing</span> : null}
                    {reconciliationSyncState.status === "FAILED" ? (
                      <button
                        className="direction-toggle"
                        disabled={syncInProgress}
                        onClick={() =>
                          requestBrokerLedgerSync?.({
                            force: true,
                            reason: "manual retry after auto-sync failure",
                          })
                        }
                        type="button"
                      >
                        Retry Sync
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="accounting-health-grid">
                <div>
                  <span>Ledger Verified</span>
                  <strong>
                    {portfolioReconciliation?.ledgerVerified == null
                      ? "-"
                      : portfolioReconciliation.ledgerVerified
                        ? "Yes"
                        : "No"}
                  </strong>
                </div>
                <div>
                  <span>Last Reconciliation</span>
                  <strong>
                    {portfolioReconciliation?.lastChecked
                      ? new Date(portfolioReconciliation.lastChecked).toLocaleString()
                      : "-"}
                  </strong>
                </div>
                <div>
                  <span>Mismatch Amount</span>
                  <strong>{formatMoney(portfolioReconciliation?.mismatchAmount)}</strong>
                </div>
                <div>
                  <span>Missing Events</span>
                  <strong>{portfolioReconciliation?.missingEvents?.length || 0}</strong>
                </div>
              </div>

              {portfolioReconciliation?.repairAction && (
                <p className="accounting-repair-note">
                  Repair action: {portfolioReconciliation.repairAction}
                </p>
              )}
              {portfolioReconciliationError && (
                <p className="engine-error">{portfolioReconciliationError}</p>
              )}
              <button
                className="direction-toggle"
                disabled={
                  isRebuildingPortfolio ||
                  portfolioReconciliation?.ledgerVerified === false ||
                  syncInProgress
                }
                onClick={handleRebuildPortfolio}
                type="button"
              >
                {isRebuildingPortfolio ? "Rebuilding…" : "Rebuild Portfolio"}
              </button>
            </section>

            <div className="paper-portfolio-grid">
              <div>
                <span>Realized P/L</span>
                <strong
                  className={Number(paperPortfolio?.realized_pnl ?? 0) >= 0 ? "positive" : "negative"}
                >
                  ${Number(paperPortfolio?.realized_pnl ?? 0).toFixed(2)}
                </strong>
              </div>
              <div>
                <span>Ledger Positions</span>
                <strong>{paperPositions.length}</strong>
              </div>
              <div>
                <span>Paper Trades</span>
                <strong>{paperTrades.length}</strong>
              </div>
            </div>

            {paperPositions.length > 0 ? (
              <div className="paper-table">
                {paperPositions.map((position) => (
                  <article className="paper-row" key={position.symbol}>
                    <div>
                      <span>Symbol</span>
                      <strong>{position.symbol}</strong>
                    </div>
                    <div>
                      <span>Qty</span>
                      <strong>{position.quantity}</strong>
                    </div>
                    <div>
                      <span>Avg</span>
                      <strong>{Number(position.avg_price).toFixed(2)}</strong>
                    </div>
                    <div>
                      <span>Last</span>
                      <strong>{Number(position.last_price).toFixed(2)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="alerts-empty">No ledger-backed paper positions yet.</p>
            )}

            {paperTrades.length > 0 ? (
              <div className="paper-table">
                {paperTrades.slice(-5).reverse().map((trade) => (
                  <article className="paper-row" key={trade.id}>
                    <div>
                      <span>Trade</span>
                      <strong>
                        {trade.side} {trade.symbol}
                      </strong>
                    </div>
                    <div>
                      <span>Type</span>
                      <strong>{trade.order_type}</strong>
                    </div>
                    <div>
                      <span>Fill</span>
                      <strong>{Number(trade.fill_price).toFixed(2)}</strong>
                    </div>
                    <div>
                      <span>Fee</span>
                      <strong>${Number(trade.fee).toFixed(2)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="alerts-empty">No paper trade fills recorded yet.</p>
            )}
          </section>

          {isInternalPaperMode && (
          <section className="portfolio-overview-section portfolio-journal-positions">
            <div className="alerts-panel-header">
              <div>
                <p className="eyebrow">Manual Journal</p>
                <h2>{manualOpenTradePositions.length} open</h2>
              </div>
              <span>
                Journal exposure ${manualOpenTradeValue.toFixed(2)} · From Trades tab
              </span>
            </div>

            <div className="paper-portfolio-grid">
              <div>
                <span>Journal Open Trades</span>
                <strong>{manualOpenTradePositions.length}</strong>
              </div>
              <div>
                <span>Journal Exposure</span>
                <strong>${manualOpenTradeValue.toFixed(2)}</strong>
              </div>
            </div>

            {manualOpenTradePositions.length > 0 ? (
              <div className="paper-table">
                {manualOpenTradePositions.map((trade) => (
                  <article className="paper-row" key={trade.id}>
                    <div>
                      <span>Symbol</span>
                      <strong>{trade.symbol}</strong>
                    </div>
                    <div>
                      <span>Side / Qty</span>
                      <strong>
                        {trade.side} {trade.quantity}
                      </strong>
                    </div>
                    <div>
                      <span>Entry</span>
                      <strong>${trade.entryPrice.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span>Latest</span>
                      <strong>
                        {trade.latestClose ? `$${trade.latestClose.toFixed(2)}` : "No scan price"}
                      </strong>
                    </div>
                    <div>
                      <span>Unrealized P/L</span>
                      <strong
                        className={
                          trade.unrealizedPnL == null || trade.unrealizedPnL >= 0
                            ? "positive"
                            : "negative"
                        }
                      >
                        {trade.unrealizedPnL == null
                          ? "-"
                          : `$${trade.unrealizedPnL.toFixed(2)}`}
                      </strong>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="alerts-empty">No open manual trades logged yet.</p>
            )}
          </section>
          )}
        </div>
          </section>
            </>
          )}

          {portfolioSection === "Construction" && (
            <section className="alerts-panel portfolio-construction-panel">
              <div className="alerts-panel-header">
                <div>
                  <p className="eyebrow">Construction</p>
                  <h2>Portfolio Allocation Engine</h2>
                </div>
                <span>
                  {portfolioConstructionData?.generated_at
                    ? `Updated ${new Date(portfolioConstructionData.generated_at).toLocaleString()}`
                    : "Uses current portfolio, proposed orders, and scanner data"}
                </span>
              </div>

              {portfolioConstructionError && (
                <p className="engine-error">{portfolioConstructionError}</p>
              )}

              <section className="summary-grid">
                <SummaryPanel
                  label="Portfolio Health Score"
                  value={
                    constructionPortfolio.portfolio_health_score == null
                      ? "-"
                      : `${constructionPortfolio.portfolio_health_score}/100`
                  }
                />
                <SummaryPanel
                  label="Cash Allocation"
                  value={
                    constructionPortfolio.cash_pct == null
                      ? constructionEquity
                        ? `${((constructionCash / constructionEquity) * 100).toFixed(2)}%`
                        : "-"
                      : formatSafetyPercent(constructionPortfolio.cash_pct)
                  }
                />
                <SummaryPanel
                  label="Invested Allocation"
                  value={
                    constructionPortfolio.invested_pct == null
                      ? constructionEquity
                        ? `${(
                            ((constructionEquity - constructionCash) /
                              constructionEquity) *
                            100
                          ).toFixed(2)}%`
                        : "-"
                      : formatSafetyPercent(constructionPortfolio.invested_pct)
                  }
                />
                <SummaryPanel
                  label="Largest Position"
                  value={
                    constructionWeights.largest_position_symbol
                      ? `${constructionWeights.largest_position_symbol} ${formatSafetyPercent(
                          constructionWeights.largest_position_pct
                        )}`
                      : largestConstructionPosition
                        ? `${largestConstructionPosition.symbol} ${(
                            (Number(largestConstructionPosition.notional || 0) /
                              constructionEquity) *
                            100
                          ).toFixed(2)}%`
                        : "-"
                  }
                />
                <SummaryPanel
                  label="Largest Sector"
                  value={
                    constructionWeights.largest_sector
                      ? `${constructionWeights.largest_sector} ${formatSafetyPercent(
                          constructionWeights.largest_sector_pct
                        )}`
                      : largestConstructionSector
                        ? `${largestConstructionSector.sector} ${formatSafetyPercent(
                            largestConstructionSector.weight_pct ??
                              largestConstructionSector.pct
                          )}`
                        : "-"
                  }
                />
                <SummaryPanel
                  label="Open Risk %"
                  value={
                    constructionRisk.open_risk_pct == null
                      ? "-"
                      : formatSafetyPercent(constructionRisk.open_risk_pct)
                  }
                />
              </section>

              <section className="portfolio-construction-card-grid">
                <article className="portfolio-construction-card warning">
                  <span>Concentration Warning</span>
                  <strong>
                    {(constructionWarnings.concentration || []).length || 0} active
                  </strong>
                  <p>
                    {(constructionWarnings.concentration || [])[0]?.explanation ||
                      (constructionWarnings.concentration || [])[0]?.type ||
                      "No position or sector concentration warnings."}
                  </p>
                </article>
                <article className="portfolio-construction-card warning">
                  <span>Correlation Warning</span>
                  <strong>
                    {(constructionWarnings.correlated_exposure || []).length || 0} active
                  </strong>
                  <p>
                    {(constructionWarnings.correlated_exposure || [])[0]?.explanation ||
                      "No same-sector clustering warnings."}
                  </p>
                </article>
                <article className="portfolio-construction-card">
                  <span>Suggested Max Position Size</span>
                  <strong>
                    {formatSafetyPercent(constructionLimits.max_position_size_pct)}
                  </strong>
                  <p>{formatMoney(constructionLimits.max_position_size_dollars)}</p>
                </article>
                <article className="portfolio-construction-card">
                  <span>Suggested Max Sector Size</span>
                  <strong>
                    {formatSafetyPercent(constructionLimits.max_sector_size_pct)}
                  </strong>
                  <p>{formatMoney(constructionLimits.max_sector_size_dollars)}</p>
                </article>
                <article className="portfolio-construction-card">
                  <span>Available Capital to Deploy</span>
                  <strong>
                    {formatMoney(constructionPortfolio.available_capital_to_deploy)}
                  </strong>
                  <p>Bound by cash and max exposure limits.</p>
                </article>
              </section>

              <section className="risk-table-grid">
                <article className="risk-table-card">
                  <div className="alerts-panel-header">
                    <div>
                      <p className="eyebrow">Construction Recommendations</p>
                      <h2>{constructionRecommendations.length} recommendations</h2>
                    </div>
                  </div>
                  {constructionRecommendations.length > 0 ? (
                    <div className="portfolio-recommendation-list">
                      {constructionRecommendations.map((recommendation, index) => (
                        <article
                          className={`portfolio-recommendation ${String(
                            recommendation.severity || "LOW"
                          ).toLowerCase()}`}
                          key={`${recommendation.type}-${index}`}
                        >
                          <span>{recommendation.type}</span>
                          <strong>{recommendation.title}</strong>
                          <p>{recommendation.explanation}</p>
                          <small>{recommendation.recommended_action}</small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="alerts-empty">No construction recommendations yet.</p>
                  )}
                </article>

                <article className="risk-table-card">
                  <div className="alerts-panel-header">
                    <div>
                      <p className="eyebrow">Best Portfolio Additions</p>
                      <h2>{bestPortfolioAdditions.length} candidates</h2>
                    </div>
                    <span>Ranked by portfolio fit first</span>
                  </div>
                  {bestPortfolioAdditions.length > 0 ? (
                    <div className="risk-table portfolio-additions-table">
                      <div className="risk-table-head portfolio-addition-row">
                        <span>Symbol</span>
                        <span>Signal Score</span>
                        <span>Fit Score</span>
                        <span>Sector</span>
                        <span>Recommendation</span>
                        <span>Reason</span>
                      </div>
                      {bestPortfolioAdditions.map((item) => (
                        <button
                          className="risk-table-row portfolio-addition-row"
                          key={item.symbol}
                          onClick={() => {
                            setSelectedSymbol(item.symbol);
                            setDetailSymbol(item.symbol);
                          }}
                          type="button"
                        >
                          <strong>{item.symbol}</strong>
                          <span>{Number(item.opportunity_score || 0).toFixed(2)}</span>
                          <span>{item.portfolioFitScore.toFixed(0)}</span>
                          <span>{item.sector || "UNKNOWN"}</span>
                          <span>{item.portfolioRecommendation}</span>
                          <span>{item.portfolioReason}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="alerts-empty">No scanner opportunities available.</p>
                  )}
                </article>
              </section>

              <section className="risk-table-grid">
                <article className="risk-table-card">
                  <div className="alerts-panel-header">
                    <div>
                      <p className="eyebrow">Position Weights</p>
                      <h2>{constructionPositions.length} positions</h2>
                    </div>
                  </div>
                  {constructionPositions.length > 0 ? (
                    <div className="risk-table">
                      <div className="risk-table-head compact">
                        <span>Symbol</span>
                        <span>Sector</span>
                        <span>Weight</span>
                      </div>
                      {constructionPositions.map((position) => (
                        <div className="risk-table-row compact" key={position.symbol}>
                          <strong>{position.symbol}</strong>
                          <span>{position.sector || "UNKNOWN"}</span>
                          <span>
                            {position.weight_pct == null
                              ? constructionEquity
                                ? `${(
                                    (Number(position.notional || 0) /
                                      constructionEquity) *
                                    100
                                  ).toFixed(2)}%`
                                : "-"
                              : formatSafetyPercent(position.weight_pct)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="alerts-empty">No open paper positions.</p>
                  )}
                </article>

                <article className="risk-table-card">
                  <div className="alerts-panel-header">
                    <div>
                      <p className="eyebrow">Sector Weights</p>
                      <h2>{constructionSectors.length} sectors</h2>
                    </div>
                    <span>
                      Largest {constructionWeights.largest_sector || largestConstructionSector?.sector || "-"}
                    </span>
                  </div>
                  {constructionSectors.length > 0 ? (
                    <div className="risk-table">
                      <div className="risk-table-head compact">
                        <span>Sector</span>
                        <span>Weight</span>
                        <span>Positions</span>
                      </div>
                      {constructionSectors.map((sector) => (
                        <div className="risk-table-row compact" key={sector.sector}>
                          <strong>{sector.sector}</strong>
                          <span>{formatSafetyPercent(sector.weight_pct ?? sector.pct)}</span>
                          <span>{sector.positions}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="alerts-empty">No sector exposure available yet.</p>
                  )}
                </article>
              </section>
            </section>
          )}

          {portfolioSection === "Risk" && (
            <RiskDashboard
              data={riskDashboardData}
              error={riskDashboardError}
              formatMoney={formatMoney}
            />
          )}
        </>
  );
}
