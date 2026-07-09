const allowedIntervals = new Set(["5min", "15min", "30min", "1h"]);
const allowedHorizons = new Set(["INTRADAY", "SWING", "POSITION", "LONG_TERM"]);
const allowedExecutionModes = new Set([
  "MANUAL_APPROVAL",
  "SEMI_AUTOMATED",
  "FULL_AUTOMATION",
]);
const allowedUniverseModes = new Set([
  "S_AND_P_500",
  "LARGE_CAP",
  "MID_CAP",
  "SMALL_CAP",
  "HIGH_GROWTH_HIGH_RISK",
  "CUSTOM",
]);
const allowedPrimaryMarkets = new Set(["US", "SG", "BOTH"]);
const allowedExchangeFilters = new Set(["ALL", "NYSE", "NASDAQ", "AMEX", "SGX"]);
const allowedCurrencyFilters = new Set(["AUTO", "ALL", "USD", "SGD"]);

function getDefaultExecutionSettings() {
  return {
    execution_mode: "MANUAL_APPROVAL",
    auto_execute_confidence_threshold: 85,
    allow_trading_near_earnings: false,
    max_trade_size_for_auto_execution: 5000,
    allow_overnight_positions: true,
    pause_automation_during_major_macro_events: true,
    live_trading_enabled: false,
    broker_execution_mode: "READ_ONLY",
    max_live_trade_size: 5000,
    max_daily_live_notional: 25000,
  };
}

function normalizeExecutionMode(value) {
  const mode = String(value || "MANUAL_APPROVAL").trim().toUpperCase();
  return allowedExecutionModes.has(mode) ? mode : "MANUAL_APPROVAL";
}

function parseBooleanSetting(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return Boolean(value);
}

function getExecutionSettingsFromRequest(
  body = {},
  currentSettings = getDefaultExecutionSettings()
) {
  const source = body.executionSettings || body.execution_settings || body;
  const threshold = Number.parseFloat(
    source.auto_execute_confidence_threshold ??
      source.autoExecuteConfidenceThreshold
  );
  const maxTradeSize = Number.parseFloat(
    source.max_trade_size_for_auto_execution ??
      source.maxTradeSizeForAutoExecution
  );
  const maxLiveTradeSize = Number.parseFloat(
    source.max_live_trade_size ?? source.maxLiveTradeSize
  );
  const maxDailyLiveNotional = Number.parseFloat(
    source.max_daily_live_notional ?? source.maxDailyLiveNotional
  );

  return {
    ...getDefaultExecutionSettings(),
    ...currentSettings,
    execution_mode: normalizeExecutionMode(
      source.execution_mode ??
        source.executionMode ??
        currentSettings.execution_mode
    ),
    auto_execute_confidence_threshold: Number.isFinite(threshold)
      ? Math.max(0, Math.min(100, threshold))
      : currentSettings.auto_execute_confidence_threshold,
    allow_trading_near_earnings: parseBooleanSetting(
      source.allow_trading_near_earnings ?? source.allowTradingNearEarnings,
      currentSettings.allow_trading_near_earnings
    ),
    max_trade_size_for_auto_execution: Number.isFinite(maxTradeSize)
      ? Math.max(0, maxTradeSize)
      : currentSettings.max_trade_size_for_auto_execution,
    allow_overnight_positions: parseBooleanSetting(
      source.allow_overnight_positions ?? source.allowOvernightPositions,
      currentSettings.allow_overnight_positions
    ),
    pause_automation_during_major_macro_events: parseBooleanSetting(
      source.pause_automation_during_major_macro_events ??
        source.pauseAutomationDuringMajorMacroEvents,
      currentSettings.pause_automation_during_major_macro_events
    ),
    live_trading_enabled: parseBooleanSetting(
      source.live_trading_enabled ?? source.liveTradingEnabled,
      currentSettings.live_trading_enabled
    ),
    broker_execution_mode: String(
      source.broker_execution_mode ??
        source.brokerExecutionMode ??
        currentSettings.broker_execution_mode ??
        "READ_ONLY"
    )
      .trim()
      .toUpperCase(),
    max_live_trade_size: Number.isFinite(maxLiveTradeSize)
      ? Math.max(0, maxLiveTradeSize)
      : currentSettings.max_live_trade_size,
    max_daily_live_notional: Number.isFinite(maxDailyLiveNotional)
      ? Math.max(0, maxDailyLiveNotional)
      : currentSettings.max_daily_live_notional,
    updated_at: new Date().toISOString(),
    settings_source: "dashboard",
  };
}

