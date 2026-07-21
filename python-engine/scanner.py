import argparse
import json
import math
import os
import time
from pathlib import Path

from alerts import generate_alerts_from_scan_results
from contracts.execution_artifacts import build_execution_artifacts
from backtest import generate_research_signal_from_row, run_backtest
from horizon_manager import apply_horizon_to_market_regime, get_horizon_profile
from indicators import add_indicators
from json_utils import dumps_json_strict
from market_data import get_historical_data
from metadata import get_symbol_metadata, load_metadata_cache, save_metadata_cache
from news_filter import evaluate_news_filter
from openai_news_reasoner import reason_about_news
from paper_execution import generate_proposed_orders_from_scan_results
from position_aware_scanner import (
    build_proposed_order_from_opportunity,
    evaluate_portfolio_fit,
)
from regime import detect_market_regime
from runtime_state import get_runtime_path, require_user_id
from matrix_routing import (
    resolve_allocation_matrix_cell,
    resolve_routed_strategy_config,
)
from strategy_conditioning import (
    classify_instrument_type,
    compute_fit_score,
    evaluate_instrument_constraints,
)
from strategy import generate_signal_from_row
from universe import get_candidate_symbols, get_sp500_symbols
from storage import save_scan_results


ACTIVE_STRATEGY = {
    "name": "EMA/RSI Trend Momentum",
    "source": "python-engine/strategy.py",
    "signal_function": "generate_signal_from_row",
    "description": (
        "Scores each stock using EMA trend, price location versus EMA20, RSI, "
        "and volatility. Scanner then adjusts BUY eligibility with horizon, "
        "market regime, news/OpenAI risk, backtest performance, and portfolio fit."
    ),
    "technical_rules": [
        "EMA20 > EMA50 adds trend score.",
        "Close above EMA20 adds momentum score.",
        "RSI 30-65 is considered healthy; RSI < 30 gets a smaller oversold score.",
        "Volatility below 3% adds controlled-volatility score.",
    ],
    "buy_threshold": 70,
    "sell_threshold": 30,
    "raw_score_max": 80,
    "opportunity_score_formula": (
        "confidence * 0.4 + backtest_return * 0.3 + win_rate * 0.2 - drawdown * 0.1"
    ),
    "proposal_rule": "Proposed orders are created for BUY opportunities with opportunity_score >= 60.",
}

UNIVERSE_DEFAULTS = {
    "universe": "S_AND_P_500",
    "min_market_cap": 10_000_000_000,
    "max_market_cap": None,
    "min_average_volume": 1_000_000,
    "include_non_sp500": False,
    "exclude_penny_stocks": True,
    "high_risk_mode": False,
    "market": "US",
    "exchange": "ALL",
    "include_sgx": False,
    "currency": "AUTO",
}
MIN_MARKET_CAP_WITHOUT_HIGH_RISK = 300_000_000


def finite_number(value, fallback=None):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback

    return number if math.isfinite(number) else fallback


def rounded_number(value, digits=2, fallback=None):
    number = finite_number(value, fallback)
    return round(number, digits) if number is not None else fallback


def clamp_confidence(value):
    value = finite_number(value, 0)
    return max(0, min(100, round(value, 2)))


def calculate_confidence_breakdown(
    technical_confidence,
    news_adjustment,
    openai_adjustment,
    risk_multiplier,
    confidence_weighting=None,
):
    confidence_weighting = confidence_weighting or {}
    regime_adjustment = technical_confidence * (risk_multiplier - 1)
    weighted_adjustment = (
        technical_confidence
        * (confidence_weighting.get("technical", 0.4) / 0.4)
        + news_adjustment
        * (confidence_weighting.get("news", 0.15) / 0.15)
        + openai_adjustment
        * (confidence_weighting.get("openai", 0.1) / 0.1)
        + regime_adjustment
        * (confidence_weighting.get("regime", 0.35) / 0.35)
    )
    final_confidence = clamp_confidence(weighted_adjustment)

    return {
        "technical_confidence": round(technical_confidence, 2),
        "news_adjustment": round(news_adjustment, 2),
        "openai_adjustment": round(openai_adjustment, 2),
        "regime_adjustment": round(regime_adjustment, 2),
        "horizon_weighting": confidence_weighting,
        "final_confidence": final_confidence,
    }


