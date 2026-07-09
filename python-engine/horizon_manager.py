HORIZON_PROFILES = {
    "INTRADAY": {
        "name": "Intraday",
        "timeframes": ["5m", "15m", "1h"],
        "recommended_scan_interval": "5min",
        "strategy_bias": "aggressive_signals",
        "risk_multiplier_adjustment": 0.75,
        "indicator_configuration": {
            "ema_fast": 9,
            "ema_slow": 21,
            "rsi_period": 7,
            "atr_period": 7,
            "volatility_period": 10,
        },
        "stop_loss_atr_multiple": 1.0,
        "take_profit_atr_multiple": 3.0,
        "trailing_stop_atr_multiple": 1.25,
        "holding_period_assumption": "hours",
        "signal_threshold": 55,
        "confidence_weighting": {
            "technical": 0.55,
            "news": 0.2,
            "openai": 0.1,
            "regime": 0.15,
        },
        "news_event_sensitivity": 1.5,
        "risk_per_trade_multiplier": 0.75,
        "market_hours_only": True,
    },
    "SWING": {
        "name": "Swing",
        "timeframes": ["4h", "1d"],
        "recommended_scan_interval": "15min",
        "strategy_bias": "technical_regime_balanced",
        "risk_multiplier_adjustment": 1.0,
        "indicator_configuration": {
            "ema_fast": 20,
            "ema_slow": 50,
            "rsi_period": 14,
            "atr_period": 14,
            "volatility_period": 20,
        },
        "stop_loss_atr_multiple": 1.5,
        "take_profit_atr_multiple": 8.0,
        "trailing_stop_atr_multiple": 2.0,
        "holding_period_assumption": "days_to_weeks",
        "signal_threshold": 60,
        "confidence_weighting": {
            "technical": 0.45,
            "news": 0.15,
            "openai": 0.1,
            "regime": 0.3,
        },
        "news_event_sensitivity": 1.0,
        "risk_per_trade_multiplier": 1.0,
        "market_hours_only": True,
    },
    "POSITION": {
        "name": "Position",
        "timeframes": ["1d", "1wk"],
        "recommended_scan_interval": "30min",
        "strategy_bias": "regime_macro_confirmed",
        "risk_multiplier_adjustment": 0.9,
        "indicator_configuration": {
            "ema_fast": 50,
            "ema_slow": 100,
            "rsi_period": 14,
            "atr_period": 20,
            "volatility_period": 30,
        },
        "stop_loss_atr_multiple": 2.5,
        "take_profit_atr_multiple": 10.0,
        "trailing_stop_atr_multiple": 3.0,
        "holding_period_assumption": "weeks_to_months",
        "signal_threshold": 65,
        "confidence_weighting": {
            "technical": 0.35,
            "news": 0.2,
            "openai": 0.15,
            "regime": 0.3,
        },
        "news_event_sensitivity": 1.25,
        "risk_per_trade_multiplier": 0.9,
        "market_hours_only": True,
    },
    "LONG_TERM": {
        "name": "Long-Term",
        "timeframes": ["1wk", "1mo"],
        "recommended_scan_interval": "1h",
        "strategy_bias": "macro_fundamental_confirmed",
        "risk_multiplier_adjustment": 0.8,
        "indicator_configuration": {
            "ema_fast": 100,
            "ema_slow": 200,
            "rsi_period": 21,
            "atr_period": 30,
            "volatility_period": 60,
        },
        "stop_loss_atr_multiple": 3.5,
        "take_profit_atr_multiple": 12.0,
        "trailing_stop_atr_multiple": 4.0,
        "holding_period_assumption": "months_to_years",
        "signal_threshold": 70,
        "confidence_weighting": {
            "technical": 0.25,
            "news": 0.25,
            "openai": 0.2,
            "regime": 0.3,
        },
        "news_event_sensitivity": 1.35,
        "risk_per_trade_multiplier": 0.8,
        "market_hours_only": False,
    },
}


def normalize_horizon(horizon):
    key = str(horizon or "SWING").strip().upper().replace("-", "_").replace(" ", "_")

    if key == "LONGTERM":
        key = "LONG_TERM"

    if key not in HORIZON_PROFILES:
        key = "SWING"

    return key


def get_horizon_profile(horizon=None):
    key = normalize_horizon(horizon)
    profile = {
        "key": key,
        **HORIZON_PROFILES[key],
    }
    return profile


def apply_horizon_to_market_regime(market_regime, horizon_profile):
    adjusted = dict(market_regime)
    base_multiplier = float(adjusted.get("risk_multiplier", 1))
    horizon_multiplier = float(horizon_profile.get("risk_multiplier_adjustment", 1))
    adjusted["risk_multiplier"] = round(base_multiplier * horizon_multiplier, 4)
    adjusted["horizon"] = horizon_profile["key"]
    adjusted["horizon_strategy_bias"] = horizon_profile["strategy_bias"]
    return adjusted


def get_recommended_scan_interval(horizon=None):
    return get_horizon_profile(horizon)["recommended_scan_interval"]
