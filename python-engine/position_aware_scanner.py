import math

from risk import calculate_position_size


DEFAULT_PORTFOLIO_VALUE = 100000
DEFAULT_RISK_PER_TRADE = 0.01
DEFAULT_MAX_TOTAL_EXPOSURE_PCT = 0.80
DEFAULT_MAX_POSITION_EXPOSURE_PCT = 0.10
DEFAULT_MAX_SECTOR_EXPOSURE_PCT = 0.30


def get_default_portfolio_state():
    return {"cash": DEFAULT_PORTFOLIO_VALUE, "positions": {}}


def parse_float(value, fallback=0):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback

    return parsed if math.isfinite(parsed) else fallback


def normalize_symbol(symbol):
    return str(symbol or "").strip().upper()


def get_position_price(position):
    return parse_float(
        position.get("last_price")
        or position.get("market_price")
        or position.get("avg_price")
        or position.get("entry_price")
        or position.get("price")
    )


def get_position_notional(position):
    if position.get("notional") is not None:
        return abs(parse_float(position.get("notional")))

    if position.get("market_value") is not None:
        return abs(parse_float(position.get("market_value")))

    return abs(parse_float(position.get("quantity")) * get_position_price(position))


def normalize_positions(positions):
    if isinstance(positions, dict):
        iterable = positions.values()
    elif isinstance(positions, list):
        iterable = positions
    else:
        iterable = []

    normalized = []

    for position in iterable:
        item = dict(position)
        item["symbol"] = normalize_symbol(item.get("symbol"))
        item["quantity"] = parse_float(item.get("quantity"))
        item["notional"] = get_position_notional(item)
        item["sector"] = item.get("sector") or "UNKNOWN"
        normalized.append(item)

    return normalized


def get_portfolio_value(portfolio_state):
    for key in (
        "portfolio_value",
        "account_value",
        "equity",
        "total_equity",
        "net_liquidation",
    ):
        if portfolio_state.get(key) is not None:
            return max(0, parse_float(portfolio_state.get(key)))

    cash = parse_float(portfolio_state.get("cash"))
    positions_value = sum(
        position["notional"]
        for position in normalize_positions(portfolio_state.get("positions", {}))
    )

    if cash or positions_value:
        return max(0, cash + positions_value)

    return DEFAULT_PORTFOLIO_VALUE


def pct(value, denominator):
    if denominator <= 0:
        return 0

    return round(value / denominator, 4)


def get_order_price(order):
    return parse_float(
        order.get("entry_price")
        or order.get("limit_price")
        or order.get("price")
        or order.get("close")
    )


def get_order_quantity(order):
    return max(0, parse_float(order.get("quantity")))


def get_opportunity_price(opportunity):
    return parse_float(
        opportunity.get("close")
        or opportunity.get("entry_price")
        or opportunity.get("price")
    )


def estimate_atr(opportunity, entry_price):
    return max(
        parse_float(opportunity.get("atr")),
        parse_float(opportunity.get("atr_14")),
        entry_price * 0.03,
    )


def build_proposed_order_from_opportunity(
    opportunity,
    portfolio_state=None,
    horizon_profile=None,
    risk_per_trade=DEFAULT_RISK_PER_TRADE,
):
    portfolio_state = portfolio_state or get_default_portfolio_state()
    horizon_profile = horizon_profile or opportunity.get("trading_horizon") or {}
    entry_price = get_opportunity_price(opportunity)
    atr = estimate_atr(opportunity, entry_price)
    stop_multiple = parse_float(horizon_profile.get("stop_loss_atr_multiple"), 1.5)
    target_multiple = parse_float(horizon_profile.get("take_profit_atr_multiple"), 8)
    stop_loss = parse_float(
        opportunity.get("stop_loss"),
        entry_price - (atr * stop_multiple),
    )
    take_profit = parse_float(
        opportunity.get("take_profit"),
        entry_price + (atr * target_multiple),
    )
    account_value = get_portfolio_value(portfolio_state)
    risk_multiplier = parse_float(horizon_profile.get("risk_per_trade_multiplier"), 1)
    quantity = calculate_position_size(
        account_value=account_value,
        risk_per_trade=risk_per_trade * risk_multiplier,
        entry_price=entry_price,
        stop_loss=stop_loss,
    )

    return {
        "symbol": normalize_symbol(opportunity.get("symbol")),
        "side": "BUY" if opportunity.get("signal") == "BUY" else "HOLD",
        "quantity": quantity,
        "entry_price": round(entry_price, 4),
        "stop_loss": round(stop_loss, 4),
        "take_profit": round(take_profit, 4),
        "sector": opportunity.get("sector") or "UNKNOWN",
    }


def get_existing_position(positions, symbol):
    return next(
        (position for position in positions if position["symbol"] == symbol),
        None,
    )