def calculate_opportunity_score(confidence, backtest_return, win_rate, drawdown):
    confidence = finite_number(confidence, 0)
    backtest_return = finite_number(backtest_return, 0)
    win_rate = finite_number(win_rate, 0)
    drawdown = finite_number(drawdown, 0)
    score = (
        (confidence * 0.4)
        + (backtest_return * 0.3)
        + (win_rate * 0.2)
        - (drawdown * 0.1)
    )

    return round(score, 2)


def get_args():
    parser = argparse.ArgumentParser(description="Scan S&P 500 trading opportunities.")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--risk-multiplier", type=float)
    parser.add_argument("--horizon", default="SWING")
    parser.add_argument(
        "--symbols",
        default="",
        help="Optional comma-separated symbol universe to scan instead of the S&P 500 list.",
    )
    parser.add_argument(
        "--strategy-config",
        default="",
        help="Optional JSON strategy experiment settings to use for scanner signal generation.",
    )
    parser.add_argument("--execution-settings", default="{}")
    parser.add_argument("--portfolio-json", default="{}")
    parser.add_argument("--universe", default="S_AND_P_500")
    parser.add_argument("--min-market-cap", type=float, default=10_000_000_000)
    parser.add_argument("--max-market-cap", type=float)
    parser.add_argument("--min-average-volume", type=float, default=1_000_000)
    parser.add_argument("--include-non-sp500", action="store_true")
    parser.add_argument("--exclude-penny-stocks", action="store_true", default=True)
    parser.add_argument("--allow-penny-stocks", action="store_true")
    parser.add_argument("--high-risk-mode", action="store_true")
    parser.add_argument("--market", choices=["US", "SG", "BOTH"], default="US")
    parser.add_argument("--exchange", default="ALL")
    parser.add_argument("--include-sgx", action="store_true")
    parser.add_argument("--currency", default="AUTO")
    return parser.parse_args()


def parse_symbols(symbols_arg):
    symbols = []
    seen = set()

    for raw_symbol in str(symbols_arg or "").split(","):
        symbol = raw_symbol.strip().upper()

        if not symbol or symbol in seen:
            continue

        symbols.append(symbol)
        seen.add(symbol)

    return symbols


def parse_strategy_config(raw_config):
    if not raw_config:
        return None

    try:
        config = json.loads(raw_config)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid --strategy-config JSON: {exc}") from exc

    if not isinstance(config, dict):
        raise ValueError("--strategy-config must decode to an object.")

    return config


def get_strategy_value(strategy_config, snake_key, camel_key=None, default=None):
    if not strategy_config:
        return default

    if strategy_config.get(snake_key) is not None:
        return strategy_config.get(snake_key)

    if camel_key and strategy_config.get(camel_key) is not None:
        return strategy_config.get(camel_key)

    strategy_json = (
        strategy_config.get("strategy_json")
        or strategy_config.get("strategyJson")
        or {}
    )
    parameters = (
        strategy_json.get("executable", {}).get("parameters", {})
        if isinstance(strategy_json, dict)
        else {}
    )
    if camel_key and parameters.get(camel_key) is not None:
        return parameters.get(camel_key)
    if parameters.get(snake_key) is not None:
        return parameters.get(snake_key)

    return default


def get_strategy_json(strategy_config=None):
    if not strategy_config:
        return None

    strategy_json = (
        strategy_config.get("strategy_json")
        or strategy_config.get("strategyJson")
        or strategy_config.get("strategyJSON")
    )
    return strategy_json if isinstance(strategy_json, dict) else None


def build_indicator_config(horizon_profile, strategy_config=None):
    indicator_config = {
        **horizon_profile.get("indicator_configuration", {}),
    }

    if not strategy_config:
        return indicator_config

    ema_fast = get_strategy_value(strategy_config, "ema_fast", "emaFast")
    ema_slow = get_strategy_value(strategy_config, "ema_slow", "emaSlow")

    if ema_fast:
        indicator_config["ema_fast"] = int(ema_fast)

    if ema_slow:
        indicator_config["ema_slow"] = int(ema_slow)

    return indicator_config


