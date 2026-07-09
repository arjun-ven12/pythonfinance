const DEMO_META = Object.freeze({
  label: "DEMO DATA",
  asOf: "2026-07-02T09:30:00.000Z",
  isDemoMode: true,
  experienceName: "Guided Trading Day",
  note: "Sample data only. No real account, broker session, alert channel, or production user data is connected.",
  workflow: [
    "Market",
    "Scanner",
    "Strategy",
    "Approval",
    "Execution",
    "Portfolio",
    "Validation",
    "Playbook",
  ],
});

const DEMO_DATASET = Object.freeze({
  dashboard: {
    marketOpen: {
      regime: "Bull Low Vol",
      activeDeploymentSet: "Momentum Lab v12",
      universe: "US large caps + SG watchlist",
      systemStatus: "Paper-only",
      marketTone: "Breadth is positive, realized volatility is muted, and semiconductors are leading.",
    },
    deploymentSet: [
      {
        strategy: "Momentum Lab v12",
        sectors: ["Technology", "Semiconductors"],
        regimes: ["Bull Low Vol", "Bull High Vol"],
        status: "ACTIVE",
      },
      {
        strategy: "Defensive Reversion v4",
        sectors: ["Healthcare", "Consumer"],
        regimes: ["Sideways", "Bear High Vol"],
        status: "STANDBY",
      },
      {
        strategy: "Breakout Guard v3",
        sectors: ["Financials", "Industrials"],
        regimes: ["Bull High Vol", "Sideways"],
        status: "READY",
      },
    ],
    riskSummary: {
      accountEquity: 25750,
      cash: 8120,
      dailyRiskUsagePct: 22,
      weeklyRiskUsagePct: 31,
      openExposurePct: 46,
      maxDrawdownPct: 6.4,
      paperOnly: true,
    },
    missionSnapshot: {
      scannerUniverse: 50,
      approvalsOpen: 4,
      portfolioPositions: 4,
      validationConfidence: 0.83,
      brokerState: "Disabled in demo",
    },
  },
  scanner: {
    progressStages: [
      "Scanning 50 stocks",
      "Ranking candidates",
      "Validating strategy fit",
      "Applying risk filters",
    ],
    highlightedSymbol: "AMD",
    filters: ["ALL", "NOW", "WATCH", "AVOID"],
    opportunities: [
      { symbol: "AMD", company: "Advanced Micro Devices", sector: "Semiconductors", regime: "Bull Low Vol", disposition: "NOW", signal: "BUY", opportunityScore: 91, confidence: 0.87, strategyVersion: "Momentum Lab v12", validationScore: 84, readinessScore: 88, portfolioFit: "Adds to winning semiconductor cluster without breaching risk budget." },
      { symbol: "NVDA", company: "NVIDIA", sector: "Semiconductors", regime: "Bull High Vol", disposition: "WATCH", signal: "WATCH", opportunityScore: 82, confidence: 0.78, strategyVersion: "Momentum Lab v12", validationScore: 79, readinessScore: 88, portfolioFit: "Strong signal, but better after pullback." },
      { symbol: "JPM", company: "JPMorgan Chase", sector: "Financials", regime: "Bull High Vol", disposition: "NOW", signal: "BUY", opportunityScore: 78, confidence: 0.73, strategyVersion: "Breakout Guard v3", validationScore: 75, readinessScore: 81, portfolioFit: "Diversifies sector mix." },
      { symbol: "AAPL", company: "Apple", sector: "Technology", regime: "Bull Low Vol", disposition: "WATCH", signal: "WATCH", opportunityScore: 68, confidence: 0.66, strategyVersion: "Momentum Lab v12", validationScore: 72, readinessScore: 88, portfolioFit: "Good quality, lower immediate edge." },
      { symbol: "MSFT", company: "Microsoft", sector: "Technology", regime: "Bull Low Vol", disposition: "WATCH", signal: "WATCH", opportunityScore: 71, confidence: 0.69, strategyVersion: "Momentum Lab v12", validationScore: 74, readinessScore: 88, portfolioFit: "Already correlated with existing exposure." },
      { symbol: "LLY", company: "Eli Lilly", sector: "Healthcare", regime: "Sideways", disposition: "NOW", signal: "BUY", opportunityScore: 76, confidence: 0.74, strategyVersion: "Defensive Reversion v4", validationScore: 80, readinessScore: 77, portfolioFit: "Useful defensive ballast." },
      { symbol: "UNH", company: "UnitedHealth", sector: "Healthcare", regime: "Bear High Vol", disposition: "WATCH", signal: "WATCH", opportunityScore: 63, confidence: 0.62, strategyVersion: "Defensive Reversion v4", validationScore: 71, readinessScore: 77, portfolioFit: "Signal quality okay, evidence still thin." },
      { symbol: "META", company: "Meta Platforms", sector: "Technology", regime: "Bull Low Vol", disposition: "NOW", signal: "BUY", opportunityScore: 86, confidence: 0.8, strategyVersion: "Momentum Lab v12", validationScore: 82, readinessScore: 88, portfolioFit: "Strong trend, modest sizing suggested." },
      { symbol: "AMZN", company: "Amazon", sector: "Consumer", regime: "Bull High Vol", disposition: "WATCH", signal: "WATCH", opportunityScore: 74, confidence: 0.72, strategyVersion: "Breakout Guard v3", validationScore: 77, readinessScore: 81, portfolioFit: "Better after volatility compresses." },
      { symbol: "KO", company: "Coca-Cola", sector: "Consumer", regime: "Bear High Vol", disposition: "NOW", signal: "BUY", opportunityScore: 73, confidence: 0.7, strategyVersion: "Defensive Reversion v4", validationScore: 76, readinessScore: 77, portfolioFit: "Defensive rotation candidate." },
      { symbol: "XOM", company: "Exxon Mobil", sector: "Energy", regime: "Sideways", disposition: "AVOID", signal: "AVOID", opportunityScore: 49, confidence: 0.51, strategyVersion: "Breakout Guard v3", validationScore: 55, readinessScore: 81, portfolioFit: "Weak evidence, noisy tape." },
      { symbol: "AVGO", company: "Broadcom", sector: "Semiconductors", regime: "Bull Low Vol", disposition: "WATCH", signal: "WATCH", opportunityScore: 79, confidence: 0.76, strategyVersion: "Momentum Lab v12", validationScore: 78, readinessScore: 88, portfolioFit: "Solid, but AMD has cleaner setup." },
      { symbol: "V", company: "Visa", sector: "Financials", regime: "Sideways", disposition: "WATCH", signal: "WATCH", opportunityScore: 66, confidence: 0.64, strategyVersion: "Breakout Guard v3", validationScore: 68, readinessScore: 81, portfolioFit: "Range-bound environment lowers edge." },
      { symbol: "MRK", company: "Merck", sector: "Healthcare", regime: "Bear High Vol", disposition: "NOW", signal: "BUY", opportunityScore: 72, confidence: 0.69, strategyVersion: "Defensive Reversion v4", validationScore: 75, readinessScore: 77, portfolioFit: "Good candidate when offense cools." },
      { symbol: "COST", company: "Costco", sector: "Consumer", regime: "Bull Low Vol", disposition: "WATCH", signal: "WATCH", opportunityScore: 69, confidence: 0.65, strategyVersion: "Momentum Lab v12", validationScore: 70, readinessScore: 88, portfolioFit: "Stable, but not top-ranked today." },
      { symbol: "TSLA", company: "Tesla", sector: "Consumer", regime: "Bull High Vol", disposition: "AVOID", signal: "AVOID", opportunityScore: 44, confidence: 0.47, strategyVersion: "Breakout Guard v3", validationScore: 49, readinessScore: 81, portfolioFit: "News risk and volatility too high." },
    ],
    opportunityDetail: {
      symbol: "AMD",
      score: 91,
      confidence: 0.87,
      strategyVersion: "Momentum Lab v12",
      validationEvidence: [
        "Walk-forward passed 5 of 6 recent windows",
        "Robustness score stays above 79 across parameter drift",
        "Sector-relative strength is leading the large-cap universe",
      ],
      newsRiskContext: "No high-severity earnings or macro conflict in the next 24 hours.",
      portfolioFit: "Adds 6.8% semiconductor exposure while staying within concentration and daily notional limits.",
    },
  },
  strategyLab: {
    attribution: {
      selectedSymbol: "AMD",
      selectedBy: "Momentum Lab v12",
      regimeFit: "Bull Low Vol",
      sectorFit: "Semiconductors",
      readinessGate: "PASSED",
      walkForwardStatus: "PASSED",
      robustnessStatus: "STABLE",
    },
    strategies: [
      {
        name: "Momentum Lab v12",
        version: "v12",
        readinessScore: 88,
        validationScore: 84,
        robustnessScore: 79,
        deploymentScore: 86,
        note: "Primary routing owner for tech momentum in low-volatility bull regimes.",
      },
      {
        name: "Defensive Reversion v4",
        version: "v4",
        readinessScore: 77,
        validationScore: 80,
        robustnessScore: 76,
        deploymentScore: 74,
        note: "Fallback rotation model when risk appetite weakens.",
      },
      {
        name: "Breakout Guard v3",
        version: "v3",
        readinessScore: 81,
        validationScore: 75,
        robustnessScore: 72,
        deploymentScore: 78,
        note: "Breakout model with tighter risk gating in volatile sessions.",
      },
    ],
    comparison: [
      { metric: "Bull Low Vol fit", momentum: "High", defensive: "Low", breakout: "Medium" },
      { metric: "Walk-forward stability", momentum: "Strong", defensive: "Strong", breakout: "Moderate" },
      { metric: "Sector concentration risk", momentum: "Moderate", defensive: "Low", breakout: "Low" },
    ],
    versionTimeline: [
      { version: "v10", note: "Added sector-relative momentum input." },
      { version: "v11", note: "Improved earnings blackout handling." },
      { version: "v12", note: "Tightened readiness gate and volatility filter." },
    ],
  },
  approvals: {
    approvals: [
      { id: "demo-appr-1", symbol: "AMD", side: "BUY", quantity: 18, status: "PENDING", confidence: 0.87, strategy: "Momentum Lab v12", note: "Primary opportunity after validation and portfolio fit checks." },
      { id: "demo-appr-2", symbol: "KO", side: "BUY", quantity: 24, status: "APPROVED", confidence: 0.7, strategy: "Defensive Reversion v4", note: "Approved for defensive balance." },
      { id: "demo-appr-3", symbol: "XOM", side: "SELL", quantity: 10, status: "REJECTED", confidence: 0.51, strategy: "Breakout Guard v3", note: "Evidence too weak for action." },
      { id: "demo-appr-4", symbol: "NVDA", side: "BUY", quantity: 8, status: "BLOCKED_BY_SAFETY", confidence: 0.78, strategy: "Momentum Lab v12", note: "Signal is valid, but safety blocks the trade." },
    ],
    approvalDetail: {
      symbol: "AMD",
      pendingApproval: true,
      preTradeRisk: "Medium",
      safetyChecklist: [
        "Daily loss limit respected",
        "Strategy version is deployable",
        "Broker mode remains paper-only",
        "No duplicate pending order exists",
      ],
      positionSizeAdjustment: "Reduced from 22 to 18 shares to stay under max sector notional.",
      approvalNote: "Trend quality is high, but keep size modest because semiconductors already lead current exposure.",
    },
    blockedTrade: {
      symbol: "NVDA",
      reason: "Sector exposure too high, risk budget exceeded, and short-term news sensitivity is elevated.",
      labels: ["Blocked by safety", "Why this matters", "Paper-only"],
    },
    executionPreview: {
      brokerDisabled: true,
      paperOnlyOutcome: "Would route to paper broker simulation only after approval.",
      ledgerPreview: {
        action: "Preview ledger entry",
        symbol: "AMD",
        quantity: 18,
        estimatedFill: 172.2,
        fee: 1.25,
      },
    },
  },
  portfolio: {
    summary: {
      totalValue: 8602.4,
      cash: 8120,
      paperPnL: 412.7,
      sectorAllocation: [
        { sector: "Semiconductors", value: 3099.6, pct: 36 },
        { sector: "Technology", value: 1847.2, pct: 21 },
        { sector: "Utilities", value: 2050, pct: 24 },
        { sector: "Consumer", value: 1605.6, pct: 19 },
      ],
      riskImpact: {
        cashAfterTrade: 5020.15,
        exposureAfterTradePct: 53,
        sectorImpact: "Semiconductors rise to 42% of gross exposure.",
      },
    },
    positions: [
      { symbol: "AMD", quantity: 18, averageCost: 168.1, marketValue: 3099.6, pnlPct: 2.8, status: "Winner" },
      { symbol: "MSFT", quantity: 4, averageCost: 451.4, marketValue: 1847.2, pnlPct: 2.1, status: "Winner" },
      { symbol: "KO", quantity: 24, averageCost: 65.2, marketValue: 1605.6, pnlPct: 2.6, status: "Winner" },
      { symbol: "DUK", quantity: 20, averageCost: 100.4, marketValue: 2050, pnlPct: 2.1, status: "Winner" },
    ],
    executionPath: [
      "Approval accepted",
      "Paper execution preview generated",
      "Immutable ledger entry would be written",
      "Portfolio exposure recalculated",
    ],
  },
  validation: {
    confidenceBuckets: [
      { bucket: "80-90%", expectedWinRate: 64, actualWinRate: 61 },
      { bucket: "70-79%", expectedWinRate: 57, actualWinRate: 55 },
      { bucket: "60-69%", expectedWinRate: 51, actualWinRate: 50 },
    ],
    sampleOutcome: {
      symbol: "AMD",
      expected: "Follow-through after breakout retest",
      actual: "Opened higher, held VWAP, and closed +2.3% on day two.",
      calibration: "Confidence bucket slightly optimistic but within tolerance.",
    },
    labels: ["Validated strategy", "Why this matters", "Demo only"],
  },
  playbook: {
    versionNote: "Momentum Lab v12 keeps its deployment lead after another high-confidence follow-through trade.",
    strategyLesson: "Semiconductor momentum performs best when breadth stays positive and intraday pullbacks remain shallow.",
    evidenceUpdated: true,
    decisionRecorded: "AMD paper trade logged with approval rationale and safety sizing note.",
    deploymentScoreChange: {
      previous: 84,
      current: 86,
      reason: "Validation result strengthened confidence for Bull Low Vol routing.",
    },
    labels: ["Read-only", "Validated strategy", "Demo only"],
  },
  marketData: {
    AMD: {
      market: "US",
      currency: "USD",
      points: [
        { timestamp: "2026-06-03T13:30:00.000Z", open: 158.4, high: 160.2, low: 157.9, close: 159.8, volume: 28000000 },
        { timestamp: "2026-06-10T13:30:00.000Z", open: 160.1, high: 162.5, low: 159.2, close: 161.9, volume: 30200000 },
        { timestamp: "2026-06-17T13:30:00.000Z", open: 162.4, high: 165.6, low: 161.8, close: 164.7, volume: 35100000 },
        { timestamp: "2026-06-24T13:30:00.000Z", open: 165.3, high: 169.8, low: 164.9, close: 168.4, volume: 39200000 },
        { timestamp: "2026-07-01T13:30:00.000Z", open: 168.9, high: 173.4, low: 168.2, close: 172.2, volume: 44100000 },
      ],
    },
    GOOG: {
      market: "US",
      currency: "USD",
      points: [
        { timestamp: "2026-06-03T13:30:00.000Z", open: 182.4, high: 183.9, low: 180.8, close: 181.5, volume: 16200000 },
        { timestamp: "2026-06-10T13:30:00.000Z", open: 181.8, high: 185.2, low: 181.1, close: 184.6, volume: 17500000 },
        { timestamp: "2026-06-17T13:30:00.000Z", open: 184.2, high: 186.4, low: 183.4, close: 185.1, volume: 18100000 },
        { timestamp: "2026-06-24T13:30:00.000Z", open: 185.8, high: 188.5, low: 184.9, close: 187.7, volume: 18800000 },
        { timestamp: "2026-07-01T13:30:00.000Z", open: 188.1, high: 190.3, low: 186.7, close: 189.4, volume: 19400000 },
      ],
    },
    "D05.SI": {
      market: "SG",
      currency: "SGD",
      points: [
        { timestamp: "2026-06-03T01:30:00.000Z", open: 37.45, high: 37.62, low: 37.31, close: 37.58, volume: 8200000 },
        { timestamp: "2026-06-10T01:30:00.000Z", open: 37.61, high: 37.94, low: 37.48, close: 37.88, volume: 9010000 },
        { timestamp: "2026-06-17T01:30:00.000Z", open: 37.84, high: 38.12, low: 37.72, close: 38.03, volume: 9540000 },
        { timestamp: "2026-06-24T01:30:00.000Z", open: 38.01, high: 38.26, low: 37.95, close: 38.18, volume: 9900000 },
        { timestamp: "2026-07-01T01:30:00.000Z", open: 38.2, high: 38.46, low: 38.11, close: 38.31, volume: 10120000 },
      ],
    },
  },
});

