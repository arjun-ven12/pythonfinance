import json
import os
import argparse
from collections import defaultdict
from datetime import datetime, timedelta


DEFAULT_ACCOUNT_VALUE = 100000
DEFAULT_MAX_DAILY_LOSS_PCT = 0.03
DEFAULT_MAX_WEEKLY_DRAWDOWN_PCT = 0.06
DEFAULT_MAX_WEEKLY_LOSS_PCT = 0.06
DEFAULT_MAX_POSITION_SIZE_PCT = 0.10
DEFAULT_MAX_TOTAL_PORTFOLIO_EXPOSURE_PCT = 0.80
DEFAULT_MAX_SECTOR_EXPOSURE_PCT = 0.30
DEFAULT_MAX_CORRELATED_EXPOSURE_PCT = 0.40
DEFAULT_CORRELATION_THRESHOLD = 0.75

SECTOR_FALLBACKS = {
    "AAPL": "Technology",
    "APP": "Technology",
    "GOOG": "Communication Services",
    "GOOGL": "Communication Services",
    "META": "Communication Services",
    "MSFT": "Technology",
    "NVDA": "Technology",
    "AMZN": "Consumer Discretionary",
    "TSLA": "Consumer Discretionary",
    "CAT": "Industrials",
    "JPM": "Financials",
    "BAC": "Financials",
    "XOM": "Energy",
    "CVX": "Energy",
    "UNH": "Health Care",
    "JNJ": "Health Care",
}


def parse_float(value, fallback):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback

    return parsed if parsed >= 0 else fallback


def parse_bool(value, fallback=False):
    if value is None:
        return fallback

    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def get_config(safety_status=None):
    status_limits = (safety_status or {}).get("limits", {})

    return {
        "account_value": parse_float(
            os.getenv("SAFETY_ACCOUNT_VALUE") or os.getenv("PAPER_ACCOUNT_VALUE"),
            DEFAULT_ACCOUNT_VALUE,
        ),
        "max_daily_loss_pct": parse_float(
            status_limits.get("max_daily_loss_pct") or os.getenv("MAX_DAILY_LOSS_PCT"),
            DEFAULT_MAX_DAILY_LOSS_PCT,
        ),
        "max_weekly_drawdown_pct": parse_float(
            status_limits.get("max_weekly_drawdown_pct")
            or os.getenv("MAX_WEEKLY_DRAWDOWN_PCT"),
            DEFAULT_MAX_WEEKLY_DRAWDOWN_PCT,
        ),
        "max_weekly_loss_pct": parse_float(
            status_limits.get("max_weekly_loss_pct") or os.getenv("MAX_WEEKLY_LOSS_PCT"),
            DEFAULT_MAX_WEEKLY_LOSS_PCT,
        ),
        "max_position_size_pct": parse_float(
            status_limits.get("max_position_size_pct")
            or os.getenv("MAX_POSITION_SIZE_PCT"),
            DEFAULT_MAX_POSITION_SIZE_PCT,
        ),
        "max_total_portfolio_exposure_pct": parse_float(
            status_limits.get("max_total_portfolio_exposure_pct")
            or os.getenv("MAX_TOTAL_PORTFOLIO_EXPOSURE_PCT"),
            DEFAULT_MAX_TOTAL_PORTFOLIO_EXPOSURE_PCT,
        ),
        "max_sector_exposure_pct": parse_float(
            status_limits.get("max_sector_exposure_pct")
            or os.getenv("MAX_SECTOR_EXPOSURE_PCT"),
            DEFAULT_MAX_SECTOR_EXPOSURE_PCT,
        ),
        "max_correlated_exposure_pct": parse_float(
            status_limits.get("max_correlated_exposure_pct")
            or os.getenv("MAX_CORRELATED_EXPOSURE_PCT"),
            DEFAULT_MAX_CORRELATED_EXPOSURE_PCT,
        ),
        "correlation_threshold": parse_float(
            status_limits.get("correlation_threshold")
            or os.getenv("CORRELATION_THRESHOLD"),
            DEFAULT_CORRELATION_THRESHOLD,
        ),
        "emergency_kill_switch": bool(
            (safety_status or {}).get("emergency_kill_switch")
            or (safety_status or {}).get("kill_switch_active")
            or parse_bool(os.getenv("SAFETY_KILL_SWITCH"))
        ),
    }


def get_equity_history(portfolio_state):
    return portfolio_state.get("equity_history", [])


def parse_timestamp(value):
    if not value:
        return None

    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(
            tzinfo=None
        )
    except ValueError:
        return None


