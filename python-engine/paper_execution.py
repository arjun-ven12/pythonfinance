import json
import os
import argparse
import math
from datetime import datetime

from execution_manager import (
    evaluate_execution_route,
    summarize_execution_routes,
)
from json_utils import dump_json_strict, sanitize_json_value
from risk import calculate_position_size, calculate_stop_loss_take_profit
from runtime_state import get_runtime_path, require_user_id
from runtime.runtime_writer import write_runtime


DEFAULT_ACCOUNT_VALUE = 100000
DEFAULT_RISK_PER_TRADE = 0.01
DEFAULT_SLIPPAGE_BPS = 5
DEFAULT_FEE_PER_SHARE = 0.005
DEFAULT_MIN_FEE = 1
MIN_SCORE = 60


def parse_float(value, fallback):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback

    return parsed if math.isfinite(parsed) and parsed > 0 else fallback


def get_account_value():
    return parse_float(os.getenv("PAPER_ACCOUNT_VALUE"), DEFAULT_ACCOUNT_VALUE)


def get_risk_per_trade():
    return parse_float(os.getenv("PAPER_RISK_PER_TRADE"), DEFAULT_RISK_PER_TRADE)


def get_slippage_bps():
    return parse_float(os.getenv("PAPER_SLIPPAGE_BPS"), DEFAULT_SLIPPAGE_BPS)


def get_fee_per_share():
    return parse_float(os.getenv("PAPER_FEE_PER_SHARE"), DEFAULT_FEE_PER_SHARE)


def get_min_fee():
    return parse_float(os.getenv("PAPER_MIN_FEE"), DEFAULT_MIN_FEE)


def get_entry_and_atr(opportunity):
    symbol = opportunity["symbol"]

    try:
        from indicators import add_indicators
        from market_data import get_historical_data

        df = get_historical_data(symbol, period="3mo")
        df = add_indicators(df)
        latest = df.iloc[-1]
        entry_price = float(latest["close"])
        atr = float(latest["atr_14"])

        if not math.isfinite(entry_price) or entry_price <= 0:
            raise ValueError("Latest close is unavailable.")

        if not math.isfinite(atr) or atr <= 0:
            atr = entry_price * 0.03

        return entry_price, atr
    except Exception:
        entry_price = parse_float(opportunity.get("close"), 0)
        estimated_atr = entry_price * 0.03
        return entry_price, estimated_atr


def build_proposed_order(
    opportunity,
    account_value,
    risk_per_trade,
    market_regime=None,
    execution_settings=None,
):
    entry_price, atr = get_entry_and_atr(opportunity)
    stop_loss, take_profit = calculate_stop_loss_take_profit(entry_price, atr)

    if stop_loss is None or take_profit is None:
        return None

    quantity = calculate_position_size(
        account_value=account_value,
        risk_per_trade=risk_per_trade,
        entry_price=entry_price,
        stop_loss=stop_loss,
    )
    risk_amount = account_value * risk_per_trade

    order = {
        "symbol": opportunity["symbol"],
        "display_symbol": opportunity.get("display_symbol", opportunity["symbol"]),
        "yahoo_symbol": opportunity.get("yahoo_symbol", opportunity["symbol"]),
        "company_name": opportunity.get("company_name"),
        "market": opportunity.get("market"),
        "exchange": opportunity.get("exchange"),
        "currency": opportunity.get("currency"),
        "country": opportunity.get("country"),
        "is_sgx": bool(opportunity.get("is_sgx")),
        "side": "BUY",
        "strategy_name": opportunity.get("strategy_name", "EMA/RSI Trend Momentum"),
        "strategy_source": opportunity.get("strategy_source", "python-engine/strategy.py"),
        "entry_price": round(entry_price, 2),
        "stop_loss": round(stop_loss, 2),
        "take_profit": round(take_profit, 2),
        "risk_amount": round(risk_amount, 2),
        "quantity": quantity,
        "confidence": opportunity.get("confidence"),
        "opportunity_score": opportunity.get("opportunity_score"),
        "risk_level": (opportunity.get("openai_news_reasoning") or {}).get("risk_level"),
        "recommendation": "PENDING_APPROVAL",
        "high_risk_flag": bool(opportunity.get("high_risk_flag")),
        "risk_universe": opportunity.get("risk_universe"),
        "liquidity_risk": opportunity.get("liquidity_risk"),
        "volatility_risk": opportunity.get("volatility_risk"),
        "market_cap": opportunity.get("market_cap"),
        "average_volume": opportunity.get("average_volume"),
        "high_risk_warnings": opportunity.get("high_risk_warnings", []),
        "news_events": (opportunity.get("news_filter") or {}).get("events", []),
        "openai_reasoning": opportunity.get("openai_news_reasoning") or {},
        "safety_violations": [],
        "reason": "; ".join(opportunity.get("reasons", [])),
        "suggestion_basis": {
            "rule": "BUY signal and opportunity_score >= 60",
            "signal": opportunity.get("signal"),
            "opportunity_score": opportunity.get("opportunity_score"),
            "confidence": opportunity.get("confidence"),
            "backtest_return": opportunity.get("backtest_return"),
            "win_rate": opportunity.get("win_rate"),
            "drawdown": opportunity.get("drawdown"),
            "portfolio_recommendation": opportunity.get("portfolio_recommendation"),
            "high_risk_flag": opportunity.get("high_risk_flag"),
            "risk_universe": opportunity.get("risk_universe"),
        },
    }
    order["execution_route"] = evaluate_execution_route(
        order,
        opportunity,
        market_regime or {},
        settings=execution_settings,
    )
    return order