def build_signal_config(strategy_config=None):
    if not strategy_config:
        return None

    signal_config = {
        "rsi_threshold": get_strategy_value(
            strategy_config, "rsi_threshold", "rsiThreshold", 65
        ),
        "signal_threshold": get_strategy_value(
            strategy_config, "signal_threshold", "signalThreshold", 70
        ),
    }
    strategy_json = get_strategy_json(strategy_config)
    if strategy_json:
        signal_config["strategyJson"] = strategy_json
        signal_config["strategy_version_id"] = (
            strategy_config.get("strategy_version_id")
            or strategy_config.get("strategyVersionId")
        )
        signal_config["rule_snapshot"] = (
            strategy_config.get("rule_snapshot")
            or strategy_config.get("ruleSnapshot")
            or strategy_json.get("executable")
        )

    return signal_config


def build_active_horizon_profile(horizon_profile, strategy_config=None):
    active_profile = {
        **horizon_profile,
        "indicator_configuration": build_indicator_config(
            horizon_profile,
            strategy_config,
        ),
    }

    if not strategy_config:
        return active_profile

    atr_stop_multiple = get_strategy_value(
        strategy_config, "atr_stop_multiple", "atrStopMultiple"
    )
    atr_take_profit_multiple = get_strategy_value(
        strategy_config, "atr_take_profit_multiple", "atrTakeProfitMultiple"
    )
    signal_threshold = get_strategy_value(
        strategy_config, "signal_threshold", "signalThreshold"
    )

    if atr_stop_multiple:
        active_profile["stop_loss_atr_multiple"] = float(
            atr_stop_multiple
        )

    if atr_take_profit_multiple:
        active_profile["take_profit_atr_multiple"] = float(
            atr_take_profit_multiple
        )

    if signal_threshold:
        active_profile["signal_threshold"] = float(signal_threshold)

    return active_profile


def build_active_strategy_metadata(strategy_config=None):
    if not strategy_config:
        return ACTIVE_STRATEGY

    strategy_json = get_strategy_json(strategy_config)
    rule_snapshot = (
        strategy_config.get("rule_snapshot")
        or strategy_config.get("ruleSnapshot")
        or (strategy_json or {}).get("executable")
    )
    return {
        **ACTIVE_STRATEGY,
        "name": strategy_config.get("name") or ACTIVE_STRATEGY["name"],
        "description": strategy_config.get("description")
        or ACTIVE_STRATEGY["description"],
        "experiment_id": strategy_config.get("experiment_id"),
        "strategyVersionId": strategy_config.get("strategy_version_id")
        or strategy_config.get("strategyVersionId"),
        "version": strategy_config.get("version"),
        "strategyJson": strategy_json,
        "ruleSnapshot": rule_snapshot,
        "settings": strategy_config,
        "source": "Strategy Lab active experiment + python-engine/backtest.py research signal",
        "technical_rules": [
            f"EMA fast ({get_strategy_value(strategy_config, 'ema_fast', 'emaFast', 20)}) > EMA slow ({get_strategy_value(strategy_config, 'ema_slow', 'emaSlow', 50)}) adds trend score.",
            "Close above fast EMA adds momentum score.",
            f"RSI must be within the active threshold ({get_strategy_value(strategy_config, 'rsi_threshold', 'rsiThreshold', 65)}) for full RSI score.",
            "Volatility below 3% adds controlled-volatility score.",
        ],
        "buy_threshold": get_strategy_value(
            strategy_config, "signal_threshold", "signalThreshold", 70
        ),
    }


def has_allocation_matrix(strategy_config):
    strategy_json = get_strategy_json(strategy_config)
    allocation_matrix = (
        (strategy_json or {}).get("executable", {}).get("allocationMatrix", {})
    )
    return isinstance(allocation_matrix, dict) and len(allocation_matrix) > 0