def get_latest_equity(equity_history, account_value):
    if not equity_history:
        return account_value

    return float(equity_history[-1].get("equity", account_value))


def get_portfolio_value(portfolio_state, fallback):
    for key in (
        "portfolio_value",
        "account_value",
        "equity",
        "total_equity",
        "net_liquidation",
    ):
        value = portfolio_state.get(key)
        if value is not None:
            return max(0, float(value))

    cash = float(portfolio_state.get("cash", 0) or 0)
    positions = portfolio_state.get("positions", [])
    positions_value = sum(get_position_notional(position) for position in positions)

    if cash or positions_value:
        return max(0, cash + positions_value)

    return fallback


def get_period_start_equity(equity_history, since, fallback):
    eligible = [
        point
        for point in equity_history
        if parse_timestamp(point.get("timestamp") or point.get("date"))
        and parse_timestamp(point.get("timestamp") or point.get("date")) >= since
    ]

    if not eligible:
        return fallback

    return float(eligible[0].get("equity", fallback))


def calculate_daily_loss_pct(equity_history, account_value):
    latest_equity = get_latest_equity(equity_history, account_value)
    start_equity = get_period_start_equity(
        equity_history,
        datetime.now() - timedelta(days=1),
        latest_equity,
    )

    if start_equity <= 0:
        return 0

    return max(0, (start_equity - latest_equity) / start_equity)


def calculate_weekly_drawdown_pct(equity_history, account_value):
    latest_equity = get_latest_equity(equity_history, account_value)
    week_points = [
        point
        for point in equity_history
        if parse_timestamp(point.get("timestamp") or point.get("date"))
        and parse_timestamp(point.get("timestamp") or point.get("date"))
        >= datetime.now() - timedelta(days=7)
    ]

    if not week_points:
        return 0

    peak_equity = max(float(point.get("equity", account_value)) for point in week_points)

    if peak_equity <= 0:
        return 0

    return max(0, (peak_equity - latest_equity) / peak_equity)


def get_symbol(order):
    return str(order.get("symbol", "")).upper()


def get_order_notional(order):
    return get_order_price(order) * get_order_quantity(order)


def get_order_price(order):
    for key in ("entry_price", "limit_price", "price", "last_price", "close"):
        value = order.get(key)
        if value is not None:
            return max(0, float(value))

    return 0


def get_order_quantity(order):
    return max(0, float(order.get("quantity", 0) or 0))


def get_position_notional(position):
    if position.get("notional") is not None:
        return max(0, float(position.get("notional") or 0))

    if position.get("market_value") is not None:
        return max(0, float(position.get("market_value") or 0))

    quantity = float(position.get("quantity", 0) or 0)
    price = float(
        position.get("last_price")
        or position.get("avg_price")
        or position.get("entry_price")
        or position.get("price")
        or 0
    )
    return max(0, quantity * price)


def get_sector(order):
    symbol = get_symbol(order)
    return order.get("sector") or SECTOR_FALLBACKS.get(symbol, "UNKNOWN")


def get_position_sector(position):
    symbol = str(position.get("symbol", "")).upper()
    return position.get("sector") or SECTOR_FALLBACKS.get(symbol, "UNKNOWN")


def get_order_side(order):
    return str(order.get("side") or order.get("action") or "BUY").upper()


def calculate_loss_pct(realized_pl, portfolio_value):
    if portfolio_value <= 0:
        return 1

    try:
        realized = float(realized_pl or 0)
    except (TypeError, ValueError):
        return 1

    return max(0, -realized / portfolio_value)


def calculate_total_exposure_pct(open_positions, proposed_notional, portfolio_value):
    if portfolio_value <= 0:
        return 1

    current_exposure = sum(get_position_notional(position) for position in open_positions)
    return (current_exposure + proposed_notional) / portfolio_value


def calculate_sector_exposure_pct(open_positions, proposed_order, portfolio_value):
    if portfolio_value <= 0:
        return 1

    sector = get_sector(proposed_order)
    sector_exposure = sum(
        get_position_notional(position)
        for position in open_positions
        if get_position_sector(position) == sector
    )
    return (sector_exposure + get_order_notional(proposed_order)) / portfolio_value


def is_status_kill_switch_active(safety_status=None):
    status = safety_status or {}
    return bool(
        status.get("emergency_kill_switch")
        or status.get("kill_switch_active")
        or status.get("kill_switch")
    )