def get_high_score_buys(opportunities, min_score=MIN_SCORE):
    return [
        opportunity
        for opportunity in opportunities
        if opportunity.get("signal") == "BUY"
        and float(opportunity.get("opportunity_score", 0)) >= min_score
    ]


def save_proposed_orders(orders, filename=None, execution_settings=None, user_id=None):
    route_summary = summarize_execution_routes(orders, settings=execution_settings)
    data = sanitize_json_value({
        "generated_at": datetime.now().isoformat(),
        "mode": route_summary["execution_mode"],
        "execution_status": route_summary,
        "automation_status": route_summary,
        "orders": orders,
    })

    if user_id:
        path = write_runtime(user_id, "proposed_orders", data)
        if path:
            print(f"Debug proposed orders mirrored to {path}")
    elif filename:
        with open(filename, "w") as file:
            dump_json_strict(data, file, indent=4)
        print(f"Exported {len(orders)} proposed paper orders to {filename}")

    return data


def get_default_portfolio():
    account_value = get_account_value()
    timestamp = datetime.now().isoformat()

    return {
        "generated_at": timestamp,
        "cash": account_value,
        "starting_cash": account_value,
        "positions": {},
        "realized_pnl": 0,
        "fees_paid": 0,
        "equity": account_value,
        "equity_history": [
            {
                "timestamp": timestamp,
                "equity": account_value,
            }
        ],
    }


def calculate_equity(portfolio):
    position_value = sum(
        float(position.get("quantity", 0)) * float(position.get("last_price", 0))
        for position in portfolio.get("positions", {}).values()
    )

    return float(portfolio.get("cash", 0)) + position_value


def normalize_order(order):
    side = str(order.get("side", "BUY")).upper()
    order_type = str(order.get("order_type") or order.get("orderType") or "MARKET").upper()
    symbol = str(order.get("symbol", "")).upper()
    quantity = int(float(order.get("quantity", 0)))
    entry_price = parse_float(order.get("entry_price") or order.get("entryPrice"), 0)
    limit_price = parse_float(order.get("limit_price") or order.get("limitPrice"), 0)
    current_price = parse_float(order.get("current_price") or order.get("currentPrice"), 0)

    if not symbol:
        raise ValueError("Symbol is required.")

    if side not in {"BUY", "SELL"}:
        raise ValueError("Side must be BUY or SELL.")

    if order_type not in {"MARKET", "LIMIT"}:
        raise ValueError("Order type must be MARKET or LIMIT.")

    if quantity <= 0:
        raise ValueError("Quantity must be greater than 0.")

    reference_price = current_price or entry_price or limit_price

    if reference_price <= 0:
        raise ValueError("A positive price is required.")

    if order_type == "LIMIT" and limit_price <= 0:
        limit_price = reference_price

    return {
        **order,
        "symbol": symbol,
        "side": side,
        "order_type": order_type,
        "quantity": quantity,
        "entry_price": entry_price or reference_price,
        "limit_price": limit_price,
        "current_price": reference_price,
    }