function getDemoPayload(key) {
  if (!DEMO_DATASET[key]) {
    throw new Error(`Unknown demo dataset key: ${key}`);
  }

  return {
    ...DEMO_META,
    page: key,
    payload: DEMO_DATASET[key],
  };
}

function getDemoMarketDataPayload(symbol, range = "1M") {
  const entry = DEMO_DATASET.marketData[symbol];

  if (!entry) {
    return {
      ...DEMO_META,
      page: "marketData",
      payload: {
        symbol,
        market: null,
        currency: null,
        range,
        interval: "1d",
        source: "DEMO_FIXTURE",
        provider: "DEMO_FIXTURE",
        isLive: false,
        isDelayed: false,
        isStale: false,
        chartUnavailable: true,
        providerWarning: "Demo data only.",
        lastUpdated: DEMO_META.asOf,
        quote: {
          last: null,
          previousClose: null,
          change: null,
          changePercent: null,
          high: null,
          low: null,
          volume: null,
        },
        points: [],
      },
    };
  }

  const points = entry.points;
  const last = points[points.length - 1];
  const previous = points[points.length - 2] || last;
  const change = Number((last.close - previous.close).toFixed(4));

  return {
    ...DEMO_META,
    page: "marketData",
    payload: {
      symbol,
      market: entry.market,
      currency: entry.currency,
      range,
      interval: range === "1D" ? "5m" : range === "5D" ? "15m" : "1d",
      source: "DEMO_FIXTURE",
      provider: "DEMO_FIXTURE",
      isLive: false,
      isDelayed: false,
      isStale: false,
      chartUnavailable: false,
      providerWarning: "Demo data only.",
      lastUpdated: last.timestamp,
      quote: {
        last: last.close,
        previousClose: previous.close,
        change,
        changePercent: Number(((change / previous.close) * 100).toFixed(2)),
        high: Math.max(...points.map((point) => point.high)),
        low: Math.min(...points.map((point) => point.low)),
        volume: points.reduce((total, point) => total + point.volume, 0),
      },
      points,
    },
  };
}

module.exports = {
  DEMO_DATASET,
  DEMO_META,
  getDemoMarketDataPayload,
  getDemoPayload,
};