def build_universe_settings(args):
    universe = str(args.universe or "S_AND_P_500").upper()
    high_risk_mode = bool(args.high_risk_mode or universe == "HIGH_GROWTH_HIGH_RISK")
    min_market_cap = args.min_market_cap

    if not high_risk_mode:
        min_market_cap = max(min_market_cap, MIN_MARKET_CAP_WITHOUT_HIGH_RISK)

    return {
        "universe": universe,
        "min_market_cap": min_market_cap,
        "max_market_cap": args.max_market_cap,
        "min_average_volume": args.min_average_volume,
        "include_non_sp500": bool(args.include_non_sp500),
        "exclude_penny_stocks": bool(args.exclude_penny_stocks and not args.allow_penny_stocks),
        "high_risk_mode": high_risk_mode,
        "market": str(args.market or "US").upper(),
        "exchange": str(args.exchange or "ALL").upper(),
        "include_sgx": bool(
            args.include_sgx or str(args.market or "US").upper() in {"SG", "BOTH"}
        ),
        "currency": str(args.currency or "AUTO").upper(),
    }


def passes_universe_filters(symbol, latest, metadata, is_sp500, settings):
    market_cap = metadata.get("market_cap")
    average_volume = metadata.get("average_volume")
    close = float(latest["close"])
    reasons = []
    exchange = str(metadata.get("exchange") or "UNKNOWN").upper()
    currency = str(metadata.get("currency") or "").upper()
    is_sgx = bool(metadata.get("is_sgx"))
    is_us = bool(metadata.get("is_us"))

    if settings.get("market") == "US" and not is_us:
        reasons.append("market_not_us")

    if settings.get("market") == "SG" and not is_sgx:
        reasons.append("market_not_singapore")

    if settings.get("exchange") not in {"", "ALL"} and exchange != settings["exchange"]:
        reasons.append("exchange_filtered")

    if settings.get("currency") not in {"", "AUTO", "ALL"} and currency != settings["currency"]:
        reasons.append("currency_filtered")

    if (
        not settings["include_non_sp500"]
        and not settings["high_risk_mode"]
        and settings["universe"] != "S_AND_P_500"
        and not is_sp500
    ):
        reasons.append("non_sp500_excluded")

    if settings["exclude_penny_stocks"] and close < 5:
        reasons.append("penny_stock_excluded")

    if market_cap is not None and market_cap < settings["min_market_cap"]:
        reasons.append("market_cap_below_minimum")

    if settings["max_market_cap"] is not None and market_cap is not None and market_cap > settings["max_market_cap"]:
        reasons.append("market_cap_above_maximum")

    if average_volume is not None and average_volume < settings["min_average_volume"]:
        reasons.append("average_volume_below_minimum")

    return len(reasons) == 0, reasons


def build_risk_universe_fields(latest, metadata, is_sp500, settings):
    close = float(latest["close"])
    volatility = float(latest.get("volatility_20") or 0)
    market_cap = metadata.get("market_cap")
    average_volume = metadata.get("average_volume")
    is_sgx = bool(metadata.get("is_sgx"))
    liquidity_risk = average_volume is None or average_volume < settings["min_average_volume"] * 1.5
    volatility_risk = volatility > 0.04 or settings["high_risk_mode"]
    market_cap_risk = market_cap is None or market_cap < 2_000_000_000 or settings["high_risk_mode"]
    penny_risk = close < 5
    high_risk_flag = (
        settings["high_risk_mode"]
        or liquidity_risk
        or volatility_risk
        or market_cap_risk
        or penny_risk
        or is_sgx
    )

    warnings = []
    if liquidity_risk:
        warnings.append("Liquidity warning: average volume is low for automation.")
    if is_sgx:
        warnings.append("SGX trade requires manual approval until Singapore automation is explicitly enabled.")
        warnings.append("SGX sizing note: reduce suggested position size if liquidity is unknown.")
    if volatility_risk:
        warnings.append("Volatility warning: wider stops and smaller sizing recommended.")
    if market_cap_risk:
        warnings.append("Market cap warning: smaller companies require manual review.")
    if high_risk_flag:
        warnings.extend([
            "High-risk universe trade requires manual review.",
            "Suggested action: use reduced position size.",
            "Suggested action: consider wider ATR-based stop loss.",
        ])

    return {
        "market_cap": market_cap,
        "average_volume": average_volume,
        "is_sp500": is_sp500,
        "risk_universe": settings["universe"],
        "liquidity_risk": liquidity_risk,
        "volatility_risk": volatility_risk,
        "market_cap_risk": market_cap_risk,
        "high_risk_flag": high_risk_flag,
        "high_risk_warnings": warnings,
    }


