import argparse
import json
import sys
from datetime import datetime

from horizon_manager import apply_horizon_to_market_regime, get_horizon_profile
from macro_regime import detect_macro_regime
from news_filter import evaluate_news_filter
from openai_news_reasoner import reason_about_news
from position_aware_scanner import evaluate_portfolio_fit
from runtime_state import require_user_id
from safety_manager import evaluate_trade_safety


def parse_float(value, fallback=0):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback

    return parsed


def normalize_symbol(symbol):
    return str(symbol or "").strip().upper()


def get_position_value(position):
    quantity = parse_float(position.get("quantity"))
    price = parse_float(
        position.get("last_price")
        or position.get("avg_price")
        or position.get("entry_price")
        or position.get("price")
    )
    return quantity * price


def normalize_positions(positions):
    if isinstance(positions, dict):
        iterable = positions.values()
    elif isinstance(positions, list):
        iterable = positions
    else:
        iterable = []

    normalized = []

    for position in iterable:
        normalized.append({
            **position,
            "symbol": normalize_symbol(position.get("symbol")),
            "quantity": parse_float(position.get("quantity")),
            "notional": abs(get_position_value(position)),
        })

    return normalized


def get_portfolio_value(portfolio_state):
    if portfolio_state.get("equity") is not None:
        return parse_float(portfolio_state.get("equity"))

    cash = parse_float(portfolio_state.get("cash"))
    positions_value = sum(
        abs(get_position_value(position))
        for position in normalize_positions(portfolio_state.get("positions", {}))
    )
    return cash + positions_value


def find_scan_opportunity(scan_results, symbol):
    for opportunity in scan_results.get("opportunities", []):
        if normalize_symbol(opportunity.get("symbol")) == symbol:
            return opportunity

    return None


def get_market_regime(simulation_mode=False, horizon_profile=None):
    try:
        market_regime = detect_macro_regime()
    except Exception as error:
        if not simulation_mode:
            raise

        market_regime = {
            "regime_name": "UNKNOWN",
            "risk_multiplier": 0,
            "allowed_strategy_types": [],
            "allow_new_buys": False,
            "error": str(error),
        }

    if horizon_profile:
        return apply_horizon_to_market_regime(market_regime, horizon_profile)

    return market_regime


def calculate_position_effect(order, portfolio_state, scan_opportunity):
    symbol = order["symbol"]
    side = order["side"]
    quantity = order["quantity"]
    entry_price = order["entry_price"]
    proposed_value = quantity * entry_price
    positions = normalize_positions(portfolio_state.get("positions", {}))
    existing_position = next(
        (position for position in positions if position["symbol"] == symbol),
        None,
    )
    existing_quantity = existing_position["quantity"] if existing_position else 0
    existing_value = existing_position["notional"] if existing_position else 0
    signed_quantity_change = quantity if side == "BUY" else -quantity
    new_symbol_quantity = existing_quantity + signed_quantity_change
    new_symbol_value = abs(new_symbol_quantity * entry_price)
    current_total_exposure = sum(position["notional"] for position in positions)
    new_total_exposure = (
        current_total_exposure
        - abs(existing_quantity * entry_price)
        + new_symbol_value
    )
    sector = scan_opportunity.get("sector") if scan_opportunity else None
    current_sector_exposure = sum(
        position["notional"]
        for position in positions
        if position.get("sector") == sector and sector
    )
    new_sector_exposure = current_sector_exposure

    if sector:
        new_sector_exposure = (
            current_sector_exposure
            - abs(existing_quantity * entry_price)
            + new_symbol_value
        )

    return {
        "positions": positions,
        "existing_position": existing_position,
        "existing_quantity": existing_quantity,
        "existing_value": round(existing_value, 2),
        "new_symbol_quantity": round(new_symbol_quantity, 4),
        "new_symbol_value": round(new_symbol_value, 2),
        "proposed_value": round(proposed_value, 2),
        "current_total_exposure": round(current_total_exposure, 2),
        "new_total_exposure": round(new_total_exposure, 2),
        "sector": sector or "UNKNOWN",
        "current_sector_exposure": round(current_sector_exposure, 2),
        "new_sector_exposure": round(new_sector_exposure, 2),
    }


def calculate_risk(order, portfolio_value):
    side = order["side"]
    quantity = order["quantity"]
    entry_price = order["entry_price"]
    stop_loss = order["stop_loss"]
    take_profit = order["take_profit"]

    if side == "BUY":
        per_share_risk = max(0, entry_price - stop_loss)
        per_share_reward = max(0, take_profit - entry_price)
    else:
        per_share_risk = max(0, stop_loss - entry_price)
        per_share_reward = max(0, entry_price - take_profit)

    risk_amount = per_share_risk * quantity
    reward_amount = per_share_reward * quantity

    return {
        "estimated_max_loss": round(risk_amount, 2),
        "risk_amount_dollars": round(risk_amount, 2),
        "risk_amount_pct": round(risk_amount / portfolio_value, 4)
        if portfolio_value
        else 1,
        "potential_reward": round(reward_amount, 2),
        "reward_to_risk": round(reward_amount / risk_amount, 2)
        if risk_amount
        else None,
    }


