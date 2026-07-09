export const cockpitSequence = [
  {
    key: "scan",
    label: "Scanner running",
    detail: "Universe filtered, risk profile loaded",
    metric: "Signals +12",
  },
  {
    key: "signals",
    label: "Signals appearing",
    detail: "BUY setups ranked by score and confidence",
    metric: "Top score 78",
  },
  {
    key: "approval",
    label: "Approval queued",
    detail: "Manual review required before paper execution",
    metric: "1 pending",
  },
  {
    key: "risk",
    label: "Risk checks",
    detail: "Exposure, stop loss, and position size evaluated",
    metric: "Risk medium",
  },
  {
    key: "paper",
    label: "Paper execution",
    detail: "Ledger events prepared for approved trade",
    metric: "Ledger ready",
  },
  {
    key: "validation",
    label: "Validation updating",
    detail: "Signal outcome waits for maturity window",
    metric: "Coverage +3%",
  },
  {
    key: "playbook",
    label: "Playbook learning",
    detail: "Evidence attached to strategy version",
    metric: "V3 draft",
  },
];

export const demoOpportunities = [
  { symbol: "RKLB", market: "US", horizon: "Swing", risk: "Medium", score: 78, confidence: 84, exposure: 12, signal: "BUY" },
  { symbol: "D05.SI", market: "SG", horizon: "Swing", risk: "Low", score: 66, confidence: 72, exposure: 7, signal: "BUY" },
  { symbol: "CRWD", market: "US", horizon: "Momentum", risk: "High", score: 87, confidence: 79, exposure: 18, signal: "BUY" },
  { symbol: "C38U.SI", market: "SG", horizon: "Swing", risk: "Medium", score: 61, confidence: 68, exposure: 9, signal: "HOLD" },
  { symbol: "NVDA", market: "US", horizon: "Momentum", risk: "High", score: 92, confidence: 88, exposure: 21, signal: "BUY" },
];

export const workflowSteps = [
  {
    key: "SCAN",
    input: "Universe, horizon, active strategy",
    output: "Ranked opportunities",
    evidence: "Signal score, confidence, regime",
  },
  {
    key: "APPROVE",
    input: "Proposed trade + risk report",
    output: "Approve, reject, snooze, reduce",
    evidence: "Audit trail and safety checks",
  },
  {
    key: "EXECUTE",
    input: "Approved paper order",
    output: "Ledger events",
    evidence: "Cash, fills, fees, position deltas",
  },
  {
    key: "VALIDATE",
    input: "Historical signal record",
    output: "Outcome by maturity window",
    evidence: "Win rate, return, drawdown",
  },
  {
    key: "LEARN",
    input: "Runs, approvals, outcomes",
    output: "Versioned playbook",
    evidence: "Evidence score and recommendations",
  },
];

export const validationBuckets = [
  { bucket: "50-60", trades: 36, winRate: 52, avgReturn: 0.8 },
  { bucket: "60-70", trades: 48, winRate: 58, avgReturn: 1.4 },
  { bucket: "70-80", trades: 62, winRate: 64, avgReturn: 2.1 },
  { bucket: "80-90", trades: 41, winRate: 61, avgReturn: 1.7 },
  { bucket: "90-100", trades: 18, winRate: 56, avgReturn: 0.9 },
];

export const playbookVersions = [
  {
    version: "V1",
    title: "Momentum base",
    sharpe: 0.72,
    drawdown: "18.4%",
    changes: "EMA/RSI trend rules, manual approvals",
  },
  {
    version: "V2",
    title: "Risk-aware sizing",
    sharpe: 0.96,
    drawdown: "13.1%",
    changes: "Lower risk multiplier, tighter exposure cap",
  },
  {
    version: "V3",
    title: "Evidence-gated",
    sharpe: 1.18,
    drawdown: "10.8%",
    changes: "Validation threshold and playbook review",
  },
];

export const architectureNodes = [
  ["Scanner", "Generates candidates, not orders."],
  ["Approval", "Human review is required before execution."],
  ["Ledger", "Paper accounting is append-only."],
  ["Validation", "Confidence is checked against outcomes."],
  ["Playbook", "Strategy changes become versioned evidence."],
];

export const demoTabs = {
  Scanner: ["RKLB BUY 78", "D05.SI BUY 66", "C38U.SI HOLD 61"],
  Approvals: ["RKLB pending review", "Reduce size suggested", "Safety medium"],
  Portfolio: ["Cash 54%", "Exposure 46%", "Open risk 2.1%"],
  Validation: ["70-80 bucket", "64% observed win rate", "Evidence medium"],
};
