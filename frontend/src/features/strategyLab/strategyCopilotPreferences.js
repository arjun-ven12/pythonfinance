export const STRATEGY_COPILOT_TRADING_STYLE_OPTIONS = Object.freeze([
  { value: "SWING", label: "Swing" },
  { value: "MOMENTUM", label: "Momentum" },
  { value: "TREND_FOLLOWING", label: "Trend Following" },
  { value: "MEAN_REVERSION", label: "Mean Reversion" },
  { value: "BREAKOUT", label: "Breakout" },
  { value: "POSITION_TRADING", label: "Position Trading" },
  { value: "CUSTOM", label: "Custom" },
]);

export const STRATEGY_COPILOT_MARKET_OPTIONS = Object.freeze([
  { value: "US", label: "US Equities" },
  { value: "SGX", label: "SGX Equities" },
  { value: "US_AND_SGX", label: "US & SGX Equities" },
  { value: "CUSTOM_UNIVERSE", label: "Custom Universe" },
]);

export const STRATEGY_COPILOT_RISK_LEVEL_OPTIONS = Object.freeze([
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CUSTOM", label: "Custom" },
]);

export const STRATEGY_COPILOT_HOLDING_PERIOD_OPTIONS = Object.freeze([
  { value: "INTRADAY", label: "Intraday" },
  { value: "DAYS_1_5", label: "1-5 trading days" },
  { value: "DAYS_3_20", label: "3-20 trading days" },
  { value: "WEEKS_2_8", label: "2-8 weeks" },
  { value: "LONG_TERM", label: "Long term" },
  { value: "CUSTOM", label: "Custom" },
]);

export const STRATEGY_COPILOT_OBJECTIVE_OPTIONS = Object.freeze([
  { value: "MAXIMIZE_SHARPE", label: "Maximize Sharpe" },
  { value: "REDUCE_DRAWDOWN", label: "Reduce Drawdown" },
  { value: "INCREASE_WIN_RATE", label: "Increase Win Rate" },
  { value: "LOWER_VOLATILITY", label: "Lower Volatility" },
  { value: "REDUCE_TRADE_FREQUENCY", label: "Reduce Trade Frequency" },
  { value: "IMPROVE_WALK_FORWARD_STABILITY", label: "Improve Walk-Forward Stability" },
  { value: "IMPROVE_MATRIX_ROBUSTNESS", label: "Improve Matrix Robustness" },
]);

export const STRATEGY_COPILOT_SECTOR_OPTIONS = Object.freeze([
  { value: "NO_PREFERENCE", label: "No preference" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "HEALTHCARE", label: "Healthcare" },
  { value: "FINANCIALS", label: "Financials" },
  { value: "ENERGY", label: "Energy" },
  { value: "COMMUNICATION_SERVICES", label: "Communication Services" },
]);

export const DEFAULT_STRATEGY_COPILOT_PREFERENCES = Object.freeze({
  advancedMode: false,
  tradingStyle: "SWING",
  market: "US",
  riskLevel: "MEDIUM",
  holdingPeriod: "DAYS_3_20",
  objectives: ["MAXIMIZE_SHARPE", "REDUCE_DRAWDOWN"],
  sectors: ["NO_PREFERENCE"],
  constraints: {
    maxDrawdownTarget: "",
    avoidEarningsPeriods: false,
    minimumLiquidity: "",
  },
});

const MAX_DRAWDOWN_BOUNDS = Object.freeze({ min: 1, max: 95 });
const MINIMUM_LIQUIDITY_BOUNDS = Object.freeze({ min: 0, max: 1000000000 });

function optionLookup(options) {
  return new Map(options.map((option) => [option.value, option.label]));
}

const TRADING_STYLE_LABELS = optionLookup(STRATEGY_COPILOT_TRADING_STYLE_OPTIONS);
const MARKET_LABELS = optionLookup(STRATEGY_COPILOT_MARKET_OPTIONS);
const RISK_LEVEL_LABELS = optionLookup(STRATEGY_COPILOT_RISK_LEVEL_OPTIONS);
const HOLDING_PERIOD_LABELS = optionLookup(STRATEGY_COPILOT_HOLDING_PERIOD_OPTIONS);
const OBJECTIVE_LABELS = optionLookup(STRATEGY_COPILOT_OBJECTIVE_OPTIONS);
const SECTOR_LABELS = optionLookup(STRATEGY_COPILOT_SECTOR_OPTIONS);

function cloneDefaultPreferences() {
  return {
    ...DEFAULT_STRATEGY_COPILOT_PREFERENCES,
    objectives: [...DEFAULT_STRATEGY_COPILOT_PREFERENCES.objectives],
    sectors: [...DEFAULT_STRATEGY_COPILOT_PREFERENCES.sectors],
    constraints: {
      ...DEFAULT_STRATEGY_COPILOT_PREFERENCES.constraints,
    },
  };
}