def get_safety_result(
    order,
    portfolio_state,
    positions,
    market_regime,
    safety_status,
):
    return evaluate_trade_safety(
        proposed_order=order,
        current_portfolio_state=portfolio_state,
        daily_realized_pl=portfolio_state.get("realized_pnl", 0),
        current_open_positions=positions,
        market_regime=market_regime,
        safety_status=safety_status or {},
    )


def summarize_events(news_filter_result):
    return [
        {
            "event_type": event.get("event_type"),
            "title": event.get("title"),
            "starts_at": event.get("starts_at"),
            "sentiment_score": event.get("sentiment_score"),
            "is_major": event.get("is_major"),
        }
        for event in news_filter_result.get("events", [])
    ]


def get_recommendation(
    order,
    safety_result,
    news_filter_result,
    openai_reasoning,
    market_regime,
    scan_opportunity,
):
    violations = list(safety_result.get("violations", []))
    checklist = []

    confidence = parse_float(scan_opportunity.get("confidence")) if scan_opportunity else 0
    signal = scan_opportunity.get("signal") if scan_opportunity else "UNKNOWN"
    major_event_risk = any(
        event.get("is_major")
        or event.get("event_type") in {"EARNINGS", "MACRO", "FED"}
        for event in news_filter_result.get("events", [])
    )

    if violations:
        checklist.append("Safety manager found blocking violations.")

    if order["side"] == "BUY" and not market_regime.get("allow_new_buys", True):
        violations.append("Market regime does not allow new buys.")
        checklist.append("Market regime does not support new BUY exposure.")

    if not news_filter_result.get("allow_trade", True):
        violations.append("News filter suggests waiting.")
        checklist.append("News filter blocked or delayed this trade.")

    if major_event_risk:
        checklist.append("Upcoming major event risk suggests waiting.")

    if openai_reasoning.get("risk_level") == "HIGH":
        checklist.append("OpenAI reasoning flags high event risk.")

    if not openai_reasoning.get("allow_trade", True):
        violations.append("OpenAI reasoning suggests waiting.")

    if confidence < 60:
        checklist.append("Signal confidence is below preferred threshold.")

    if signal == "BUY" and order["side"] == "SELL":
        checklist.append("Trade direction conflicts with latest BUY signal.")

    if signal == "SELL" and order["side"] == "BUY":
        checklist.append("Trade direction conflicts with latest SELL signal.")

    if violations:
        return False, "REJECT", "HIGH", violations, checklist

    suggested_quantity = safety_result.get("adjusted_quantity", order["quantity"])

    if suggested_quantity < order["quantity"]:
        checklist.append("Safety manager recommends reducing quantity.")
        return True, "REDUCE_SIZE", "MEDIUM", violations, checklist

    if openai_reasoning.get("risk_level") == "HIGH" or not news_filter_result.get(
        "allow_trade",
        True,
    ):
        return False, "WAIT", "HIGH", violations, checklist

    if major_event_risk:
        return True, "WAIT", "MEDIUM", violations, checklist

    if confidence < 60:
        return True, "WAIT", "MEDIUM", violations, checklist

    checklist.append("Safety, regime, confidence, and event checks passed.")
    return True, "EXECUTE", safety_result.get("risk_level", "LOW"), violations, checklist


