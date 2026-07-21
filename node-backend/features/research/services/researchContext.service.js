const { requireUserId } = require("../../../repositories/ownership");
const { createResearchEvidenceItem } = require("./researchEvidence.service");

const INDEX_SYMBOLS = ["^GSPC", "^IXIC", "^DJI", "^RUT", "^VIX"];
const SECTOR_ETFS = Object.freeze({ Technology: "XLK", Healthcare: "XLV", Financials: "XLF", Energy: "XLE", Industrials: "XLI", "Consumer Discretionary": "XLY", "Consumer Staples": "XLP", Utilities: "XLU", "Real Estate": "XLRE", Materials: "XLB", "Communication Services": "XLC", Semiconductors: "SMH" });
const MAX_QUOTES = 20;

function timestamp(value) {
  if (!value) return null;
  const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeNewsEvent(event = {}, fallback = {}) {
  const title = event.title || event.headline || event.summary || event.event || "";
  if (!title) return null;
  const publishedAt = timestamp(event.publishedAt || event.published_at || event.timestamp || event.date);
  const sourceName = event.sourceName || event.source || event.publisher || "Scanner news context";
  const lowerSource = String(sourceName).toLowerCase();
  const sourceQuality = /sec|federal reserve|company|investor relations|government|official/.test(lowerSource) ? "HIGH" : /reuters|bloomberg|associated press|wsj|financial times/.test(lowerSource) ? "HIGH" : "MEDIUM";
  const eventType = String(event.eventType || event.type || "NEWS").toUpperCase();
  return {
    id: String(event.id || event.url || `${fallback.symbol || "market"}:${title.slice(0, 80)}`), title: String(title).slice(0, 320),
    sourceName: String(sourceName), sourceQuality, publishedAt, eventType,
    symbol: String(event.symbol || fallback.symbol || ""), sector: String(event.sector || fallback.sector || ""),
    sentiment: event.sentiment || null, relevanceScore: Number(event.relevanceScore ?? event.relevance_score ?? 50) || 50,
  };
}

function strategyMetricEvidence(add, experiment) {
  const run = experiment.runs?.[0];
  const walkForward = experiment.walkForwardRuns?.[0];
  const stress = experiment.stressResults?.[0];
  const version = experiment.versions?.[0];
  const common = { sourceName: `Strategy Lab: ${experiment.name}`, sourceQuality: "HIGH", theme: experiment.name, relevanceScore: 78 };
  [["ReturnPct", run?.returnPct], ["Sharpe", run?.sharpe], ["MaxDrawdown", run?.maxDrawdown], ["TradeCount", run?.tradeCount]].forEach(([metricName, metricValue]) => add({ ...common, sourceType: "BACKTEST", sourceId: run?.id, metricName, metricValue, timestamp: run?.createdAt, interpretation: `Latest saved backtest ${metricName} for ${experiment.name}.`, strength: "HIGH" }));
  [["OOSReturn", walkForward?.oosReturn], ["OOSSharpe", walkForward?.oosSharpe], ["StabilityScore", walkForward?.stabilityScore]].forEach(([metricName, metricValue]) => add({ ...common, sourceType: "WALK_FORWARD", sourceId: walkForward?.id, metricName, metricValue, timestamp: walkForward?.createdAt, interpretation: `Latest saved walk-forward ${metricName} for ${experiment.name}.`, strength: "HIGH" }));
  [["MedianReturn", stress?.medianReturn], ["WorstReturn", stress?.worstReturn], ["RiskOfRuin", stress?.riskOfRuin]].forEach(([metricName, metricValue]) => add({ ...common, sourceType: "MONTE_CARLO", sourceId: stress?.id, metricName, metricValue, timestamp: stress?.createdAt, interpretation: `Latest saved Monte Carlo ${metricName} for ${experiment.name}.`, strength: "MEDIUM" }));
  add({ ...common, sourceType: "LIFECYCLE", sourceId: version?.id || experiment.id, metricName: "Status", metricValue: version?.deploymentStatus || experiment.status, timestamp: version?.createdAt || experiment.updatedAt, interpretation: `Current saved lifecycle state for ${experiment.name}.`, strength: "HIGH" });
}

function snapshotEvidence(add, snapshot) {
  const simulation = snapshot?.simulationJson || {};
  const matrix = snapshot?.matrixJson || {};
  const sourceId = snapshot?.id;
  const timestampValue = snapshot?.createdAt;
  const metrics = simulation.metrics || simulation.result?.metrics || {};
  [["CombinedReturn", metrics.combinedReturn ?? metrics.returnPct], ["CombinedSharpe", metrics.combinedSharpe ?? metrics.sharpe], ["MaxDrawdown", metrics.maxDrawdown]].forEach(([metricName, metricValue]) => add({ sourceType: "PORTFOLIO_SIMULATION", sourceId, sourceName: "Saved portfolio simulation", sourceQuality: "HIGH", metricName, metricValue, timestamp: timestampValue, interpretation: `Latest saved portfolio simulation ${metricName}.`, strength: "MEDIUM", relevanceScore: 72 }));
  const replayMetrics = matrix.metrics || matrix.result?.metrics || {};
  [["CombinedReturn", replayMetrics.combinedReturn ?? replayMetrics.returnPct], ["CombinedDrawdown", replayMetrics.combinedDrawdown ?? replayMetrics.maxDrawdown]].forEach(([metricName, metricValue]) => add({ sourceType: "MATRIX_REPLAY", sourceId, sourceName: "Saved matrix replay", sourceQuality: "HIGH", metricName, metricValue, timestamp: timestampValue, interpretation: `Latest saved matrix replay ${metricName}.`, strength: "MEDIUM", relevanceScore: 74 }));
}

function createResearchContextService({ getQuotes, readScanResultsWithHistory, buildDataHealth, watchlistRepository, portfolioContextService, prisma, now = () => new Date() }) {
  async function build(userId, request = {}) {
    const ownerId = requireUserId(userId);
    const workflow = String(request.workflow || "QUESTION").toUpperCase();
    const [scanResult, watchlistResult, portfolioResult, healthResult, strategyResult, deploymentResult] = await Promise.allSettled([
      readScanResultsWithHistory(ownerId), watchlistRepository.list(ownerId),
      portfolioContextService.buildContext(ownerId, { workflow: "RESEARCH", question: request.question || "Market research" }),
      buildDataHealth(ownerId),
      prisma?.strategyExperiment?.findMany ? prisma.strategyExperiment.findMany({ where: { userId: ownerId }, orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, name: true, status: true, updatedAt: true, runs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, returnPct: true, cagr: true, sharpe: true, maxDrawdown: true, winRate: true, volatility: true, tradeCount: true, period: true, createdAt: true } }, walkForwardRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, oosReturn: true, oosSharpe: true, oosDrawdown: true, overfitRatio: true, returnDecay: true, stabilityScore: true, createdAt: true } }, stressResults: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, simulationCount: true, medianReturn: true, worstReturn: true, riskOfRuin: true, probability20Drawdown: true, expectedCagr: true, createdAt: true } }, versions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, deploymentStatus: true, createdAt: true } } } }) : [],
      prisma?.strategyDeploymentSet?.findUnique ? prisma.strategyDeploymentSet.findUnique({ where: { userId: ownerId }, select: { id: true, name: true, updatedAt: true, routes: { orderBy: { updatedAt: "desc" }, take: 40, select: { id: true, sector: true, regime: true, status: true, allocationPct: true, evidenceStatus: true, updatedAt: true, selectedExperiment: { select: { name: true } } } }, snapshots: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, simulationJson: true, matrixJson: true, createdAt: true } } } }) : null,
    ]);
    const scan = scanResult.status === "fulfilled" ? scanResult.value : { opportunities: [] };
    const watchlist = watchlistResult.status === "fulfilled" ? watchlistResult.value : [];
    const portfolio = portfolioResult.status === "fulfilled" ? portfolioResult.value : null;
    const dataHealth = healthResult.status === "fulfilled" ? healthResult.value : { is_stale: true };
    const strategies = strategyResult.status === "fulfilled" ? strategyResult.value || [] : [];
    const deployment = deploymentResult.status === "fulfilled" ? deploymentResult.value : null;
    const opportunities = (scan.opportunities || []).slice(0, 30);
    const knownSymbols = new Set([
      ...watchlist.map((item) => item.symbol), ...(portfolio?.positions || []).map((item) => item.symbol),
      ...opportunities.map((item) => item.symbol),
    ].map((symbol) => String(symbol || "").toUpperCase()).filter(Boolean));
    const requestedSymbols = [...new Set([request.symbol, ...(request.symbols || [])].map((symbol) => String(symbol || "").toUpperCase()).filter(Boolean))];
    const questionTokens = String(request.question || "").toUpperCase().match(/\b[A-Z]{1,5}(?:\.[A-Z]{1,2})?\b/g) || [];
    questionTokens.filter((token) => knownSymbols.has(token)).forEach((token) => requestedSymbols.push(token));
    const sector = String(request.sector || request.theme || "").trim();
    let quoteSymbols = [];
    if (["MARKET_OVERVIEW", "MARKET_IMPACT", "DEEP_RESEARCH"].includes(workflow)) quoteSymbols = [...requestedSymbols, ...INDEX_SYMBOLS, ...Object.values(SECTOR_ETFS)];
    else if (["SYMBOL_RESEARCH", "COMPANY_RESEARCH", "COMPARISON_RESEARCH"].includes(workflow)) quoteSymbols = [...requestedSymbols, ...INDEX_SYMBOLS.slice(0, 3)];
    else if (["SECTOR_RESEARCH", "THEME_RESEARCH"].includes(workflow)) quoteSymbols = [SECTOR_ETFS[sector] || "SPY", ...requestedSymbols, ...INDEX_SYMBOLS.slice(0, 3)];
    else if (workflow === "WATCHLIST_SUMMARY") quoteSymbols = watchlist.map((item) => item.symbol).slice(0, 15);
    else if (workflow === "SCANNER_EXPLANATION") quoteSymbols = opportunities.slice(0, 10).map((item) => item.symbol);
    else quoteSymbols = [...requestedSymbols, ...INDEX_SYMBOLS.slice(0, 3)];
    quoteSymbols = [...new Set(quoteSymbols.filter(Boolean))].slice(0, MAX_QUOTES);
    const quotes = quoteSymbols.length ? await getQuotes(ownerId, quoteSymbols).catch(() => []) : [];

    const portfolioSymbols = new Set((portfolio?.positions || []).map((item) => item.symbol));
    const watchlistSymbols = new Set(watchlist.map((item) => item.symbol));
    const scannerSymbols = new Set(opportunities.map((item) => item.symbol));
    const relevance = (symbol, base = 20) => Math.min(100, base + (portfolioSymbols.has(symbol) ? 35 : 0) + (watchlistSymbols.has(symbol) ? 20 : 0) + (scannerSymbols.has(symbol) ? 15 : 0));
    const evidence = [];
    const add = (input) => { const item = createResearchEvidenceItem(input); if (item) evidence.push(item); };
    quotes.forEach((quote) => {
      add({ sourceType: "MARKET_DATA", sourceId: `${quote.provider || quote.source}:${quote.symbol}`, sourceName: quote.source || quote.provider || "Market data provider", sourceQuality: "HIGH", symbol: quote.symbol, metricName: "ChangePercent", metricValue: quote.quote?.changePercent, timestamp: quote.lastUpdated, interpretation: "Latest cached/provider market price change.", strength: quote.isStale ? "LOW" : "HIGH", relevanceScore: relevance(quote.symbol, INDEX_SYMBOLS.includes(quote.symbol) ? 50 : 25) });
      add({ sourceType: "MARKET_DATA", sourceId: `${quote.provider || quote.source}:${quote.symbol}`, sourceName: quote.source || quote.provider || "Market data provider", sourceQuality: "HIGH", symbol: quote.symbol, metricName: "LastPrice", metricValue: quote.quote?.last, timestamp: quote.lastUpdated, interpretation: "Latest cached/provider market price.", strength: quote.isStale ? "LOW" : "HIGH", relevanceScore: relevance(quote.symbol) });
    });
    opportunities.forEach((item) => {
      add({ sourceType: "SCANNER_RESULT", sourceId: item.id || `${scan.scan_id}:${item.symbol}`, sourceName: "Quant's Trade Scanner", sourceQuality: "HIGH", symbol: item.symbol, sector: item.sector, metricName: "OpportunityScore", metricValue: item.opportunity_score ?? item.opportunityScore, timestamp: item.scan_timestamp || scan.generated_at, interpretation: `Latest scanner result with signal ${item.signal || "UNKNOWN"}.`, strength: dataHealth.is_stale ? "LOW" : "HIGH", relevanceScore: relevance(item.symbol, Number(item.opportunity_score ?? item.opportunityScore) || 20) });
    });
    watchlist.slice(0, 30).forEach((item) => add({ sourceType: "WATCHLIST", sourceId: item.id || item.symbol, sourceName: "User Watchlist", sourceQuality: "HIGH", symbol: item.symbol, metricName: "Membership", metricValue: "WATCHLISTED", timestamp: item.updatedAt || item.createdAt, interpretation: "Symbol is on the authenticated user's watchlist.", strength: "HIGH", relevanceScore: 70 }));
    (portfolio?.positions || []).slice(0, 30).forEach((item) => add({ sourceType: "PORTFOLIO_POSITION", sourceId: item.id || `${portfolio.provider}:${item.symbol}`, sourceName: `Selected ${portfolio.provider} portfolio`, sourceQuality: "HIGH", symbol: item.symbol, sector: item.sector, metricName: "PortfolioWeightPct", metricValue: item.portfolioWeightPct, timestamp: item.priceTimestamp || portfolio.freshness?.portfolioSnapshotTimestamp, interpretation: "Current selected-provider portfolio weight.", strength: portfolio.freshness?.stale ? "LOW" : "HIGH", relevanceScore: 95 }));
    (portfolio?.tradingState?.strategyAllocations || []).slice(0, 20).forEach((item) => add({ sourceType: "ACTIVE_STRATEGY", sourceId: item.id, sourceName: "Strategy deployment allocation", sourceQuality: "HIGH", theme: item.strategyName, metricName: "AssignedCapitalPct", metricValue: item.assignedCapitalPct, timestamp: item.updatedAt, interpretation: "Current strategy capital allocation.", strength: "HIGH", relevanceScore: 75 }));
    (portfolio?.tradingState?.matrixAllocations || []).slice(0, 30).forEach((item) => add({ sourceType: "MATRIX_ALLOCATION", sourceId: item.id, sourceName: "Deployment matrix", sourceQuality: "HIGH", sector: item.sector, theme: item.regime, metricName: "AllocationPct", metricValue: item.allocationPct, timestamp: item.updatedAt, interpretation: "Current matrix deployment allocation.", strength: "HIGH", relevanceScore: 65 }));
    strategies.forEach((experiment) => strategyMetricEvidence(add, experiment));
    (deployment?.routes || []).forEach((route) => add({ sourceType: "DEPLOYMENT", sourceId: route.id, sourceName: deployment.name || "Strategy deployment matrix", sourceQuality: "HIGH", sector: route.sector, theme: route.regime, metricName: "RouteStatus", metricValue: route.status, timestamp: route.updatedAt, interpretation: `${route.selectedExperiment?.name || "No strategy"} is the saved route for this matrix cell.`, strength: "HIGH", relevanceScore: 76 }));
    snapshotEvidence(add, deployment?.snapshots?.[0]);
    const regime = scan.market_regime?.regime || scan.market_regime || null;
    add({ sourceType: "MARKET_REGIME", sourceId: scan.scan_id || "latest-scan", sourceName: "Quant's Trade Regime Detection", sourceQuality: "HIGH", metricName: "Regime", metricValue: regime, timestamp: scan.generated_at, interpretation: "Latest regime classification attached to scanner results.", strength: dataHealth.is_stale ? "LOW" : "HIGH", relevanceScore: 90 });

    const news = opportunities.flatMap((item) => {
      const raw = item.raw || item;
      const events = raw.news_events || raw.newsEvents || raw.upcoming_events || item.news_events || [];
      return (Array.isArray(events) ? events : []).map((event) => normalizeNewsEvent(event, item)).filter(Boolean);
    }).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 20);
    news.forEach((item) => add({ sourceType: item.eventType.includes("EARNING") ? "EARNINGS" : item.eventType.includes("ECONOMIC") ? "ECONOMIC_EVENT" : "NEWS", sourceId: item.id, sourceName: item.sourceName, sourceQuality: item.sourceQuality, symbol: item.symbol, sector: item.sector, metricName: "Headline", metricValue: item.title, timestamp: item.publishedAt, interpretation: "Bounded event metadata attached to a current scanner result.", strength: item.sourceQuality, relevanceScore: relevance(item.symbol, item.relevanceScore) }));

    const staleSources = [];
    if (dataHealth.is_stale || !scan.generated_at) staleSources.push("SCANNER");
    if (quotes.some((quote) => quote.isStale)) staleSources.push("MARKET_DATA");
    if (portfolio?.freshness?.stale) staleSources.push("PORTFOLIO");
    if (!news.length) staleSources.push("NEWS_UNAVAILABLE");
    const newestNewsTimestamp = news.map((item) => item.publishedAt).filter(Boolean).sort().at(-1) || null;
    const context = {
      workflow, question: String(request.question || ""), symbol: requestedSymbols[0] || "", sector, theme: String(request.theme || ""),
      market: { quotes: quotes.map((quote) => ({ symbol: quote.symbol, provider: quote.provider || quote.source, lastUpdated: quote.lastUpdated, isStale: Boolean(quote.isStale), last: quote.quote?.last, changePercent: quote.quote?.changePercent })), indices: quotes.filter((quote) => INDEX_SYMBOLS.includes(quote.symbol)).map((quote) => ({ symbol: quote.symbol, last: quote.quote?.last, changePercent: quote.quote?.changePercent, lastUpdated: quote.lastUpdated })), sectorPerformance: quotes.filter((quote) => Object.values(SECTOR_ETFS).includes(quote.symbol)).map((quote) => ({ symbol: quote.symbol, changePercent: quote.quote?.changePercent, lastUpdated: quote.lastUpdated })), regime },
      news, scanner: { generatedAt: scan.generated_at || null, opportunities: opportunities.map((item) => ({ id: item.id, symbol: String(item.symbol || "").slice(0, 32), sector: String(item.sector || "").slice(0, 100), signal: String(item.signal || "").slice(0, 40), opportunityScore: item.opportunity_score ?? item.opportunityScore, reasons: Array.isArray(item.reasons) ? item.reasons.slice(0, 5).map((reason) => String(reason).slice(0, 300)) : [] })) },
      watchlist: watchlist.slice(0, 30).map((item) => ({ id: item.id, symbol: item.symbol, notes: String(item.notes || "").slice(0, 300) })),
      portfolio: portfolio ? { provider: portfolio.provider, positions: (portfolio.positions || []).slice(0, 30).map((item) => ({ id: item.id, symbol: item.symbol, sector: item.sector, industry: item.industry, side: item.side, quantity: item.quantity, marketValue: item.marketValue, unrealizedPnl: item.unrealizedPnl, unrealizedPnlPct: item.unrealizedPnlPct, portfolioWeightPct: item.portfolioWeightPct, priceTimestamp: item.priceTimestamp })), strategyAllocations: (portfolio.tradingState?.strategyAllocations || []).slice(0, 20).map((item) => ({ id: item.id, strategyName: item.strategyName, assignedCapitalPct: item.assignedCapitalPct, status: item.status, updatedAt: item.updatedAt })), matrixAllocations: (portfolio.tradingState?.matrixAllocations || []).slice(0, 30).map((item) => ({ id: item.id, sector: item.sector, regime: item.regime, allocationPct: item.allocationPct, status: item.status, updatedAt: item.updatedAt })) } : null,
      strategyResearch: strategies.map((item) => ({ id: item.id, name: item.name, status: item.status, latestRun: item.runs?.[0] || null, latestWalkForward: item.walkForwardRuns?.[0] || null, latestStress: item.stressResults?.[0] || null, lifecycle: item.versions?.[0]?.deploymentStatus || item.status })),
      deployment: deployment ? { id: deployment.id, name: deployment.name, updatedAt: deployment.updatedAt, routes: deployment.routes || [] } : null,
      availableEvidence: evidence.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 100),
      freshness: { generatedAt: now().toISOString(), marketDataTimestamp: quotes.map((quote) => timestamp(quote.lastUpdated)).filter(Boolean).sort().at(-1) || null, newsTimestamp: newestNewsTimestamp, scannerTimestamp: timestamp(scan.generated_at), portfolioSnapshotTimestamp: portfolio?.freshness?.portfolioSnapshotTimestamp || null, regimeTimestamp: timestamp(scan.generated_at), staleSources: [...new Set(staleSources)] },
      limitations: [
        ...(!news.length ? ["No bounded news or event metadata is available from current platform sources."] : []),
        ...(workflow === "UPCOMING_EVENTS" && !news.some((item) => item.eventType.includes("EARNING") || item.eventType.includes("ECONOMIC")) ? ["Reliable upcoming earnings and economic-calendar data is unavailable."] : []),
        ...(scanResult.status === "rejected" ? ["Scanner context is unavailable."] : []),
        ...(portfolioResult.status === "rejected" ? ["Portfolio relevance context is unavailable."] : []),
        ...(strategyResult.status === "rejected" ? ["Strategy research metrics are unavailable."] : []),
        ...(deploymentResult.status === "rejected" ? ["Deployment and saved simulation evidence are unavailable."] : []),
      ],
    };
    if (Buffer.byteLength(JSON.stringify(context), "utf8") > 90_000) {
      context.availableEvidence = context.availableEvidence.slice(0, 60);
      context.scanner.opportunities = context.scanner.opportunities.slice(0, 15);
      context.watchlist = context.watchlist.slice(0, 15);
      context.news = context.news.slice(0, 10);
      context.strategyResearch = context.strategyResearch.slice(0, 8);
      if (context.portfolio) {
        context.portfolio.positions = context.portfolio.positions.slice(0, 20);
        context.portfolio.strategyAllocations = context.portfolio.strategyAllocations.slice(0, 12);
        context.portfolio.matrixAllocations = context.portfolio.matrixAllocations.slice(0, 16);
      }
      context.limitations.push("Research context was compacted to the configured AI safety budget.");
    }
    if (Buffer.byteLength(JSON.stringify(context), "utf8") > 104_000) {
      context.availableEvidence = context.availableEvidence.slice(0, 40);
      context.scanner.opportunities = context.scanner.opportunities.slice(0, 8);
      context.watchlist = context.watchlist.slice(0, 8);
      context.news = context.news.slice(0, 6);
      context.strategyResearch = context.strategyResearch.slice(0, 5);
      if (context.portfolio) { context.portfolio.positions = context.portfolio.positions.slice(0, 10); context.portfolio.matrixAllocations = context.portfolio.matrixAllocations.slice(0, 8); }
    }
    return context;
  }
  return { build };
}

module.exports = { INDEX_SYMBOLS, SECTOR_ETFS, createResearchContextService, normalizeNewsEvent };