def calculate_averaging(existing_position, side, entry_price):
    if not existing_position:
        return {
            "mode": "NEW_POSITION",
            "average_price": None,
            "entry_vs_average_pct": 0,
        }

    average_price = parse_float(
        existing_position.get("avg_price")
        or existing_position.get("average_price")
        or existing_position.get("entry_price")
        or existing_position.get("price")
    )

    if average_price <= 0:
        return {
            "mode": "EXISTING_POSITION",
            "average_price": None,
            "entry_vs_average_pct": 0,
        }

    difference_pct = pct(entry_price - average_price, average_price)

    if str(side).upper() == "SELL":
        mode = "REDUCING_POSITION"
    elif entry_price > average_price:
        mode = "AVERAGING_UP"
    elif entry_price < average_price:
        mode = "AVERAGING_DOWN"
    else:
        mode = "ADDING_AT_AVERAGE"

    return {
        "mode": mode,
        "average_price": round(average_price, 4),
        "entry_vs_average_pct": difference_pct,
    }


def calculate_stop_loss_risk(order, portfolio_value):
    side = str(order.get("side") or "BUY").upper()
    quantity = get_order_quantity(order)
    entry_price = get_order_price(order)
    stop_loss = parse_float(order.get("stop_loss"))

    if side == "SELL":
        risk_per_share = max(0, stop_loss - entry_price)
    else:
        risk_per_share = max(0, entry_price - stop_loss)

    risk_amount = risk_per_share * quantity

    return {
        "risk_per_share": round(risk_per_share, 4),
        "risk_amount": round(risk_amount, 2),
        "risk_pct_of_portfolio": pct(risk_amount, portfolio_value),
        "stop_loss": round(stop_loss, 4),
    }