def analyze_pre_trade(
    user_id,
    symbol,
    side,
    quantity,
    entry_price,
    stop_loss,
    take_profit,
    simulation_mode=False,
    horizon="SWING",
    context=None,
):
    owner_id = require_user_id(user_id)
    context = context or {}
    blockers = []
    horizon_profile = get_horizon_profile(horizon)
    symbol = normalize_symbol(symbol)
    side = str(side or "").upper()
    order = {
        "symbol": symbol,
        "side": side,
        "quantity": parse_float(quantity),
        "entry_price": parse_float(entry_price),
        "stop_loss": parse_float(stop_loss),
        "take_profit": parse_float(take_profit),
    }

    try:
        portfolio_state = context.get("portfolio")
        if portfolio_state is None:
            raise ValueError("The user portfolio state could not be loaded.")
    except Exception as error:
        if not simulation_mode:
            return fail_closed(symbol, f"Portfolio data unavailable: {error}")
        blockers.append(f"Portfolio data unavailable: {error}")
        portfolio_state = {"cash": 0, "equity": 0, "positions": {}}

    try:
        scan_results = context.get("scan_results")
        if scan_results is None:
            raise ValueError("The user's latest scan could not be loaded.")
        scan_opportunity = find_scan_opportunity(scan_results, symbol)
        if scan_opportunity is None:
            raise ValueError(f"No latest scan result for {symbol}.")
    except Exception as error:
        if not simulation_mode:
            return fail_closed(symbol, f"Scan data unavailable: {error}")
        blockers.append(f"Scan data unavailable: {error}")
        scan_results = {"market_regime": {}}
        scan_opportunity = {}

    try:
        market_regime = get_market_regime(
            simulation_mode=simulation_mode,
            horizon_profile=horizon_profile,
        )
    except Exception as error:
        return fail_closed(symbol, f"Market regime unavailable: {error}")

    try:
        news_filter_result = evaluate_news_filter(
            symbol,
            sensitivity_multiplier=horizon_profile["news_event_sensitivity"],
        )
    except Exception as error:
        if not simulation_mode:
            return fail_closed(symbol, f"News/events unavailable: {error}")
        blockers.append(f"News/events unavailable: {error}")
        news_filter_result = {
            "allow_trade": False,
            "confidence_adjustment": 0,
            "sentiment_score": 0,
            "events": [],
            "reasons": [str(error)],
        }

    try:
        openai_reasoning = reason_about_news(
            symbol=symbol,
            technical_signal=scan_opportunity.get("signal", "UNKNOWN"),
            confidence=scan_opportunity.get("confidence", 0),
            market_regime=market_regime,
            news_events=news_filter_result.get("events", []),
            user_id=owner_id,
        )
    except Exception as error:
        if not simulation_mode:
            return fail_closed(symbol, f"OpenAI reasoning unavailable: {error}")
        blockers.append(f"OpenAI reasoning unavailable: {error}")
        openai_reasoning = {
            "news_summary": "Unavailable.",
            "risk_level": "HIGH",
            "sentiment": "NEUTRAL",
            "confidence_adjustment": 0,
            "allow_trade": False,
            "reasoning": str(error),
        }

    portfolio_value = get_portfolio_value(portfolio_state)
    cash_before = parse_float(portfolio_state.get("cash"))
    position_effect = calculate_position_effect(order, portfolio_state, scan_opportunity)
    risk_impact = calculate_risk(order, portfolio_value)
    risk_impact["horizon_adjusted_risk_multiplier"] = horizon_profile[
        "risk_multiplier_adjustment"
    ]
    cash_change = position_effect["proposed_value"] * (1 if side == "SELL" else -1)
    cash_after = cash_before + cash_change
    equity_after = cash_after + position_effect["new_total_exposure"]
    positions = position_effect["positions"]

    try:
        safety_order = {
            **order,
            "sector": scan_opportunity.get("sector"),
        }
        safety_result = get_safety_result(
            safety_order,
            portfolio_state,
            positions,
            market_regime,
            context.get("safety_status", {}),
        )
    except Exception as error:
        if not simulation_mode:
            return fail_closed(symbol, f"Safety checks unavailable: {error}")
        blockers.append(f"Safety checks unavailable: {error}")
        safety_result = {
            "allow_trade": False,
            "risk_level": "HIGH",
            "violations": [str(error)],
            "adjusted_quantity": 0,
        }

    portfolio_fit = evaluate_portfolio_fit(
        opportunity={
            **scan_opportunity,
            "symbol": symbol,
            "close": scan_opportunity.get("close", entry_price),
            "sector": scan_opportunity.get("sector", "UNKNOWN"),
        },
        portfolio_state=portfolio_state,
        proposed_order={
            **order,
            "sector": scan_opportunity.get("sector", "UNKNOWN"),
        },
        market_regime=market_regime,
        horizon_profile=horizon_profile,
        safety_result=safety_result,
    )

    allow_trade, recommendation, risk_level, safety_violations, checklist = (
        get_recommendation(
            order=order,
            safety_result=safety_result,
            news_filter_result=news_filter_result,
            openai_reasoning=openai_reasoning,
            market_regime=market_regime,
            scan_opportunity=scan_opportunity,
        )
    )

    if (
        scan_opportunity
        and parse_float(scan_opportunity.get("confidence")) < horizon_profile["signal_threshold"]
    ):
        checklist.append(
            f"{horizon_profile['name']} horizon prefers confidence >= "
            f"{horizon_profile['signal_threshold']}."
        )

    if blockers and not simulation_mode:
        allow_trade = False
        recommendation = "REJECT"
        risk_level = "HIGH"
        safety_violations.extend(blockers)

    return {
        "generated_at": datetime.now().isoformat(),
        "analysis_only": True,
        "allow_trade": allow_trade,
        "recommendation": recommendation,
        "risk_level": risk_level,
        "suggested_quantity": safety_result.get("adjusted_quantity", order["quantity"]),
        "portfolio_before": {
            "cash": round(cash_before, 2),
            "equity": round(portfolio_value, 2),
            "total_exposure": position_effect["current_total_exposure"],
            "positions_count": len(positions),
        },
        "portfolio_after": {
            "cash": round(cash_after, 2),
            "equity": round(equity_after, 2),
            "new_total_exposure": position_effect["new_total_exposure"],
            "new_total_exposure_pct": round(
                position_effect["new_total_exposure"] / portfolio_value,
                4,
            )
            if portfolio_value
            else 1,
            "single_position_exposure_pct": round(
                position_effect["new_symbol_value"] / portfolio_value,
                4,
            )
            if portfolio_value
            else 1,
            "sector": position_effect["sector"],
            "sector_exposure_before": position_effect["current_sector_exposure"],
            "sector_exposure_after": position_effect["new_sector_exposure"],
            "existing_position_effect": {
                "had_existing_position": position_effect["existing_position"] is not None,
                "quantity_before": position_effect["existing_quantity"],
                "quantity_after": position_effect["new_symbol_quantity"],
                "value_before": position_effect["existing_value"],
                "value_after": position_effect["new_symbol_value"],
            },
        },
        "risk_impact": risk_impact,
        "portfolio_fit": portfolio_fit,
        "portfolio_fit_score": portfolio_fit.get("portfolio_fit_score", 0),
        "portfolio_recommendation": portfolio_fit.get("recommendation", "REJECT"),
        "upcoming_events": summarize_events(news_filter_result),
        "news_reasoning": openai_reasoning,
        "safety_violations": safety_violations,
        "safety_checks": safety_result,
        "market_regime": market_regime,
        "trading_horizon": horizon_profile,
        "latest_scan": scan_opportunity,
        "explanation": build_explanation(
            recommendation,
            risk_level,
            safety_violations,
            news_filter_result,
            openai_reasoning,
            scan_opportunity,
        ),
        "checklist": checklist,
    }