def get_weekly_realized_pl(portfolio_state):
    for key in ("weekly_realized_pl", "weekly_pl", "realized_pl_week"):
        if portfolio_state.get(key) is not None:
            return portfolio_state.get(key)

    return 0


def calculate_adjusted_quantity(
    proposed_order,
    portfolio_value,
    current_total_exposure,
    current_sector_exposure,
    config,
):
    original_quantity = get_order_quantity(proposed_order)
    price = get_order_price(proposed_order)

    if original_quantity <= 0 or price <= 0 or portfolio_value <= 0:
        return 0

    max_position_notional = portfolio_value * config["max_position_size_pct"]
    remaining_total_notional = max(
        0,
        (portfolio_value * config["max_total_portfolio_exposure_pct"])
        - current_total_exposure,
    )
    remaining_sector_notional = max(
        0,
        (portfolio_value * config["max_sector_exposure_pct"]) - current_sector_exposure,
    )
    max_allowed_notional = min(
        max_position_notional,
        remaining_total_notional,
        remaining_sector_notional,
    )
    max_allowed_quantity = int(max_allowed_notional // price)

    return max(0, min(int(original_quantity), max_allowed_quantity))


def classify_risk_level(allow_trade, violations, adjusted_quantity, original_quantity):
    if not allow_trade or violations:
        return "HIGH"

    if adjusted_quantity < original_quantity:
        return "MEDIUM"

    return "LOW"


def evaluate_trade_safety(
    proposed_order,
    current_portfolio_state=None,
    daily_realized_pl=0,
    current_open_positions=None,
    market_regime=None,
    safety_status=None,
):
    try:
        if safety_status is None:
            raise ValueError("Prisma-derived safety status is required.")

        config = get_config(safety_status)
        portfolio_state = current_portfolio_state or {}
        open_positions = current_open_positions or portfolio_state.get("positions", [])
        regime = market_regime or {}
        portfolio_value = get_portfolio_value(portfolio_state, config["account_value"])
        original_quantity = get_order_quantity(proposed_order)
        proposed_notional = get_order_notional(proposed_order)
        current_total_exposure = sum(
            get_position_notional(position) for position in open_positions
        )
        current_sector_exposure = sum(
            get_position_notional(position)
            for position in open_positions
            if get_position_sector(position) == get_sector(proposed_order)
        )
        total_exposure_pct = calculate_total_exposure_pct(
            open_positions,
            proposed_notional,
            portfolio_value,
        )
        sector_exposure_pct = calculate_sector_exposure_pct(
            open_positions,
            proposed_order,
            portfolio_value,
        )
        position_size_pct = proposed_notional / portfolio_value if portfolio_value else 1
        daily_loss_pct = calculate_loss_pct(daily_realized_pl, portfolio_value)
        weekly_loss_pct = calculate_loss_pct(
            get_weekly_realized_pl(portfolio_state),
            portfolio_value,
        )
        adjusted_quantity = int(original_quantity)
        violations = []

        if is_status_kill_switch_active(safety_status):
            violations.append("Emergency kill switch is active.")

        if daily_loss_pct >= config["max_daily_loss_pct"]:
            violations.append("Max daily loss percentage exceeded.")

        if weekly_loss_pct >= config["max_weekly_loss_pct"]:
            violations.append("Max weekly loss percentage exceeded.")

        if get_order_side(proposed_order) == "BUY" and not regime.get(
            "allow_new_buys",
            True,
        ):
            violations.append("Market regime disallows new buys.")

        if (
            position_size_pct > config["max_position_size_pct"]
            or total_exposure_pct > config["max_total_portfolio_exposure_pct"]
            or sector_exposure_pct > config["max_sector_exposure_pct"]
        ):
            adjusted_quantity = calculate_adjusted_quantity(
                proposed_order,
                portfolio_value,
                current_total_exposure,
                current_sector_exposure,
                config,
            )

            if adjusted_quantity <= 0:
                violations.append("Order exceeds position or portfolio exposure limits.")

        allow_trade = not violations and adjusted_quantity > 0
        risk_level = classify_risk_level(
            allow_trade,
            violations,
            adjusted_quantity,
            int(original_quantity),
        )
        try:
            from position_aware_scanner import evaluate_portfolio_fit

            position_aware = evaluate_portfolio_fit(
                opportunity={
                    "symbol": get_symbol(proposed_order),
                    "signal": "BUY" if get_order_side(proposed_order) == "BUY" else "SELL",
                    "close": get_order_price(proposed_order),
                    "sector": get_sector(proposed_order),
                },
                portfolio_state=portfolio_state,
                proposed_order=proposed_order,
                market_regime=regime,
                safety_result={
                    "violations": violations,
                    "adjusted_quantity": adjusted_quantity,
                },
            )
        except Exception as error:
            position_aware = {
                "portfolio_fit_score": 0,
                "recommendation": "REJECT",
                "explanation": f"Position-aware context unavailable: {error}",
                "adjusted_quantity": 0,
            }

        status = {
            "generated_at": datetime.now().isoformat(),
            "allow_trade": allow_trade,
            "risk_level": risk_level,
            "violations": violations,
            "adjusted_quantity": adjusted_quantity,
            "emergency_kill_switch": is_status_kill_switch_active(safety_status),
            "inputs": {
                "symbol": get_symbol(proposed_order),
                "side": get_order_side(proposed_order),
                "requested_quantity": original_quantity,
                "portfolio_value": round(portfolio_value, 2),
                "daily_realized_pl": daily_realized_pl,
                "weekly_realized_pl": get_weekly_realized_pl(portfolio_state),
                "market_regime": regime.get("regime") or regime.get("regime_name"),
            },
            "checks": {
                "daily_loss_pct": round(daily_loss_pct, 4),
                "weekly_loss_pct": round(weekly_loss_pct, 4),
                "position_size_pct": round(position_size_pct, 4),
                "total_portfolio_exposure_pct": round(total_exposure_pct, 4),
                "sector_exposure_pct": round(sector_exposure_pct, 4),
                "sector": get_sector(proposed_order),
            },
            "position_aware": position_aware,
            "limits": {
                "max_daily_loss_pct": config["max_daily_loss_pct"],
                "max_weekly_loss_pct": config["max_weekly_loss_pct"],
                "max_position_size_pct": config["max_position_size_pct"],
                "max_total_portfolio_exposure_pct": config[
                    "max_total_portfolio_exposure_pct"
                ],
                "max_sector_exposure_pct": config["max_sector_exposure_pct"],
            },
        }

        return status
    except Exception as error:
        return {
            "generated_at": datetime.now().isoformat(),
            "allow_trade": False,
            "risk_level": "HIGH",
            "violations": [f"Safety evaluation failed closed: {error}"],
            "adjusted_quantity": 0,
        }


def load_open_positions(portfolio_state):
    raw_positions = portfolio_state.get("positions", {})
    iterable = raw_positions.values() if isinstance(raw_positions, dict) else raw_positions
    return [
        {
            **position,
            "symbol": str(position.get("symbol", "")).upper(),
            "sector": get_position_sector(position),
            "notional": get_position_notional(position),
        }
        for position in (iterable or [])
    ]


def build_sector_exposures(orders, open_positions, account_value):
    exposures = defaultdict(float)

    for position in open_positions:
        exposures[position["sector"]] += position["notional"]

    for order in orders:
        exposures[get_sector(order)] += get_order_notional(order)

    return {
        sector: {
            "notional": round(notional, 2),
            "pct": round(notional / account_value, 4) if account_value else 0,
        }
        for sector, notional in exposures.items()
    }


def calculate_return_correlation(symbols):
    if len(symbols) < 2:
        return {}

    try:
        import yfinance as yf

        price_data = yf.download(
            tickers=symbols,
            period="6mo",
            interval="1d",
            progress=False,
            auto_adjust=True,
        )["Close"]
        returns = price_data.pct_change().dropna()
        return returns.corr().to_dict()
    except Exception:
        return {}


def get_correlated_groups(orders, correlation_threshold):
    symbols = [get_symbol(order) for order in orders]
    correlation_matrix = calculate_return_correlation(symbols)

    if not correlation_matrix:
        groups = defaultdict(list)

        for order in orders:
            groups[get_sector(order)].append(get_symbol(order))

        return [
            {
                "group": sector,
                "symbols": sorted(group_symbols),
                "method": "sector_fallback",
            }
            for sector, group_symbols in groups.items()
            if len(group_symbols) > 1
        ]

    correlated = []

    for symbol in symbols:
        peers = [
            peer
            for peer, value in correlation_matrix.get(symbol, {}).items()
            if peer != symbol and abs(float(value)) >= correlation_threshold
        ]

        if peers:
            correlated.append(
                {
                    "group": symbol,
                    "symbols": sorted(set([symbol, *peers])),
                    "method": "return_correlation",
                }
            )

    unique_groups = {}

    for group in correlated:
        key = tuple(group["symbols"])
        unique_groups[key] = group

    return list(unique_groups.values())


def build_correlated_exposures(orders, account_value, correlation_threshold):
    order_by_symbol = {get_symbol(order): order for order in orders}
    groups = get_correlated_groups(orders, correlation_threshold)
    exposures = []

    for group in groups:
        notional = sum(
            get_order_notional(order_by_symbol[symbol])
            for symbol in group["symbols"]
            if symbol in order_by_symbol
        )
        exposures.append(
            {
                **group,
                "notional": round(notional, 2),
                "pct": round(notional / account_value, 4) if account_value else 0,
            }
        )

    return exposures


def is_kill_switch_active(config, safety_status=None):
    status = safety_status or {}
    return config["emergency_kill_switch"] or bool(
        status.get("emergency_kill_switch")
        or status.get("kill_switch_active")
        or status.get("kill_switch")
    )


def evaluate_safety(proposed_orders_data, portfolio_state, safety_status):
    config = get_config(safety_status)
    equity_history = get_equity_history(portfolio_state)
    orders = proposed_orders_data.get("orders", [])
    open_positions = load_open_positions(portfolio_state)
    account_value = config["account_value"]

    daily_loss_pct = calculate_daily_loss_pct(equity_history, account_value)
    weekly_drawdown_pct = calculate_weekly_drawdown_pct(equity_history, account_value)
    sector_exposures = build_sector_exposures(orders, open_positions, account_value)
    correlated_exposures = build_correlated_exposures(
        orders,
        account_value,
        config["correlation_threshold"],
    )
    kill_switch_active = is_kill_switch_active(config, safety_status)

    global_violations = []

    if kill_switch_active:
        global_violations.append("Emergency kill switch is active.")

    if daily_loss_pct > config["max_daily_loss_pct"]:
        global_violations.append("Max daily loss limit exceeded.")

    if weekly_drawdown_pct > config["max_weekly_drawdown_pct"]:
        global_violations.append("Max weekly drawdown limit exceeded.")

    for sector, exposure in sector_exposures.items():
        if exposure["pct"] > config["max_sector_exposure_pct"]:
            global_violations.append(f"Sector concentration limit exceeded: {sector}.")

    for exposure in correlated_exposures:
        if exposure["pct"] > config["max_correlated_exposure_pct"]:
            symbols = ", ".join(exposure["symbols"])
            global_violations.append(f"Correlated exposure limit exceeded: {symbols}.")

    order_decisions = []

    for order in orders:
        notional = get_order_notional(order)
        position_pct = notional / account_value if account_value else 0
        order_violations = []

        if position_pct > config["max_position_size_pct"]:
            order_violations.append("Max position size exceeded.")

        order_decisions.append(
            {
                "symbol": get_symbol(order),
                "allow_trade": not global_violations and not order_violations,
                "position_notional": round(notional, 2),
                "position_size_pct": round(position_pct, 4),
                "sector": get_sector(order),
                "violations": order_violations,
            }
        )

    status = {
        "generated_at": datetime.now().isoformat(),
        "allow_new_trades": not global_violations
        and all(not decision["violations"] for decision in order_decisions),
        "kill_switch_active": kill_switch_active,
        "violations": global_violations,
        "limits": {
            "max_daily_loss_pct": config["max_daily_loss_pct"],
            "max_weekly_loss_pct": config["max_weekly_loss_pct"],
            "max_weekly_drawdown_pct": config["max_weekly_drawdown_pct"],
            "max_position_size_pct": config["max_position_size_pct"],
            "max_total_portfolio_exposure_pct": config[
                "max_total_portfolio_exposure_pct"
            ],
            "max_sector_exposure_pct": config["max_sector_exposure_pct"],
            "max_correlated_exposure_pct": config["max_correlated_exposure_pct"],
            "correlation_threshold": config["correlation_threshold"],
        },
        "checks": {
            "daily_loss_pct": round(daily_loss_pct, 4),
            "weekly_drawdown_pct": round(weekly_drawdown_pct, 4),
            "sector_exposures": sector_exposures,
            "correlated_exposures": correlated_exposures,
        },
        "order_decisions": order_decisions,
        "source": "PRISMA_CONTEXT",
    }

    return status


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate Prisma-derived trading safety.")
    parser.add_argument("--context-json", required=True)
    args = parser.parse_args()
    context = json.loads(args.context_json)
    print(
        json.dumps(
            evaluate_safety(
                context.get("proposed_orders") or {"orders": []},
                context.get("portfolio_state") or {},
                context.get("safety_status") or {},
            )
        )
    )