def emit_scan_progress(processed, total, stage):
    safe_total = max(0, int(total or 0))
    safe_processed = min(max(0, int(processed or 0)), safe_total)
    progress = (safe_processed / safe_total) * 100 if safe_total else 0
    print(
        "__SCAN_PROGRESS__="
        + dumps_json_strict(
            {
                "progress": round(progress, 2),
                "processed": safe_processed,
                "total": safe_total,
                "stage": stage,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )


args = get_args()
user_id = require_user_id(args.user_id)
scan_results_file = get_runtime_path(user_id, "scan_results")
alerts_file = get_runtime_path(user_id, "alerts")
proposed_orders_file = get_runtime_path(user_id, "proposed_orders")
scan_started_at = time.monotonic()
limit = args.limit
strategy_config = parse_strategy_config(args.strategy_config)
execution_settings = json.loads(args.execution_settings or "{}")
portfolio_state = json.loads(args.portfolio_json or "{}")
active_strategy_metadata = build_active_strategy_metadata(strategy_config)
universe_settings = build_universe_settings(args)

horizon_profile = get_horizon_profile(args.horizon)
market_regime = detect_market_regime()

if args.risk_multiplier is not None:
    market_regime["risk_multiplier"] = args.risk_multiplier

market_regime = apply_horizon_to_market_regime(market_regime, horizon_profile)

print("\n--- Market Regime ---")
print("Regime:", market_regime["regime"])
print("Risk Multiplier:", market_regime["risk_multiplier"])
print("Allow New Buys:", market_regime["allow_new_buys"])
print("Trading Horizon:", horizon_profile["name"])
print("Recommended Scan Interval:", horizon_profile["recommended_scan_interval"])

watchlist_symbols = parse_symbols(args.symbols)
sp500_symbols = set(get_sp500_symbols(600))
symbols = watchlist_symbols if watchlist_symbols else get_candidate_symbols(
    universe_settings["universe"],
    limit,
    market=universe_settings["market"],
    include_sgx=universe_settings["include_sgx"],
)
opportunities = []
skipped_symbols = []
error_symbols = []
metadata_cache = load_metadata_cache()
if not portfolio_state:
    portfolio_state = {"cash": 100000, "positions": {}}

if watchlist_symbols:
    print(f"\nScanning {len(symbols)} watchlist stocks...\n")
else:
    print(f"\nScanning {len(symbols)} stocks...\n")

emit_scan_progress(0, len(symbols), "LOADING_MARKET_DATA")

for symbol_index, symbol in enumerate(symbols, start=1):
    try:
        df = get_historical_data(symbol, period="1y")
        symbol_metadata = get_symbol_metadata(symbol, metadata_cache)
        effective_strategy_config, routing_cell = resolve_routed_strategy_config(
            strategy_config,
            symbol_metadata.get("sector"),
            market_regime.get("regime"),
        )
        strategy_routes_by_matrix = has_allocation_matrix(strategy_config)
        effective_signal_config = build_signal_config(effective_strategy_config)
        effective_horizon_profile = build_active_horizon_profile(
            horizon_profile,
            effective_strategy_config,
        )
        effective_indicator_config = effective_horizon_profile["indicator_configuration"]
        df = add_indicators(df, effective_indicator_config)

        latest = df.iloc[-1]
        latest_close = finite_number(latest.get("close"))

        if latest_close is None or latest_close <= 0:
            print(f"Skipped {symbol}: latest close is unavailable")
            skipped_symbols.append({
                "symbol": symbol,
                "reason": "latest close is unavailable",
            })
            continue

        is_sp500 = symbol in sp500_symbols
        passes_filters, filter_reasons = passes_universe_filters(
            symbol,
            latest,
            symbol_metadata,
            is_sp500,
            universe_settings,
        )

        if not passes_filters:
            print(f"Skipped {symbol}: {', '.join(filter_reasons)}")
            skipped_symbols.append({
                "symbol": symbol,
                "reason": ", ".join(filter_reasons),
            })
            continue

        risk_universe_fields = build_risk_universe_fields(
            latest,
            symbol_metadata,
            is_sp500,
            universe_settings,
        )
        signal_data = (
            generate_research_signal_from_row(
                latest,
                effective_signal_config,
                context={"regime": market_regime.get("regime"), "symbol": symbol},
            )
            if effective_signal_config
            else generate_signal_from_row(latest)
        )
        technical_confidence = signal_data["confidence"]

        if not market_regime["allow_new_buys"] and signal_data["signal"] == "BUY":
            signal_data["signal"] = "HOLD"
            signal_data["reasons"].append(
                "Market regime blocks new BUY entries."
            )

        news_evaluation = evaluate_news_filter(
            symbol,
            sensitivity_multiplier=horizon_profile["news_event_sensitivity"],
        )
        openai_news_reasoning = reason_about_news(
            symbol=symbol,
            technical_signal=signal_data["signal"],
            confidence=technical_confidence,
            market_regime=market_regime,
            news_events=news_evaluation.get("events", []),
            user_id=user_id,
        )
        confidence_breakdown = calculate_confidence_breakdown(
            technical_confidence=technical_confidence,
            news_adjustment=news_evaluation.get("confidence_adjustment", 0),
            openai_adjustment=openai_news_reasoning.get("confidence_adjustment", 0),
            risk_multiplier=market_regime["risk_multiplier"],
            confidence_weighting=horizon_profile["confidence_weighting"],
        )
        final_confidence = confidence_breakdown["final_confidence"]

        active_signal_threshold = float(
                    get_strategy_value(
                        effective_strategy_config,
                        "signal_threshold",
                        "signalThreshold",
                        horizon_profile["signal_threshold"],
                    )
            if effective_strategy_config
            else horizon_profile["signal_threshold"]
        )

        if final_confidence < active_signal_threshold and signal_data["signal"] == "BUY":
            signal_data["signal"] = "HOLD"
            signal_data["reasons"].append(
                f"{horizon_profile['name']} horizon requires confidence >= "
                f"{active_signal_threshold} for BUY."
            )

        if (
            signal_data["signal"] == "BUY"
            and not openai_news_reasoning.get("allow_trade", True)
        ):
            signal_data["signal"] = "HOLD"
            signal_data["reasons"].append(
                "OpenAI news risk layer blocked new BUY; downgraded to HOLD."
            )

        if openai_news_reasoning.get("fallbackUsed"):
            signal_data["reasons"].append(
                "AI news reasoning unavailable; neutral fallback was used."
            )

        backtest_result = run_backtest(
            symbol=symbol,
            initial_cash=1000,
            period="2y",
            risk_per_trade=(
                float(
                    get_strategy_value(
                        effective_strategy_config,
                        "risk_per_trade",
                        "riskPerTrade",
                        0.02,
                    )
                    if effective_strategy_config
                    else 0.02
                )
                * market_regime["risk_multiplier"]
                * horizon_profile["risk_per_trade_multiplier"]
            ),
            horizon_profile=effective_horizon_profile,
            strategy_config=effective_signal_config,
        )

        opportunity_score = calculate_opportunity_score(
            confidence=final_confidence,
            backtest_return=backtest_result["total_return_pct"],
            win_rate=backtest_result["win_rate_pct"],
            drawdown=backtest_result["max_drawdown_pct"],
        )

        strategy_json = (
            get_strategy_json(effective_strategy_config)
            if effective_strategy_config
            else {}
        )
        fit = compute_fit_score(
            {
                "symbol": symbol,
                "sector": symbol_metadata.get("sector"),
                "regime": market_regime.get("regime"),
                "volatility": latest.get("volatility_20"),
                "averageVolume": symbol_metadata.get("average_volume"),
                "metadata": symbol_metadata,
            },
            (strategy_json or {}).get("executable", {}).get("envelope", {}),
        )
        instrument_type = classify_instrument_type(symbol, symbol_metadata)
        instrument_constraints = evaluate_instrument_constraints(
            instrument_type,
            envelope=(strategy_json or {}).get("executable", {}).get("envelope", {}),
            strategy_context={
                "allowOvernight": bool(
                    ((strategy_json or {}).get("executable", {}).get("envelope", {}) or {}).get(
                        "holdingPeriodDays", 15
                    )
                    > 1
                ),
            },
        )
        if not fit["passed"] and signal_data["signal"] == "BUY":
            signal_data["signal"] = "HOLD"
            signal_data["reasons"].append("Candidate is outside the validated strategy envelope.")
            signal_data["reasons"].extend(fit["reasons"])
        if instrument_constraints.get("blocked") and signal_data["signal"] == "BUY":
            signal_data["signal"] = "HOLD"
            signal_data["reasons"].extend(instrument_constraints["warnings"])
        elif instrument_constraints.get("warnings"):
            signal_data["reasons"].extend(instrument_constraints["warnings"])
        if strategy_routes_by_matrix and not routing_cell and signal_data["signal"] == "BUY":
            signal_data["signal"] = "HOLD"
            signal_data["reasons"].append(
                "No evidence-cleared sector/regime route is active for this candidate."
            )
        if routing_cell and not routing_cell.get("active", False) and signal_data["signal"] == "BUY":
            signal_data["signal"] = "HOLD"
            signal_data["reasons"].append("Sector/regime matrix cell is inactive due to insufficient evidence.")

        routed_strategy_metadata = build_active_strategy_metadata(
            effective_strategy_config
        )

        opportunity = {
            "symbol": symbol,
            "strategy_name": routed_strategy_metadata["name"],
            "strategy_source": routed_strategy_metadata["source"],
            "strategy_config": effective_strategy_config,
            "strategy_version_id": routed_strategy_metadata.get("strategyVersionId"),
            "strategyVersionId": routed_strategy_metadata.get("strategyVersionId"),
            "rule_snapshot": routed_strategy_metadata.get("ruleSnapshot"),
            "ruleSnapshot": routed_strategy_metadata.get("ruleSnapshot"),
            "signal_score": signal_data.get("confidence"),
            "display_symbol": symbol_metadata.get("display_symbol") or symbol,
            "yahoo_symbol": symbol_metadata.get("yahoo_symbol") or symbol,
            "company_name": symbol_metadata.get("company_name"),
            "market": symbol_metadata.get("market") or "US",
            "exchange": symbol_metadata.get("exchange") or "UNKNOWN",
            "currency": symbol_metadata.get("currency") or "USD",
            "country": symbol_metadata.get("country") or "United States",
            "is_sgx": bool(symbol_metadata.get("is_sgx")),
            "is_us": bool(symbol_metadata.get("is_us")),
            "sector": symbol_metadata["sector"],
            "industry": symbol_metadata["industry"],
            "instrument_type": instrument_type,
            "fit_score": fit["fitScore"],
            "fit_reasons": fit["reasons"],
            "fit_dimensions": fit["dimensions"],
            "regime_at_signal": fit["regimeAtSignal"],
            "sector_context": fit["sectorContext"],
            "allocation_matrix_cell": routing_cell,
            **risk_universe_fields,
            "signal": signal_data["signal"],
            "confidence": final_confidence,
            "final_confidence": final_confidence,
            "technical_confidence": technical_confidence,
            "confidence_breakdown": confidence_breakdown,
            "opportunity_score": opportunity_score,
            "close": round(latest_close, 2),
            "rsi": rounded_number(latest.get("rsi_14")),
            "backtest_return": backtest_result["total_return_pct"],
            "buy_and_hold": backtest_result["buy_and_hold_return_pct"],
            "win_rate": backtest_result["win_rate_pct"],
            "drawdown": backtest_result["max_drawdown_pct"],
            "sharpe_ratio": backtest_result["sharpe_ratio"],
            "profit_factor": backtest_result["profit_factor"],
            "expectancy_per_trade": backtest_result["expectancy_per_trade"],
            "average_holding_period_days": backtest_result[
                "average_holding_period_days"
            ],
            "annualized_return": backtest_result["annualized_return_pct"],
            "volatility": backtest_result["volatility_pct"],
            "trades": backtest_result["completed_trades"],
            "reasons": signal_data["reasons"],
            "news_filter": news_evaluation,
            "openai_news_reasoning": openai_news_reasoning,
            "trading_horizon": effective_horizon_profile,
            "strategy_bias": effective_horizon_profile["strategy_bias"],
            "holding_period_assumption": effective_horizon_profile[
                "holding_period_assumption"
            ],
            "instrument_constraints": instrument_constraints,
        }

        if risk_universe_fields["high_risk_flag"]:
            signal_data["reasons"].extend(risk_universe_fields["high_risk_warnings"])
            opportunity["reasons"] = signal_data["reasons"]
        position_order = build_proposed_order_from_opportunity(
            opportunity,
            portfolio_state=portfolio_state,
            horizon_profile=effective_horizon_profile,
        )
        portfolio_fit = evaluate_portfolio_fit(
            opportunity=opportunity,
            portfolio_state=portfolio_state,
            proposed_order=position_order,
            market_regime=market_regime,
            horizon_profile=effective_horizon_profile,
        )
        opportunity["portfolio_fit"] = portfolio_fit
        opportunity["portfolio_fit_score"] = portfolio_fit["portfolio_fit_score"]
        opportunity["portfolio_recommendation"] = portfolio_fit["recommendation"]

        opportunities.append(opportunity)

        print(f"Scanned {symbol}")

    except Exception as e:
        print(f"Error scanning {symbol}: {e}")
        error_symbols.append({
            "symbol": symbol,
            "error": str(e),
        })
    finally:
        emit_scan_progress(symbol_index, len(symbols), f"SCANNED_{symbol}")

emit_scan_progress(len(symbols), len(symbols), "FINALIZING_RESULTS")
save_metadata_cache(metadata_cache)

opportunities = sorted(
    opportunities,
    key=lambda x: x["opportunity_score"],
    reverse=True
)

print("\n--- Top Opportunities ---")

for item in opportunities[:20]:
    print(
        f"{item['symbol']} | "
        f"{item['signal']} | "
        f"Score: {item['opportunity_score']} | "
        f"Confidence: {item['confidence']} | "
        f"Backtest: {item['backtest_return']}% | "
        f"Buy&Hold: {item['buy_and_hold']}% | "
        f"Win Rate: {item['win_rate']}% | "
        f"Drawdown: {item['drawdown']}%"
    )

    for reason in item["reasons"]:
        print("  -", reason)

    print()

scan_results = save_scan_results(
    opportunities,
    market_regime,
    filename=None,
    horizon_profile=build_active_horizon_profile(horizon_profile, strategy_config),
    active_strategy=active_strategy_metadata,
    universe_settings=universe_settings,
    scan_duration=time.monotonic() - scan_started_at,
    scan_summary={
        "requested_limit": limit,
        "symbols_considered": len(symbols),
        "symbols_processed": len(symbols),
        "opportunities_returned": len(opportunities),
        "skipped_count": len(skipped_symbols),
        "error_count": len(error_symbols),
        "skipped_symbols": skipped_symbols[:50],
        "error_symbols": error_symbols[:50],
    },
    user_id=user_id,
)
alerts = generate_alerts_from_scan_results(scan_results, alerts_file, user_id=user_id)
proposed_orders = generate_proposed_orders_from_scan_results(
    user_id=user_id,
    scan_results=scan_results,
    proposed_orders_file=None,
    execution_settings=execution_settings,
)
emit_scan_progress(len(symbols), len(symbols), "PERSISTING_RESULTS")
execution_artifacts = build_execution_artifacts(
    scan_results=scan_results,
    alerts=alerts,
    proposed_orders=proposed_orders,
    metadata={
        "contract_version": 1,
        "debug_runtime_enabled": bool(
            str(os.getenv("DEBUG_WRITE_RUNTIME_JSON", "")).strip().lower()
            in {"1", "true", "yes", "on"}
        ),
    },
    diagnostics={
        "skipped_count": len(skipped_symbols),
        "error_count": len(error_symbols),
    },
)
print(
    "__SCAN_ARTIFACTS__="
    + dumps_json_strict(execution_artifacts, separators=(",", ":"))
)