def calculate_adjusted_quantity(order, portfolio_value, current_exposure, sector_exposure):
    requested_quantity = get_order_quantity(order)
    price = get_order_price(order)

    if requested_quantity <= 0 or price <= 0 or portfolio_value <= 0:
        return 0

    remaining_total = max(
        0,
        (portfolio_value * DEFAULT_MAX_TOTAL_EXPOSURE_PCT) - current_exposure,
    )
    remaining_sector = max(
        0,
        (portfolio_value * DEFAULT_MAX_SECTOR_EXPOSURE_PCT) - sector_exposure,
    )
    max_position = portfolio_value * DEFAULT_MAX_POSITION_EXPOSURE_PCT
    max_allowed_notional = min(remaining_total, remaining_sector, max_position)

    return int(max(0, min(requested_quantity, max_allowed_notional // price)))


def assess_horizon_compatibility(opportunity, horizon_profile):
    profile = horizon_profile or opportunity.get("trading_horizon") or {}
    active_key = str(profile.get("key") or "").upper()
    opportunity_key = str(
        (opportunity.get("trading_horizon") or {}).get("key")
        or opportunity.get("horizon")
        or active_key
    ).upper()
    expected_holding = profile.get("holding_period_assumption")
    actual_holding = opportunity.get("holding_period_assumption") or expected_holding
    compatible = not active_key or not opportunity_key or active_key == opportunity_key

    return {
        "compatible": compatible,
        "active_horizon": active_key or "UNKNOWN",
        "opportunity_horizon": opportunity_key or "UNKNOWN",
        "expected_holding_period": expected_holding or "UNKNOWN",
        "opportunity_holding_period": actual_holding or "UNKNOWN",
    }


def get_regime_allows_trade(order, market_regime):
    if str(order.get("side")).upper() != "BUY":
        return True

    return bool((market_regime or {}).get("allow_new_buys", True))


def evaluate_portfolio_fit(
    opportunity,
    portfolio_state=None,
    proposed_order=None,
    market_regime=None,
    horizon_profile=None,
    safety_result=None,
):
    try:
        portfolio_state = portfolio_state or get_default_portfolio_state()
        order = proposed_order or build_proposed_order_from_opportunity(
            opportunity,
            portfolio_state=portfolio_state,
            horizon_profile=horizon_profile,
        )
        symbol = normalize_symbol(order.get("symbol") or opportunity.get("symbol"))
        sector = order.get("sector") or opportunity.get("sector") or "UNKNOWN"
        positions = normalize_positions(portfolio_state.get("positions", {}))
        portfolio_value = get_portfolio_value(portfolio_state)
        entry_price = get_order_price(order)
        requested_quantity = get_order_quantity(order)
        order_notional = requested_quantity * entry_price
        existing_position = get_existing_position(positions, symbol)
        existing_notional = existing_position["notional"] if existing_position else 0
        existing_quantity = existing_position["quantity"] if existing_position else 0
        signed_quantity_change = requested_quantity

        if str(order.get("side") or "BUY").upper() == "SELL":
            signed_quantity_change *= -1

        new_symbol_quantity = existing_quantity + signed_quantity_change
        new_symbol_notional = abs(new_symbol_quantity * entry_price)
        current_exposure = sum(position["notional"] for position in positions)
        new_exposure = current_exposure - existing_notional + new_symbol_notional
        current_sector_exposure = sum(
            position["notional"]
            for position in positions
            if (position.get("sector") or "UNKNOWN") == sector
        )
        existing_sector_notional = (
            existing_notional
            if existing_position and (existing_position.get("sector") or "UNKNOWN") == sector
            else 0
        )
        new_sector_exposure = (
            current_sector_exposure - existing_sector_notional + new_symbol_notional
        )
        stop_risk = calculate_stop_loss_risk(order, portfolio_value)
        risk_budget_amount = portfolio_value * DEFAULT_RISK_PER_TRADE
        risk_budget_usage = (
            stop_risk["risk_amount"] / risk_budget_amount
            if risk_budget_amount > 0
            else 1
        )
        averaging = calculate_averaging(existing_position, order.get("side"), entry_price)
        horizon_compatibility = assess_horizon_compatibility(
            opportunity,
            horizon_profile,
        )
        same_sector_symbols = sorted(
            position["symbol"]
            for position in positions
            if (position.get("sector") or "UNKNOWN") == sector
        )
        adjusted_quantity = calculate_adjusted_quantity(
            order,
            portfolio_value,
            current_exposure,
            current_sector_exposure,
        )
        signal = str(opportunity.get("signal") or "").upper()

        score = 100
        explanation_parts = []

        if signal and signal != "BUY":
            score = min(score, 50)
            explanation_parts.append("Latest scanner signal is not BUY, so new entry should wait.")

        if not get_regime_allows_trade(order, market_regime):
            score -= 35
            explanation_parts.append("Market regime does not allow new BUY exposure.")

        total_exposure_pct = new_exposure / portfolio_value if portfolio_value else 1
        sector_exposure_pct = new_sector_exposure / portfolio_value if portfolio_value else 1
        position_exposure_pct = order_notional / portfolio_value if portfolio_value else 1

        if total_exposure_pct > DEFAULT_MAX_TOTAL_EXPOSURE_PCT:
            score -= 25
            explanation_parts.append("Total portfolio exposure would exceed the limit.")

        if sector_exposure_pct > DEFAULT_MAX_SECTOR_EXPOSURE_PCT:
            score -= 20
            explanation_parts.append("Sector concentration would be elevated.")

        if position_exposure_pct > DEFAULT_MAX_POSITION_EXPOSURE_PCT:
            score -= 15
            explanation_parts.append("Single-position exposure is above target.")

        if risk_budget_usage > 1:
            score -= min(25, (risk_budget_usage - 1) * 15)
            explanation_parts.append("Stop-loss risk uses more than the target budget.")

        if averaging["mode"] == "AVERAGING_DOWN":
            score -= 10
            explanation_parts.append("Trade would average down an existing position.")

        if not horizon_compatibility["compatible"]:
            score -= 15
            explanation_parts.append("Opportunity horizon does not match active horizon.")

        if safety_result and safety_result.get("violations"):
            score -= 30
            explanation_parts.append("Safety manager reported active violations.")

        score = round(max(0, min(100, score)), 2)

        if score < 35 or adjusted_quantity <= 0:
            recommendation = "REJECT"
        elif score < 55:
            recommendation = "WAIT"
        elif adjusted_quantity < requested_quantity:
            recommendation = "REDUCE_SIZE"
        else:
            recommendation = "EXECUTE"

        if not explanation_parts:
            explanation_parts.append("Portfolio exposure, sector risk, and horizon fit look acceptable.")

        return {
            "portfolio_fit_score": score,
            "recommendation": recommendation,
            "explanation": " ".join(explanation_parts),
            "adjusted_quantity": adjusted_quantity,
            "requested_quantity": requested_quantity,
            "portfolio_value": round(portfolio_value, 2),
            "current_portfolio_exposure": {
                "notional": round(current_exposure, 2),
                "pct": pct(current_exposure, portfolio_value),
            },
            "new_exposure_after_trade": {
                "notional": round(new_exposure, 2),
                "pct": pct(new_exposure, portfolio_value),
            },
            "sector_concentration": {
                "sector": sector,
                "current_notional": round(current_sector_exposure, 2),
                "current_pct": pct(current_sector_exposure, portfolio_value),
                "new_notional": round(new_sector_exposure, 2),
                "new_pct": pct(new_sector_exposure, portfolio_value),
            },
            "correlation_placeholder": {
                "method": "SECTOR_PROXY",
                "same_sector_symbols": same_sector_symbols,
                "estimated_related_exposure_pct": pct(
                    new_sector_exposure,
                    portfolio_value,
                ),
            },
            "risk_budget_usage": {
                "budget_amount": round(risk_budget_amount, 2),
                "used_amount": stop_risk["risk_amount"],
                "usage_pct": round(risk_budget_usage, 4),
            },
            "averaging": averaging,
            "stop_loss_risk": stop_risk,
            "horizon_compatibility": horizon_compatibility,
        }
    except Exception as error:
        return {
            "portfolio_fit_score": 0,
            "recommendation": "REJECT",
            "explanation": f"Position-aware evaluation failed closed: {error}",
            "adjusted_quantity": 0,
            "error": str(error),
        }
