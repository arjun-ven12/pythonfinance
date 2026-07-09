import argparse
import asyncio
import contextlib
import json
import socket
import sys
from datetime import datetime, timezone


SUPPORTED_PYTHON_MIN = (3, 11)
SUPPORTED_PYTHON_MAX = (3, 12)


def get_runtime_version():
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def is_supported_python():
    current = (sys.version_info.major, sys.version_info.minor)
    return SUPPORTED_PYTHON_MIN <= current <= SUPPORTED_PYTHON_MAX


def result(success=False, action=None, **payload):
    return {
        "success": bool(success),
        "action": action,
        "python_version": get_runtime_version(),
        **payload,
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Run IBKR broker paper-account actions.")
    parser.add_argument("--action", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7497)
    parser.add_argument("--client-id", type=int, default=11)
    parser.add_argument("--mode", choices=["paper", "live"], default="paper")
    parser.add_argument("--symbol")
    parser.add_argument("--side", choices=["BUY", "SELL"])
    parser.add_argument("--order-type", choices=["MARKET", "LIMIT"], default="MARKET")
    parser.add_argument("--quantity", type=float)
    parser.add_argument("--limit-price", type=float)
    parser.add_argument("--client-order-id")
    parser.add_argument("--broker-order-id")
    parser.add_argument("--timeout", type=float, default=8)
    return parser.parse_args()


def socket_reachable(host, port, timeout):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def build_contract(symbol):
    normalized = str(symbol or "").strip().upper()
    if not normalized:
        raise ValueError("Symbol is required.")

    from ib_insync import Stock

    if normalized.endswith(".SI"):
        base_symbol = normalized[:-3]
        return Stock(base_symbol, "SGX", "SGD")

    return Stock(normalized, "SMART", "USD")


def infer_account_mode(managed_accounts, requested_mode, port):
    accounts = [str(account or "").strip().upper() for account in managed_accounts or [] if str(account or "").strip()]
    if any(account.startswith("DU") for account in accounts):
        return "paper"
    if any(account.startswith("U") for account in accounts):
        return "live"
    if requested_mode == "paper" and port == 7497:
        return "paper"
    if requested_mode == "live" and port == 7496:
        return "live"
    return "unknown"


def serialize_datetime(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if value is None:
        return None
    return str(value)


def account_summary_map(summary_rows):
    payload = {}
    for row in summary_rows or []:
        payload[row.tag] = row.value
    return payload


def order_payload(trade):
    order = getattr(trade, "order", None)
    order_status = getattr(trade, "orderStatus", None)
    contract = getattr(trade, "contract", None)
    return {
        "brokerOrderId": str(getattr(order, "orderId", "") or ""),
        "permId": getattr(order, "permId", None),
        "clientId": getattr(order, "clientId", None),
        "clientOrderId": getattr(order, "orderRef", None),
        "symbol": getattr(contract, "localSymbol", None)
        or getattr(contract, "symbol", None),
        "side": getattr(order, "action", None),
        "orderType": getattr(order, "orderType", None),
        "quantity": getattr(order, "totalQuantity", None),
        "limitPrice": getattr(order, "lmtPrice", None),
        "status": getattr(order_status, "status", None),
        "filled": getattr(order_status, "filled", None),
        "remaining": getattr(order_status, "remaining", None),
        "avgFillPrice": getattr(order_status, "avgFillPrice", None),
        "lastFillPrice": getattr(order_status, "lastFillPrice", None),
        "submittedAt": serialize_datetime(getattr(order_status, "completedTime", None)),
    }


def fill_payload(fill):
    execution = getattr(fill, "execution", None)
    contract = getattr(fill, "contract", None)
    commission_report = getattr(fill, "commissionReport", None)
    return {
        "executionId": getattr(execution, "execId", None),
        "brokerOrderId": str(getattr(execution, "orderId", "") or ""),
        "clientId": getattr(execution, "clientId", None),
        "symbol": getattr(contract, "localSymbol", None)
        or getattr(contract, "symbol", None),
        "side": getattr(execution, "side", None),
        "quantity": getattr(execution, "shares", None),
        "price": getattr(execution, "price", None),
        "commission": getattr(commission_report, "commission", None),
        "filledAt": serialize_datetime(getattr(execution, "time", None)),
        "account": getattr(execution, "acctNumber", None),
        "orderRef": getattr(execution, "orderRef", None),
    }


def load_ib():
    try:
        try:
            asyncio.get_event_loop()
        except RuntimeError:
            asyncio.set_event_loop(asyncio.new_event_loop())
        from ib_insync import IB, LimitOrder, MarketOrder

        return IB, MarketOrder, LimitOrder
    except Exception as import_error:
        raise RuntimeError(
            f"ib_insync is unavailable or failed to initialize: {import_error}"
        ) from import_error


def connect_ib(args, readonly=True):
    IB, MarketOrder, LimitOrder = load_ib()
    ib = IB()
    with contextlib.redirect_stdout(sys.stderr):
        ib.connect(
            args.host,
            args.port,
            clientId=args.client_id,
            timeout=args.timeout,
            readonly=readonly,
        )
    return ib, MarketOrder, LimitOrder


def ensure_paper_account(account_mode):
    if account_mode != "paper":
        raise RuntimeError(
            "IBKR account mode is not confirmed paper. Paper execution is blocked."
        )


def create_order(args, MarketOrder, LimitOrder):
    side = str(args.side or "").upper()
    quantity = float(args.quantity or 0)
    if side not in {"BUY", "SELL"} or quantity <= 0:
        raise ValueError("Valid side and quantity are required.")
    if args.order_type == "LIMIT":
        if args.limit_price is None:
            raise ValueError("Limit price is required for LIMIT orders.")
        order = LimitOrder(side, quantity, args.limit_price)
    else:
        order = MarketOrder(side, quantity)
    order.orderRef = args.client_order_id or None
    order.transmit = True
    return order


def fetch_account_snapshot(ib, args):
    with contextlib.redirect_stdout(sys.stderr):
        managed_accounts = ib.managedAccounts()
        summary_rows = ib.accountSummary()
        positions = ib.positions()
        open_trades = ib.reqAllOpenOrders()
        server_time = ib.reqCurrentTime()

    summary = account_summary_map(summary_rows)
    account_mode = infer_account_mode(managed_accounts, args.mode, args.port)
    cash = summary.get("TotalCashValue") or summary.get("CashBalance")
    buying_power = summary.get("BuyingPower")
    equity = summary.get("NetLiquidation")
    margin = summary.get("InitMarginReq")
    currency = summary.get("Currency") or "USD"

    return {
        "managedAccounts": managed_accounts,
        "accountMode": account_mode,
        "accountLoaded": bool(summary_rows),
        "serverTime": serialize_datetime(server_time),
        "cash": float(cash) if cash not in (None, "") else None,
        "buyingPower": float(buying_power) if buying_power not in (None, "") else None,
        "equity": float(equity) if equity not in (None, "") else None,
        "margin": margin,
        "currency": currency,
        "positions": [
            {
                "symbol": position.contract.localSymbol or position.contract.symbol,
                "quantity": position.position,
                "averageCost": position.avgCost,
                "marketValue": position.marketValue,
                "account": position.account,
            }
            for position in positions
        ],
        "openOrders": [order_payload(trade) for trade in open_trades],
    }


def action_account_summary(ib, args):
    snapshot = fetch_account_snapshot(ib, args)
    return result(
        True,
        action="getAccountSummary",
        available=snapshot["accountLoaded"],
        paperConfirmed=snapshot["accountMode"] == "paper",
        accountMode=snapshot["accountMode"],
        managedAccounts=snapshot["managedAccounts"],
        cash=snapshot["cash"],
        buyingPower=snapshot["buyingPower"],
        equity=snapshot["equity"],
        currency=snapshot["currency"],
        margin=snapshot["margin"],
        positions=snapshot["positions"],
        openOrders=snapshot["openOrders"],
        lastUpdated=snapshot["serverTime"],
    )


def action_positions(ib, args):
    snapshot = fetch_account_snapshot(ib, args)
    return result(
        True,
        action="getPositions",
        paperConfirmed=snapshot["accountMode"] == "paper",
        positions=snapshot["positions"],
    )


def action_open_orders(ib, args):
    snapshot = fetch_account_snapshot(ib, args)
    return result(
        True,
        action="getOpenOrders",
        paperConfirmed=snapshot["accountMode"] == "paper",
        openOrders=snapshot["openOrders"],
    )


def action_market_data(ib, args):
    contract = build_contract(args.symbol)
    with contextlib.redirect_stdout(sys.stderr):
        ib.qualifyContracts(contract)
        ticker = ib.reqMktData(contract, "", False, False)
        ib.sleep(2)

    return result(
        True,
        action="getMarketData",
        paperConfirmed=True,
        marketData={
            "symbol": args.symbol,
            "last": ticker.last,
            "close": ticker.close,
            "bid": ticker.bid,
            "ask": ticker.ask,
            "high": ticker.high,
            "low": ticker.low,
            "volume": ticker.volume,
            "timestamp": serialize_datetime(getattr(ticker, "time", None)),
        },
    )


def action_preview_order(ib, args, MarketOrder, LimitOrder):
    snapshot = fetch_account_snapshot(ib, args)
    ensure_paper_account(snapshot["accountMode"])
    contract = build_contract(args.symbol)
    order = create_order(args, MarketOrder, LimitOrder)
    with contextlib.redirect_stdout(sys.stderr):
        ib.qualifyContracts(contract)
        what_if = ib.whatIfOrder(contract, order)

    return result(
        True,
        action="previewOrder",
        paperConfirmed=True,
        preview={
            "symbol": args.symbol,
            "side": args.side,
            "orderType": args.order_type,
            "quantity": args.quantity,
            "limitPrice": args.limit_price,
            "clientOrderId": args.client_order_id,
            "commission": getattr(what_if, "commission", None),
            "minCommission": getattr(what_if, "minCommission", None),
            "maxCommission": getattr(what_if, "maxCommission", None),
            "initMarginChange": getattr(what_if, "initMarginChange", None),
            "maintMarginChange": getattr(what_if, "maintMarginChange", None),
            "equityWithLoanChange": getattr(what_if, "equityWithLoanChange", None),
            "warningText": getattr(what_if, "warningText", None),
        },
    )


def action_place_paper_order(ib, args, MarketOrder, LimitOrder):
    snapshot = fetch_account_snapshot(ib, args)
    ensure_paper_account(snapshot["accountMode"])
    contract = build_contract(args.symbol)
    order = create_order(args, MarketOrder, LimitOrder)
    with contextlib.redirect_stdout(sys.stderr):
        ib.qualifyContracts(contract)
        trade = ib.placeOrder(contract, order)
        ib.sleep(2)

    return result(
        True,
        action="placePaperOrder",
        paperConfirmed=True,
        order=order_payload(trade),
        fills=[fill_payload(fill) for fill in trade.fills],
    )


def action_cancel_order(ib, args):
    if not args.broker_order_id:
        raise ValueError("brokerOrderId is required.")

    with contextlib.redirect_stdout(sys.stderr):
        open_trades = ib.reqAllOpenOrders()
    match = next(
        (
            trade
            for trade in open_trades
            if str(getattr(getattr(trade, "order", None), "orderId", "")) == str(args.broker_order_id)
        ),
        None,
    )
    if not match:
        raise RuntimeError("Broker order not found among open orders.")

    with contextlib.redirect_stdout(sys.stderr):
        ib.cancelOrder(match.order)
        ib.sleep(1)

    return result(
        True,
        action="cancelPaperOrder",
        paperConfirmed=True,
        order=order_payload(match),
    )


def action_order_status(ib, args):
    if not args.broker_order_id and not args.client_order_id:
        raise ValueError("brokerOrderId or clientOrderId is required.")

    with contextlib.redirect_stdout(sys.stderr):
        open_trades = ib.reqAllOpenOrders()
        executions = ib.reqExecutions()

    open_match = next(
        (
            trade
            for trade in open_trades
            if str(getattr(getattr(trade, "order", None), "orderId", "")) == str(args.broker_order_id or "")
            or getattr(getattr(trade, "order", None), "orderRef", None) == args.client_order_id
        ),
        None,
    )
    if open_match:
        return result(
            True,
            action="getOrderStatus",
            paperConfirmed=True,
            order=order_payload(open_match),
            fills=[fill_payload(fill) for fill in open_match.fills],
        )

    matching_executions = [
        execution
        for execution in executions
        if str(getattr(execution, "orderId", "")) == str(args.broker_order_id or "")
        or getattr(execution, "orderRef", None) == args.client_order_id
    ]
    if matching_executions:
        total_quantity = sum(float(getattr(execution, "shares", 0) or 0) for execution in matching_executions)
        average_price = (
            sum(
                float(getattr(execution, "shares", 0) or 0)
                * float(getattr(execution, "price", 0) or 0)
                for execution in matching_executions
            )
            / total_quantity
            if total_quantity
            else None
        )
        return result(
            True,
            action="getOrderStatus",
            paperConfirmed=True,
            order={
                "brokerOrderId": str(args.broker_order_id or matching_executions[0].orderId),
                "clientOrderId": args.client_order_id or matching_executions[0].orderRef,
                "status": "FILLED",
                "filled": total_quantity,
                "remaining": 0,
                "avgFillPrice": average_price,
            },
            fills=[],
        )

    return result(
        False,
        action="getOrderStatus",
        paperConfirmed=True,
        order=None,
        error="Order status unavailable.",
    )


def action_fills(ib, args):
    with contextlib.redirect_stdout(sys.stderr):
        fills = ib.fills()
        if not fills:
            fills = ib.reqExecutions()
    payload = []
    for fill in fills:
        if hasattr(fill, "execution"):
            normalized = fill_payload(fill)
        else:
            normalized = {
                "executionId": getattr(fill, "execId", None),
                "brokerOrderId": str(getattr(fill, "orderId", "") or ""),
                "clientId": getattr(fill, "clientId", None),
                "symbol": None,
                "side": getattr(fill, "side", None),
                "quantity": getattr(fill, "shares", None),
                "price": getattr(fill, "price", None),
                "commission": None,
                "filledAt": serialize_datetime(getattr(fill, "time", None)),
                "account": getattr(fill, "acctNumber", None),
                "orderRef": getattr(fill, "orderRef", None),
            }
        if args.broker_order_id and normalized["brokerOrderId"] != str(args.broker_order_id):
            continue
        if args.client_order_id and normalized["orderRef"] != args.client_order_id:
            continue
        payload.append(normalized)
    return result(
        True,
        action="getFills",
        paperConfirmed=True,
        fills=payload,
    )


def main():
    args = parse_args()

    if not is_supported_python():
        print(
            json.dumps(
                result(
                    False,
                    action=args.action,
                    error=(
                        f"Unsupported Python {get_runtime_version()}. "
                        "IBKR broker actions require Python 3.11 or 3.12."
                    ),
                    compatibilityPassed=False,
                )
            )
        )
        return

    if not socket_reachable(args.host, args.port, min(args.timeout, 3)):
        print(
            json.dumps(
                result(
                    False,
                    action=args.action,
                    error=f"IBKR socket {args.host}:{args.port} is unreachable.",
                    socketReachable=False,
                )
            )
        )
        return

    readonly = args.action not in {"preview-order", "place-paper-order", "cancel-order"}
    ib = None
    try:
        ib, MarketOrder, LimitOrder = connect_ib(args, readonly=readonly)
        actions = {
            "account-summary": lambda: action_account_summary(ib, args),
            "positions": lambda: action_positions(ib, args),
            "open-orders": lambda: action_open_orders(ib, args),
            "market-data": lambda: action_market_data(ib, args),
            "preview-order": lambda: action_preview_order(ib, args, MarketOrder, LimitOrder),
            "place-paper-order": lambda: action_place_paper_order(ib, args, MarketOrder, LimitOrder),
            "cancel-order": lambda: action_cancel_order(ib, args),
            "order-status": lambda: action_order_status(ib, args),
            "fills": lambda: action_fills(ib, args),
        }
        if args.action not in actions:
            raise ValueError(f"Unsupported action: {args.action}")
        print(json.dumps(actions[args.action]()))
    except Exception as error:
        print(
            json.dumps(
                result(
                    False,
                    action=args.action,
                    error=str(error),
                    socketReachable=True,
                )
            )
        )
    finally:
        if ib and ib.isConnected():
            ib.disconnect()


if __name__ == "__main__":
    main()
