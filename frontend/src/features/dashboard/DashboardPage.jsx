import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DashboardMarketHistoryChart from "./components/DashboardMarketHistoryChart";

function sparkPath(series, width = 132, height = 34, pad = 3) {
  if (!Array.isArray(series) || series.length < 2) {
    return "";
  }

  const values = series.map((point) => Number(point.equity || point.value || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return series
    .map((point, index) => {
      const raw = Number(point.equity || point.value || 0);
      const x = pad + (index / (series.length - 1)) * (width - pad * 2);
      const y = height - pad - ((raw - min) / span) * (height - pad * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function mapCriticalTone(tone) {
  if (tone === "success") return "ok";
  if (tone === "warning") return "warn";
  if (tone === "danger") return "neg";
  return "muted";
}

export default function DashboardFeaturePage({
  activeDeploymentMembers,
  activeDeploymentSet,
  activeStrategy,
  criticalItems,
  scannerExchangeFilter,
  scannerMarketFilter,
  setScannerMarketFilter,
  setScannerExchangeFilter,
  dashboardOpportunities,
  dashboardCounts,
  highestScore,
  marketSummaries,
  strongestMarket,
  strongestExchange,
  formatMoney,
  buyingPower,
  availableFunds,
  brokerAccountType,
  brokerCurrency,
  brokerOpenOrderCount,
  brokerPositionCount,
  dashboardEquityLabel,
  dashboardEquityNote,
  portfolioCash,
  portfolioEquity,
  marginValue,
  cashPct,
  exposurePct,
  openRiskPct,
  pendingApprovalRequests,
  setActiveTab,
  dashboardPendingApprovals,
  formatJsonSummary,
  approvalActionId,
  handleApprovalAction,
  lastScanMatchesActiveStrategy,
  activeStrategyConfig,
  lastScanStrategyName,
  activeHorizonLabel,
  activeStrategyLatestRun,
  formatPercent,
  activeStrategyDeploymentScore,
  OpportunityHeatmap,
  heatmapMode,
  setHeatmapMode,
  setSelectedSectorFilter,
  setHeatmapTimeframe,
  sectorHeatmapData,
  selectedSectorFilter,
  heatmapTimeframe,
  signalChanges,
  signalChangesData,
  groupedSignalChanges,
  setSelectedSymbol,
  setDetailSymbol,
  watchlistMomentum,
  watchlistSymbols,
  setSelectedHistorySymbol,
  ChartPanel,
  equityCurveData,
  drawdownData,
  signalDistributionData,
  SIGNAL_COLORS,
  topOpportunityData,
  selectedHistorySymbol,
  data,
  isLoadingEquityHistory,
  usesBrokerHeadline,
}) {
  const displayCriticalItems = criticalItems.slice(0, 2);
  const displayApprovals = dashboardPendingApprovals.slice(0, 3);
  const displayWatchlist = watchlistMomentum.slice(0, 3);
  const sparkSeries = equityCurveData.map((point, index) => ({
    label: point.label || index,
    equity: Number(point.equity || 0),
  }));
  const historyOptions = Array.from(
    new Set((data?.opportunities || []).map((item) => item.symbol).filter(Boolean)),
  ).slice(0, 50);
  const activeHistorySymbol = selectedHistorySymbol || historyOptions[0] || "";
  const formatBrokerMoney = (value) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? `${brokerCurrency || "USD"} ${number.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : "Not available";
  };
  const moneyCards = usesBrokerHeadline
    ? [
        {
          key: "Cash",
          value: formatBrokerMoney(portfolioCash),
          detail: "Broker account cash",
          bar: 0,
          tone: "accent",
        },
        {
          key: "Buying power",
          value: formatBrokerMoney(buyingPower),
          detail: "Broker-ready order capacity",
          bar: 0,
          tone: "muted",
        },
        {
          key: "Equity",
          value: formatBrokerMoney(portfolioEquity),
          detail: dashboardEquityLabel,
          bar: 100,
          tone: "pos",
        },
        {
          key: "Currency",
          value: brokerCurrency || "-",
          detail: "Broker account currency",
          bar: 0,
          tone: "muted",
        },
        {
          key: "Margin",
          value: Number.isFinite(Number(marginValue))
            ? Number(marginValue).toLocaleString(undefined, { maximumFractionDigits: 3 })
            : "-",
          detail: "Margin requirement / usage",
          bar: exposurePct || 0,
          tone: "warn",
        },
        {
          key: "Account type",
          value: brokerAccountType || "-",
          detail: "Selected broker account",
          bar: 0,
          tone: "muted",
        },
        {
          key: "Positions",
          value: String(brokerPositionCount ?? 0),
          detail: "Broker positions",
          bar: 0,
          tone: "accent",
        },
        {
          key: "Open orders",
          value: String(brokerOpenOrderCount ?? 0),
          detail: "Active broker orders",
          bar: 0,
          tone: "warn",
        },
      ]
    : [
        {
          key: "Cash",
          value: formatMoney(portfolioCash || 0),
          detail: cashPct == null ? "Cash mix unavailable" : `${Number(cashPct).toFixed(2)}% of equity`,
          bar: cashPct || 0,
          tone: "accent",
        },
        {
          key: "Buying power",
          value: formatMoney(buyingPower || 0),
          detail: "Broker-ready order capacity",
          bar: cashPct || 0,
          tone: "muted",
        },
        {
          key: "Equity",
          value: formatMoney(portfolioEquity || 0),
          detail: dashboardEquityLabel,
          bar: 100,
          tone: "pos",
        },
        {
          key: "Available funds",
          value: formatMoney(availableFunds || 0),
          detail: "Deployable or withdrawable funds",
          bar: cashPct || 0,
          tone: "accent",
        },
        {
          key: "Margin",
          value: formatMoney(marginValue || 0),
          detail: "Margin requirement / usage",
          bar: exposurePct || 0,
          tone: "warn",
        },
        {
          key: "Exposure",
          value: exposurePct == null ? "-" : `${Number(exposurePct).toFixed(2)}%`,
          detail: "Gross deployed exposure",
          bar: exposurePct || 0,
          tone: "pos",
        },
        {
          key: "Open risk",
          value: openRiskPct == null ? "-" : `${Number(openRiskPct).toFixed(2)}%`,
          detail: "Risk budget currently at work",
          bar: openRiskPct || 0,
          tone: "warn",
          wide: true,
        },
      ];

  return (
    <>
      <section className="q-attn">
        <div className="q-attn-lead">
          <span className="q-attn-icon">!</span>
          <span>
            {displayCriticalItems.length === 0 ? "System normal" : `${displayCriticalItems.length} need attention`}
          </span>
        </div>
        {displayCriticalItems.length === 0 ? (
          <div className="q-attn-item ok q-attn-wide">
            <div>
              <strong>No urgent actions</strong>
              <span>Engine, safety, alerts, and scan freshness have no critical blockers.</span>
            </div>
          </div>
        ) : (
          displayCriticalItems.map((item) => (
            <div className={`q-attn-item ${mapCriticalTone(item.tone)}`} key={item.key}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </div>
              <button className="q-chip" onClick={item.onClick} type="button">
                {item.action} <span aria-hidden="true">›</span>
              </button>
            </div>
          ))
        )}
      </section>

      <section className="q-money">
        <div className="q-equity">
          <span className="q-eyebrow">{dashboardEquityLabel}</span>
          <div className="q-equity-row">
            <strong className="mono q-equity-val">
              {usesBrokerHeadline ? formatBrokerMoney(portfolioEquity) : formatMoney(portfolioEquity || 0)}
            </strong>
            {sparkSeries.length > 1 ? (
              <svg className="q-spark" viewBox="0 0 132 34" preserveAspectRatio="none" aria-hidden="true">
                <path d={sparkPath(sparkSeries)} fill="none" stroke="var(--pos)" strokeWidth="1.8" />
              </svg>
            ) : null}
          </div>
          <span className="q-equity-note">{dashboardEquityNote}</span>
        </div>

        <div className="q-risk-grid">
          {moneyCards.map((item) => (
            <div className={`q-risk${item.wide ? " wide" : ""}`} key={item.key}>
              <span className="q-risk-label">{item.key}</span>
              <strong className="mono q-risk-val">{item.value}</strong>
              <small className="q-risk-note">{item.detail}</small>
              <span className="q-meter">
                <i className={item.tone} style={{ width: `${Math.max(0, Math.min(100, Number(item.bar) || 0))}%` }} />
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="q-scan">
        <div className="q-scan-block">
          <span className="q-eyebrow">Opportunities found</span>
          <strong className="mono q-scan-big">{dashboardOpportunities.length}</strong>
          <span className="q-scan-meta">Across {sectorHeatmapData.length || 0} sectors</span>
        </div>

        <div className="q-scan-block grow">
          <span className="q-eyebrow">Signal split</span>
          <div className="q-bhs">
            <i className="pos" style={{ width: `${dashboardOpportunities.length ? (dashboardCounts.BUY / dashboardOpportunities.length) * 100 : 0}%` }} />
            <i className="warn" style={{ width: `${dashboardOpportunities.length ? (dashboardCounts.HOLD / dashboardOpportunities.length) * 100 : 0}%` }} />
            <i className="neg" style={{ width: `${dashboardOpportunities.length ? (dashboardCounts.SELL / dashboardOpportunities.length) * 100 : 0}%` }} />
          </div>
          <div className="q-bhs-legend">
            <span><b className="pos mono">{dashboardCounts.BUY}</b> Buy</span>
            <span><b className="warn mono">{dashboardCounts.HOLD}</b> Hold</span>
            <span><b className="neg mono">{dashboardCounts.SELL}</b> Sell</span>
          </div>
        </div>

        <div className="q-scan-block">
          <span className="q-eyebrow">Highest score</span>
          <strong className="mono q-scan-big">{highestScore}</strong>
          <span className="q-scan-meta">
            Strongest market · {strongestMarket}
            {" · "}
            {!strongestExchange || strongestExchange === "UNKNOWN" ? "Exchange unavailable" : strongestExchange}
          </span>
        </div>

        <div className="q-scan-block">
          <span className="q-eyebrow">By market</span>
          <div className="q-mkt">
            <b className="mono">{marketSummaries.markets.US?.count || 0}</b> US
            <span className="muted">·</span>
            <b className="mono">{marketSummaries.markets.Singapore?.count || 0}</b> SG
          </div>
          <div className="q-mkt-filters">
            {[
              ["ALL", "All Markets", "ALL"],
              ["US", "US", "ALL"],
              ["Singapore", "Singapore", "ALL"],
              ["Singapore", "SGX", "SGX"],
              ["US", "NASDAQ", "NASDAQ"],
              ["US", "NYSE", "NYSE"],
            ].map(([marketValue, label, exchangeValue]) => (
              <button
                className={`q-mkt-pill${
                  scannerMarketFilter === marketValue && scannerExchangeFilter === exchangeValue ? " active" : ""
                }`}
                key={`${marketValue}-${exchangeValue}`}
                onClick={() => {
                  setScannerMarketFilter(marketValue);
                  setScannerExchangeFilter(exchangeValue);
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="q-focus">
        <article className="q-card q-appr">
          <div className="q-card-head">
            <div>
              <span className="q-eyebrow">Approval queue</span>
              <h2>{pendingApprovalRequests.length} awaiting review</h2>
            </div>
            <button className="q-chip" onClick={() => setActiveTab("Approvals")} type="button">
              Open Approvals <span aria-hidden="true">›</span>
            </button>
          </div>

          {displayApprovals.length > 0 ? (
            <div className="q-appr-list">
              {displayApprovals.map((request, index) => (
                <div
                  className={`q-appr-card r-${String(request.riskLevel || "MEDIUM").toLowerCase()}`}
                  key={`${request.id || request.symbol || "approval"}-${index}`}
                >
                  <div className="q-appr-top">
                    <div className="q-appr-id">
                      <strong className="mono">{request.symbol}</strong>
                      <span className="q-side">{request.side || "BUY"} · pending</span>
                    </div>
                    <span className={`q-risk-pill r-${String(request.riskLevel || "MEDIUM").toLowerCase()}`}>
                      {request.riskLevel || "MEDIUM"}
                    </span>
                  </div>

                  <div className="q-metrics">
                    <div><span>Score</span><strong className="mono">{request.opportunityScore ?? request.opportunity_score ?? "-"}</strong></div>
                    <div><span>Conf</span><strong className="mono">{request.confidence ?? "-"}</strong></div>
                    <div><span>Qty</span><strong className="mono">{request.quantity ?? "-"}</strong></div>
                    <div><span>Entry</span><strong className="mono">{formatMoney(request.entryPrice || 0)}</strong></div>
                  </div>

                  <p className="q-reason">
                    {request.reason || formatJsonSummary(request.safetyViolationsJson, "Manual review required.")}
                  </p>

                  <div className="q-actions">
                    <button className="q-btn" onClick={() => setActiveTab("Approvals")} type="button">View</button>
                    <button
                      className="q-btn ok"
                      disabled={approvalActionId === request.id}
                      onClick={() => handleApprovalAction(request.id, "approve")}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      className="q-btn no"
                      disabled={approvalActionId === request.id}
                      onClick={() => handleApprovalAction(request.id, "reject")}
                      type="button"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="alerts-empty">No pending trades are waiting for approval.</p>
          )}
        </article>

        <article className="q-card q-strat">
          <div className="q-card-head">
            <div>
              <span className="q-eyebrow">
                {activeDeploymentMembers?.length > 1 ? "Active deployment set" : "Active strategy"}
              </span>
              <h2>{activeDeploymentMembers?.length > 1 ? activeDeploymentSet?.owner?.name || "Active Deployment Set" : activeStrategy.name}</h2>
            </div>
            <span className={`q-pill ${lastScanMatchesActiveStrategy ? "ok" : "warn"}`}>
              {lastScanMatchesActiveStrategy ? "Synced" : "Needs scan"}
            </span>
          </div>
          <p className="q-strat-desc">
            {activeDeploymentMembers?.length > 1
              ? `${activeDeploymentSet?.routed || 0} routed contexts across ${activeDeploymentMembers.length} live strategies. The scanner resolves one strategy per sector × regime cell.`
              : activeStrategy.description}
          </p>
          {activeStrategyConfig?.active && !lastScanMatchesActiveStrategy ? (
            <p className="strategy-sync-warning">
              Visible scan results were generated with {lastScanStrategyName}. Run a new scan to use {activeStrategy.name}.
            </p>
          ) : null}

          <div className="q-strat-grid">
            {[
              ["Horizon", activeHorizonLabel],
              ["BUY threshold", activeStrategy.buy_threshold],
              ["Raw score max", activeStrategy.raw_score_max],
              ["Signal fn", activeStrategy.signal_function || "generate_signal_from_row"],
              ["Latest return", activeStrategyLatestRun?.returnPct == null ? "—" : formatPercent(activeStrategyLatestRun.returnPct)],
              ["Latest Sharpe", activeStrategyLatestRun?.sharpe == null ? "—" : Number(activeStrategyLatestRun.sharpe).toFixed(2)],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong className="mono">{value}</strong>
              </div>
            ))}
          </div>

          <div className="q-strat-foot">
            <div className="q-deploy">
              <span className="q-eyebrow">Deployment readiness</span>
              <div className="q-deploy-row">
                <span className="q-meter lg">
                  <i
                    className={activeStrategyDeploymentScore >= 80 ? "pos" : activeStrategyDeploymentScore >= 60 ? "warn" : "neg"}
                    style={{ width: `${Math.max(0, Math.min(100, Number(activeStrategyDeploymentScore) || 0))}%` }}
                  />
                </span>
                <strong className={`mono ${activeStrategyDeploymentScore >= 80 ? "pos" : activeStrategyDeploymentScore >= 60 ? "warn" : "neg"}`}>
                  {activeStrategyDeploymentScore == null ? "Needs evidence" : `${activeStrategyDeploymentScore}/100`}
                </strong>
              </div>
              <span className="q-deploy-note">
                {activeStrategyLatestRun?.tradeCount
                  ? `${activeStrategyLatestRun.tradeCount} completed trades in latest run`
                  : "No backtest run yet · gates not met"}
              </span>
            </div>
            <details className="q-formula">
              <summary>Scoring formula</summary>
              <code>{activeStrategy.opportunity_score_formula}</code>
              <p>{activeStrategy.proposal_rule}</p>
            </details>
          </div>
        </article>
      </section>

      <OpportunityHeatmap
        heatmapMode={heatmapMode}
        onModeChange={setHeatmapMode}
        onSelectSector={(sector) => {
          setSelectedSectorFilter(sector);
          setActiveTab("Scanner");
        }}
        onTimeframeChange={setHeatmapTimeframe}
        sectors={sectorHeatmapData}
        selectedSector={selectedSectorFilter}
        timeframe={heatmapTimeframe}
      />

      <section className="q-grid2">
        <article className="q-card q-sig">
          <div className="q-card-head">
            <div>
              <span className="q-eyebrow">Recent signal changes</span>
              <h2>{signalChanges.length} tracked</h2>
            </div>
            <span className="q-pill">{signalChangesData.fallback ? "JSON fallback" : "Prisma memory"}</span>
          </div>
          <div className="q-sig-cols">
            {[
              ["NEW_BUY", "New BUY"],
              ["SCORE_UP", "Score Up"],
              ["SCORE_DOWN", "Score Down"],
              ["NEW_SYMBOL", "New Symbol"],
            ].map(([key, label]) => (
              <div className="q-sig-col" key={key}>
                <h3>{label}</h3>
                {(groupedSignalChanges[key] || []).slice(0, 4).map((change, index) => (
                  <details key={`${change.symbol}-${change.change_type}-${change.generated_at}-${index}`}>
                    <summary
                      onClick={() => {
                        setSelectedSymbol(change.symbol);
                        setDetailSymbol(change.symbol);
                      }}
                    >
                      <strong className="mono q-sig-sym">{change.symbol}</strong>
                      <span className="mono q-sig-sc">{change.current_score ?? "-"}</span>
                    </summary>
                    <p>
                      {change.reason ||
                        `${change.previous_signal || "NEW"} to ${change.current_signal || "latest"}; confidence ${change.current_confidence ?? "-"}.`}
                    </p>
                  </details>
                ))}
                {(groupedSignalChanges[key] || []).length === 0 ? (
                  <p className="alerts-empty">No {label.toLowerCase()} changes.</p>
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <article className="q-card q-watch">
          <div className="q-card-head">
            <div>
              <span className="q-eyebrow">Watchlist momentum</span>
              <h2>{watchlistMomentum.length} symbols</h2>
            </div>
            <span className="q-pill">{watchlistSymbols.length} watched</span>
          </div>
          {displayWatchlist.length > 0 ? (
            <div className="q-watch-list">
              {displayWatchlist.map((item, index) => (
                <button
                  className="q-watch-row"
                  key={`${item.symbol || "watch"}-${index}`}
                  onClick={() => {
                    setSelectedHistorySymbol(item.symbol);
                  }}
                  type="button"
                >
                  <span className="mono q-watch-sym">{item.symbol}</span>
                  <span className={`q-badge ${String(item.signal || "HOLD").toLowerCase()}`}>{item.signal}</span>
                  <div className="q-watch-meter">
                    <i
                      className={String(item.signal || "HOLD").toUpperCase() === "BUY" ? "pos" : String(item.signal || "HOLD").toUpperCase() === "SELL" ? "neg" : "warn"}
                      style={{ width: `${Math.max(0, Math.min(100, Number(item.score) || 0))}%` }}
                    />
                  </div>
                  <span className="mono q-watch-num">
                    {Number(item.score || 0).toFixed(2)} <em className="muted">· {Number(item.confidence || 0).toFixed(0)}c</em>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="alerts-empty">Add symbols to the watchlist to track momentum.</p>
          )}
        </article>
      </section>

      <section className="dashboard-chart-section q-chart-section">
        <div className="section-heading">
          <div>
            <p className="q-eyebrow">Portfolio</p>
            <h2>Risk and equity</h2>
          </div>
        </div>
        <div className="charts-grid">
          <ChartPanel
            emptyState="No equity history has been written yet."
            hasData={equityCurveData.length > 0}
            loading={isLoadingEquityHistory && equityCurveData.length === 0}
            subtitle="Ledger-backed account history"
            title="Equity Curve"
          >
            <div className="chart-canvas">
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={equityCurveData}>
                  <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="#9aa9b8" />
                  <YAxis stroke="#9aa9b8" width={72} />
                  <Tooltip contentStyle={{ background: "#111720", border: "1px solid #263242", borderRadius: 8, color: "#eef2f6" }} />
                  <Line dataKey="equity" dot={false} stroke="#4cc38a" strokeWidth={2} type="monotone" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
          <ChartPanel
            emptyState="Drawdown appears once equity history is available."
            hasData={drawdownData.length > 0}
            loading={isLoadingEquityHistory && drawdownData.length === 0}
            subtitle="Computed from the equity curve"
            title="Drawdown"
          >
            <div className="chart-canvas">
              <ResponsiveContainer height="100%" width="100%">
                <LineChart data={drawdownData}>
                  <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="#9aa9b8" />
                  <YAxis stroke="#9aa9b8" width={64} />
                  <Tooltip contentStyle={{ background: "#111720", border: "1px solid #263242", borderRadius: 8, color: "#eef2f6" }} />
                  <Line dataKey="drawdown" dot={false} stroke="#ff6b6b" strokeWidth={2} type="monotone" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
        </div>
      </section>

      <section className="dashboard-chart-section q-chart-section">
        <div className="section-heading">
          <div>
            <p className="q-eyebrow">Market Context</p>
            <h2>Price history</h2>
          </div>
        </div>
        <div className="charts-grid charts-grid--single">
          <ChartPanel
            emptyState="Select a symbol with market data."
            hasData={Boolean(activeHistorySymbol)}
            subtitle={activeHistorySymbol ? `${activeHistorySymbol} from the centralized market-data feed` : "Select a symbol"}
            title="Market Price History"
          >
            <div className="history-chart-toolbar">
              <label htmlFor="history-symbol-select">
                <span>Symbol</span>
                <select
                  id="history-symbol-select"
                  onChange={(event) => {
                    setSelectedHistorySymbol(event.target.value);
                  }}
                  value={activeHistorySymbol}
                >
                  {historyOptions.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <DashboardMarketHistoryChart symbol={activeHistorySymbol} />
          </ChartPanel>
        </div>
      </section>
    </>
  );
}