function getDefaultMarketUniverseSettings() {
  return {
    universe_mode: "S_AND_P_500",
    min_market_cap: 10000000000,
    max_market_cap: null,
    min_average_volume: 1000000,
    exclude_penny_stocks: true,
    include_non_sp500: false,
    high_risk_mode: false,
    market: "US",
    exchange: "ALL",
    include_sgx: false,
    currency: "AUTO",
    updated_at: null,
  };
}

function normalizeUniverseMode(value) {
  const mode = String(value || "S_AND_P_500").trim().toUpperCase();
  return allowedUniverseModes.has(mode) ? mode : "S_AND_P_500";
}

function normalizePrimaryMarket(value) {
  const market = String(value || "US").trim().toUpperCase();
  if (market === "SINGAPORE") {
    return "SG";
  }
  return allowedPrimaryMarkets.has(market) ? market : "US";
}

function normalizeExchangeFilter(value) {
  const exchange = String(value || "ALL").trim().toUpperCase();
  return allowedExchangeFilters.has(exchange) ? exchange : "ALL";
}

function normalizeCurrencyFilter(value) {
  const currency = String(value || "AUTO").trim().toUpperCase();
  return allowedCurrencyFilters.has(currency) ? currency : "AUTO";
}

function parseOptionalPositiveNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getMarketUniverseSettingsFromRequest(
  body = {},
  currentSettings = getDefaultMarketUniverseSettings()
) {
  const source = body.marketUniverseSettings || body.market_universe_settings || body;
  const universeMode = normalizeUniverseMode(
    source.universeMode ?? source.universe_mode ?? currentSettings.universe_mode
  );
  const market = normalizePrimaryMarket(
    source.market ??
      source.primaryMarket ??
      source.primary_market ??
      currentSettings.market
  );
  const exchange = normalizeExchangeFilter(
    source.exchange ??
      source.exchangeFilter ??
      source.exchange_filter ??
      currentSettings.exchange
  );
  const currency = normalizeCurrencyFilter(
    source.currency ??
      source.currencyDisplay ??
      source.currency_display ??
      currentSettings.currency
  );
  const highRiskMode = Boolean(
    source.highRiskMode ?? source.high_risk_mode ?? currentSettings.high_risk_mode
  );
  const includeSgx = parseBooleanSetting(
    source.includeSgx ?? source.include_sgx,
    currentSettings.include_sgx
  ) || market === "SG" || market === "BOTH";

  return {
    ...currentSettings,
    universe_mode: universeMode,
    min_market_cap: parseOptionalPositiveNumber(
      source.minMarketCap ?? source.min_market_cap,
      currentSettings.min_market_cap
    ),
    max_market_cap: parseOptionalPositiveNumber(
      source.maxMarketCap ?? source.max_market_cap,
      currentSettings.max_market_cap
    ),
    min_average_volume: parseOptionalPositiveNumber(
      source.minAverageVolume ?? source.min_average_volume,
      currentSettings.min_average_volume
    ),
    exclude_penny_stocks: parseBooleanSetting(
      source.excludePennyStocks ?? source.exclude_penny_stocks,
      currentSettings.exclude_penny_stocks
    ),
    include_non_sp500: parseBooleanSetting(
      source.includeNonSp500 ?? source.include_non_sp500,
      currentSettings.include_non_sp500
    ),
    high_risk_mode: highRiskMode || universeMode === "HIGH_GROWTH_HIGH_RISK",
    market,
    exchange,
    include_sgx: includeSgx,
    currency,
    updated_at: new Date().toISOString(),
  };
}

function getScanLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(parsed, 500);
}

function getRiskMultiplier(value) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.min(parsed, 5);
}

function getTradingHorizon(value) {
  const normalized = String(value || "SWING")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "LONGTERM") {
    return "LONG_TERM";
  }

  return allowedHorizons.has(normalized) ? normalized : "SWING";
}

module.exports = {
  allowedIntervals,
  getDefaultExecutionSettings,
  getDefaultMarketUniverseSettings,
  getExecutionSettingsFromRequest,
  getMarketUniverseSettingsFromRequest,
  getRiskMultiplier,
  getScanLimit,
  getTradingHorizon,
  normalizeExecutionMode,
  parseBooleanSetting,
};