export function createStrategyCopilotPreferences() {
  return cloneDefaultPreferences();
}

export function validateStrategyCopilotDraftRequest(prompt, preferences = {}) {
  const trimmedPrompt = String(prompt || "").trim();
  if (!trimmedPrompt) {
    return "Describe the strategy before generating a draft.";
  }

  if (!preferences?.advancedMode) {
    return "";
  }

  if (!TRADING_STYLE_LABELS.has(preferences.tradingStyle)) {
    return "Choose a supported trading style.";
  }
  if (!MARKET_LABELS.has(preferences.market)) {
    return "Choose a supported market or universe.";
  }
  if (!RISK_LEVEL_LABELS.has(preferences.riskLevel)) {
    return "Choose a supported risk level.";
  }
  if (!HOLDING_PERIOD_LABELS.has(preferences.holdingPeriod)) {
    return "Choose a supported holding period.";
  }

  const objectives = Array.isArray(preferences.objectives) ? preferences.objectives : [];
  if (objectives.length === 0) {
    return "Select at least one primary objective in Advanced Mode.";
  }
  if (objectives.some((value) => !OBJECTIVE_LABELS.has(value))) {
    return "Advanced objectives include an unsupported value.";
  }

  const sectors = Array.isArray(preferences.sectors) ? preferences.sectors : [];
  if (sectors.some((value) => !SECTOR_LABELS.has(value))) {
    return "Sector preferences include an unsupported value.";
  }
  if (sectors.includes("NO_PREFERENCE") && sectors.length > 1) {
    return "Choose either 'No preference' or specific sectors, not both.";
  }

  const maxDrawdownTarget = String(preferences?.constraints?.maxDrawdownTarget || "").trim();
  if (maxDrawdownTarget) {
    const parsed = Number(maxDrawdownTarget);
    if (!Number.isFinite(parsed)) {
      return "Maximum drawdown target must be a number.";
    }
    if (parsed < MAX_DRAWDOWN_BOUNDS.min || parsed > MAX_DRAWDOWN_BOUNDS.max) {
      return `Maximum drawdown target must be between ${MAX_DRAWDOWN_BOUNDS.min} and ${MAX_DRAWDOWN_BOUNDS.max}.`;
    }
  }

  const minimumLiquidity = String(preferences?.constraints?.minimumLiquidity || "").trim();
  if (minimumLiquidity) {
    const parsed = Number(minimumLiquidity);
    if (!Number.isFinite(parsed)) {
      return "Minimum liquidity must be a number.";
    }
    if (parsed < MINIMUM_LIQUIDITY_BOUNDS.min || parsed > MINIMUM_LIQUIDITY_BOUNDS.max) {
      return `Minimum liquidity must be between ${MINIMUM_LIQUIDITY_BOUNDS.min} and ${MINIMUM_LIQUIDITY_BOUNDS.max}.`;
    }
  }

  return "";
}

export function buildStrategyCopilotDraftRequest(prompt, preferences = {}) {
  const trimmedPrompt = String(prompt || "").trim();
  if (!preferences?.advancedMode) {
    return {
      prompt: trimmedPrompt,
      advancedMode: false,
    };
  }

  const objectives = (preferences.objectives || [])
    .filter((value) => OBJECTIVE_LABELS.has(value))
    .map((value) => OBJECTIVE_LABELS.get(value));
  const sectors = (preferences.sectors || [])
    .filter((value) => value !== "NO_PREFERENCE" && SECTOR_LABELS.has(value))
    .map((value) => SECTOR_LABELS.get(value));
  const constraints = {};
  const maxDrawdownTarget = String(preferences?.constraints?.maxDrawdownTarget || "").trim();
  const minimumLiquidity = String(preferences?.constraints?.minimumLiquidity || "").trim();

  if (maxDrawdownTarget) {
    constraints.maxDrawdownTarget = Number(maxDrawdownTarget);
  }
  if (preferences?.constraints?.avoidEarningsPeriods) {
    constraints.avoidEarningsPeriods = true;
  }
  if (minimumLiquidity) {
    constraints.minimumLiquidity = Number(minimumLiquidity);
  }

  const nextPreferences = {
    tradingStyle: TRADING_STYLE_LABELS.get(preferences.tradingStyle),
    market: MARKET_LABELS.get(preferences.market),
    riskLevel: RISK_LEVEL_LABELS.get(preferences.riskLevel),
    holdingPeriod: HOLDING_PERIOD_LABELS.get(preferences.holdingPeriod),
    objectives,
  };

  if (sectors.length) {
    nextPreferences.sectors = sectors;
  }
  if (Object.keys(constraints).length) {
    nextPreferences.constraints = constraints;
  }

  return {
    prompt: trimmedPrompt,
    advancedMode: true,
    preferences: nextPreferences,
  };
}