def get_fill_price(order):
    reference_price = float(order["current_price"])
    slippage = get_slippage_bps() / 10000

    if order["side"] == "BUY":
        adjusted_price = reference_price * (1 + slippage)

        if order["order_type"] == "LIMIT":
            limit_price = float(order["limit_price"])

            if reference_price > limit_price:
                return None

            return min(adjusted_price, limit_price)

        return adjusted_price

    adjusted_price = reference_price * (1 - slippage)

    if order["order_type"] == "LIMIT":
        limit_price = float(order["limit_price"])

        if reference_price < limit_price:
            return None

        return max(adjusted_price, limit_price)

    return adjusted_price


def calculate_fee(quantity):
    return max(get_min_fee(), quantity * get_fee_per_share())


def apply_buy(portfolio, order, fill_price, fee):
    total_cost = (fill_price * order["quantity"]) + fee

    if total_cost > float(portfolio.get("cash", 0)):
        raise ValueError("Insufficient paper cash for order.")

    positions = portfolio.setdefault("positions", {})
    position = positions.get(
        order["symbol"],
        {
            "symbol": order["symbol"],
            "quantity": 0,
            "avg_price": 0,
            "last_price": fill_price,
        },
    )
    old_quantity = float(position["quantity"])
    new_quantity = old_quantity + order["quantity"]
    old_cost = old_quantity * float(position["avg_price"])
    new_cost = old_cost + (fill_price * order["quantity"])
    position["quantity"] = new_quantity
    position["avg_price"] = round(new_cost / new_quantity, 4)
    position["last_price"] = round(fill_price, 4)
    positions[order["symbol"]] = position
    portfolio["cash"] = round(float(portfolio["cash"]) - total_cost, 2)


def apply_sell(portfolio, order, fill_price, fee):
    positions = portfolio.setdefault("positions", {})
    position = positions.get(order["symbol"])

    if not position or float(position.get("quantity", 0)) < order["quantity"]:
        raise ValueError("Cannot sell more paper shares than currently held.")

    proceeds = (fill_price * order["quantity"]) - fee
    realized_pnl = (fill_price - float(position["avg_price"])) * order["quantity"] - fee
    position["quantity"] = float(position["quantity"]) - order["quantity"]
    position["last_price"] = round(fill_price, 4)
    portfolio["cash"] = round(float(portfolio["cash"]) + proceeds, 2)
    portfolio["realized_pnl"] = round(float(portfolio.get("realized_pnl", 0)) + realized_pnl, 2)

    if position["quantity"] <= 0:
        positions.pop(order["symbol"], None)
    else:
        positions[order["symbol"]] = position


def build_trade(order, fill_price, fee):
    filled_at = datetime.now().isoformat()

    return {
        "id": f"{filled_at}-{order['symbol']}",
        "symbol": order["symbol"],
        "side": order["side"],
        "order_type": order["order_type"],
        "quantity": order["quantity"],
        "requested_price": round(float(order["current_price"]), 4),
        "limit_price": round(float(order["limit_price"]), 4) if order["limit_price"] else None,
        "fill_price": round(fill_price, 4),
        "slippage_bps": get_slippage_bps(),
        "fee": round(fee, 2),
        "status": "FILLED",
        "filled_at": filled_at,
        "source": order.get("source", "manual_paper_order"),
        "approval_request_id": order.get("approval_request_id"),
    }


