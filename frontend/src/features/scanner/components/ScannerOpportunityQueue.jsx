function formatTimeline(history) {
  if (!history?.length) {
    return {
      detected: "Just detected",
      scoreShift: "N/A",
      confidenceShift: "N/A",
      direction: "Fresh",
    };
  }

  const first = history[0];
  const last = history[history.length - 1];
  const firstTime = new Date(first.generated_at || first.generatedAt || Date.now());
  const hoursAgo = Math.max(
    0,
    Math.round((Date.now() - firstTime.getTime()) / (1000 * 60 * 60))
  );
  const scoreStart = Number(first.opportunity_score || 0);
  const scoreEnd = Number(last.opportunity_score || 0);
  const confidenceStart = Number(first.confidence || 0);
  const confidenceEnd = Number(last.confidence || 0);

  return {
    detected: hoursAgo < 1 ? "Detected this hour" : `Detected ${hoursAgo}h ago`,
    scoreShift: `${scoreStart.toFixed(0)} -> ${scoreEnd.toFixed(0)}`,
    confidenceShift: `${confidenceStart.toFixed(0)} -> ${confidenceEnd.toFixed(0)}`,
    direction:
      scoreEnd > scoreStart || confidenceEnd > confidenceStart
        ? "Improving"
        : scoreEnd < scoreStart || confidenceEnd < confidenceStart
          ? "Weakening"
          : "Stable",
  };
}

function getTopReasons(item) {
  return Array.isArray(item.reasons) ? item.reasons.slice(0, 3) : [];
}

function formatPrice(item) {
  const currency = item.currency || "USD";
  if (item.close == null || item.close === "") return `${currency} -`;
  return `${currency} ${Number(item.close).toFixed(2)}`;
}

function buildDeployability(item) {
  const confidence = Number(item.confidence || 0);
  const fit = Number(item.portfolio_fit_score || item.portfolio_fit?.portfolio_fit_score || 0);
  const backtest = Number(item.backtest_return || 0);
  const riskPenalty =
    item.openai_news_reasoning?.allow_trade === false ||
    item.portfolio_fit?.recommendation === "REJECT"
      ? 22
      : item.portfolio_fit?.recommendation === "WAIT"
        ? 12
        : 0;
  return Math.max(0, Math.min(100, Math.round(confidence * 0.45 + fit * 0.3 + backtest * 0.25 - riskPenalty)));
}

function QueueCard({
  compareSelection,
  history,
  isSelected,
  item,
  onInspect,
  onToggleCompare,
  onToggleWatchlist,
  watched,
}) {
  const timeline = formatTimeline(history);
  const reasons = getTopReasons(item);
  const deployability = buildDeployability(item);
  const compareActive = compareSelection.includes(item.symbol);
  const market = item.market || (item.is_sgx ? "Singapore" : "US");
  const exchange = item.exchange || "Exchange unavailable";

  return (
    <article
      className={`scanner-queue-card ${isSelected ? "selected" : ""}`}
      onClick={() => onInspect(item.symbol)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onInspect(item.symbol);
        }
      }}
    >
      <div className="scanner-queue-card-top">
        <div className="scanner-queue-card-symbol">
          <div className={`scanner-signal-badge ${String(item.signal || "HOLD").toLowerCase()}`}>
            {item.signal}
          </div>
          <div>
            <h3>{item.display_symbol || item.symbol}</h3>
            <p>{item.company_name || item.symbol}</p>
            <span>
              {market} · {exchange} · {item.currency || "USD"}
            </span>
          </div>
        </div>

        <div className="scanner-queue-card-headline">
          <div className="scanner-score-pair">
            <span>Score</span>
            <strong>{Number(item.opportunity_score || 0).toFixed(1)}</strong>
          </div>
          <div className="scanner-score-pair">
            <span>Confidence</span>
            <strong>{Number(item.confidence || 0).toFixed(0)}%</strong>
          </div>
          <div className="scanner-score-pair">
            <span>Latest</span>
            <strong>{formatPrice(item)}</strong>
          </div>
        </div>
      </div>

      <div className="scanner-queue-card-middle">
        <div className="scanner-mini-spark">
          <div className="scanner-mini-spark-fill" style={{ width: `${Math.min(100, Math.max(4, Number(item.opportunity_score || 0)))}%` }} />
        </div>

        <div className="scanner-queue-meta-row">
          <span className="scanner-source-pill">{item.strategy_name || "Momentum Lab"}</span>
          <span className="scanner-health-pill">{deployability} deployability</span>
          {watched ? <span className="scanner-watch-pill">Watching</span> : null}
        </div>

        <div className="scanner-reason-row">
          {reasons.map((reason) => (
            <span className="scanner-reason-pill" key={reason}>
              {reason}
            </span>
          ))}
          {Array.isArray(item.reasons) && item.reasons.length > 3 ? (
            <span className="scanner-reason-pill more">+{item.reasons.length - 3} more</span>
          ) : null}
        </div>
      </div>

      <div className="scanner-queue-card-footer">
        <div className="scanner-queue-timeline">
          <span>{timeline.detected}</span>
          <span>Score {timeline.scoreShift}</span>
          <span>Confidence {timeline.confidenceShift}</span>
          <strong className={`scanner-direction ${timeline.direction.toLowerCase()}`}>
            {timeline.direction}
          </strong>
        </div>

        <div className="scanner-queue-actions">
          <button
            className={`scanner-compare-chip ${compareActive ? "active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCompare(item.symbol);
            }}
            type="button"
          >
            {compareActive ? "Comparing" : "Compare"}
          </button>
          <button
            className="scanner-card-action"
            onClick={(event) => {
              event.stopPropagation();
              onInspect(item.symbol);
            }}
            type="button"
          >
            Inspect
          </button>
          <button
            className="scanner-card-action muted"
            onClick={(event) => {
              event.stopPropagation();
              onToggleWatchlist(item.symbol);
            }}
            type="button"
          >
            {watched ? "Unwatch" : "Watch"}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function ScannerOpportunityQueue({
  compareSelection,
  groupedItems,
  histories,
  onInspect,
  onToggleCompare,
  onToggleWatchlist,
  selectedSymbol,
  watchlist,
}) {
  return (
    <div className="scanner-queue">
      {groupedItems.map((group) => (
        <section className="scanner-queue-section" key={group.key}>
          <div className="scanner-queue-section-header">
            <div>
              <p className="eyebrow">{group.label}</p>
              <strong>{group.items.length} opportunities</strong>
            </div>
            <span>{group.description}</span>
          </div>

          <div className="scanner-queue-list">
            {group.items.map((item) => (
              <QueueCard
                compareSelection={compareSelection}
                history={histories[item.symbol] || []}
                isSelected={selectedSymbol === item.symbol}
                item={item}
                key={item.symbol}
                onInspect={onInspect}
                onToggleCompare={onToggleCompare}
                onToggleWatchlist={onToggleWatchlist}
                watched={watchlist.has(item.symbol)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