def build_explanation(
    recommendation,
    risk_level,
    safety_violations,
    news_filter_result,
    openai_reasoning,
    scan_opportunity,
):
    parts = [
        f"Recommendation is {recommendation} with {risk_level} risk.",
        f"Latest signal is {scan_opportunity.get('signal', 'UNKNOWN')} at {scan_opportunity.get('confidence', 0)} confidence.",
    ]

    if safety_violations:
        parts.append(f"Safety violations: {'; '.join(safety_violations)}")

    if news_filter_result.get("reasons"):
        parts.append(f"News/events: {'; '.join(news_filter_result['reasons'][:3])}")

    if openai_reasoning.get("reasoning"):
        parts.append(f"OpenAI risk note: {openai_reasoning['reasoning']}")

    return " ".join(parts)


def fail_closed(symbol, reason):
    return {
        "generated_at": datetime.now().isoformat(),
        "analysis_only": True,
        "allow_trade": False,
        "recommendation": "REJECT",
        "risk_level": "HIGH",
        "suggested_quantity": 0,
        "portfolio_before": {},
        "portfolio_after": {},
        "risk_impact": {},
        "upcoming_events": [],
        "news_reasoning": {},
        "safety_violations": [reason],
        "explanation": f"{symbol}: pre-trade analysis failed closed. {reason}",
        "checklist": ["Blocked because required analysis data could not be loaded."],
    }


def get_args():
    parser = argparse.ArgumentParser(description="Analyze pre-trade portfolio impact.")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--side", required=True, choices=["BUY", "SELL"])
    parser.add_argument("--quantity", required=True, type=float)
    parser.add_argument("--entry-price", required=True, type=float)
    parser.add_argument("--stop-loss", required=True, type=float)
    parser.add_argument("--take-profit", required=True, type=float)
    parser.add_argument("--simulation-mode", action="store_true")
    parser.add_argument("--horizon", default="SWING")
    parser.add_argument("--context-json", default="")
    parser.add_argument("--context-stdin", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    args = get_args()
    context_json = sys.stdin.read() if args.context_stdin else args.context_json
    context = json.loads(context_json) if context_json else {}
    result = analyze_pre_trade(
        user_id=args.user_id,
        symbol=args.symbol,
        side=args.side,
        quantity=args.quantity,
        entry_price=args.entry_price,
        stop_loss=args.stop_loss,
        take_profit=args.take_profit,
        simulation_mode=args.simulation_mode,
        horizon=args.horizon,
        context=context,
    )
    print(json.dumps(result, indent=4))