def execute_paper_order(
    order,
    user_id,
    portfolio_state=None,
    paper_trades_state=None,
):
    require_user_id(user_id)
    normalized_order = normalize_order(order)
    approval_request_id = normalized_order.get("approval_request_id")
    portfolio = portfolio_state or get_default_portfolio()
    existing_trades = paper_trades_state or {"generated_at": None, "trades": []}

    if approval_request_id:
        existing_trade = next(
            (
                trade
                for trade in existing_trades.get("trades", [])
                if trade.get("approval_request_id") == approval_request_id
            ),
            None,
        )
        if existing_trade:
            return {
                "filled": True,
                "duplicate": True,
                "trade": existing_trade,
                "portfolio": portfolio,
                "trades": existing_trades,
            }

    fill_price = get_fill_price(normalized_order)

    if fill_price is None:
        return {
            "filled": False,
            "reason": "Limit order not marketable at current simulated price.",
            "order": normalized_order,
            "portfolio": portfolio,
            "trades": existing_trades,
        }

    fee = calculate_fee(normalized_order["quantity"])

    if normalized_order["side"] == "BUY":
        apply_buy(portfolio, normalized_order, fill_price, fee)
    else:
        apply_sell(portfolio, normalized_order, fill_price, fee)

    portfolio["fees_paid"] = round(float(portfolio.get("fees_paid", 0)) + fee, 2)
    portfolio["generated_at"] = datetime.now().isoformat()
    portfolio["equity"] = round(calculate_equity(portfolio), 2)
    portfolio.setdefault("equity_history", []).append(
        {
            "timestamp": portfolio["generated_at"],
            "equity": portfolio["equity"],
        }
    )
    trade = build_trade(normalized_order, fill_price, fee)
    trades = {**existing_trades}
    trades["trades"] = [*trades.get("trades", []), trade]
    trades["generated_at"] = datetime.now().isoformat()

    return {
        "filled": True,
        "trade": trade,
        "portfolio": portfolio,
        "trades": trades,
    }


def generate_proposed_orders_from_scan_results(
    user_id,
    scan_results,
    proposed_orders_file,
    execution_settings=None,
):
    require_user_id(user_id)
    opportunities = scan_results.get("opportunities", [])
    market_regime = scan_results.get("market_regime", {})
    execution_settings = execution_settings or {}
    account_value = get_account_value()
    risk_per_trade = get_risk_per_trade()
    orders = [
        order
        for opportunity in get_high_score_buys(opportunities)
        if (
            order := build_proposed_order(
            opportunity,
            account_value,
            risk_per_trade,
            market_regime=market_regime,
            execution_settings=execution_settings,
            )
        )
        and order.get("quantity", 0) > 0
    ]

    return save_proposed_orders(
        orders,
        proposed_orders_file,
        execution_settings=execution_settings,
        user_id=user_id,
    )


def parse_args():
    parser = argparse.ArgumentParser(description="Paper execution simulator.")
    parser.add_argument("--user-id", required=True)
    parser.add_argument(
        "--generate-proposals",
        action="store_true",
        help="Generate proposals from the authenticated user's latest scan.",
    )
    parser.add_argument(
        "--order-json",
        help="Execute one paper order from a JSON object.",
    )
    parser.add_argument("--portfolio-json")
    parser.add_argument("--paper-trades-json")
    parser.add_argument("--scan-json")
    parser.add_argument("--execution-settings", default="{}")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if args.order_json:
        result = execute_paper_order(
            json.loads(args.order_json),
            args.user_id,
            portfolio_state=json.loads(args.portfolio_json or "{}"),
            paper_trades_state=json.loads(args.paper_trades_json or '{"trades": []}'),
        )
        print(json.dumps(result, indent=4))
    else:
        if not args.scan_json:
            raise SystemExit("--scan-json is required when generating proposals.")

        generate_proposed_orders_from_scan_results(
            user_id=args.user_id,
            scan_results=json.loads(args.scan_json),
            proposed_orders_file=get_runtime_path(args.user_id, "proposed_orders"),
            execution_settings=json.loads(args.execution_settings or "{}"),
        )
