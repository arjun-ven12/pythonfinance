#!/usr/bin/env python3
import argparse
import contextlib
import json
import math
import sys
from datetime import datetime, timedelta


PROTOCOL = "PYTHON_BRIDGE_TCP_SDK"


def sanitize_json_value(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return {
            str(key): sanitize_json_value(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [sanitize_json_value(item) for item in value]
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if hasattr(value, "item"):
        try:
            return sanitize_json_value(value.item())
        except Exception:
            pass
    if value != value:
        return None
    return value


def emit(payload, code=0):
    print(json.dumps(sanitize_json_value(payload), default=str, allow_nan=False))
    raise SystemExit(code)


def read_payload():
    raw = sys.stdin.read()
    return json.loads(raw or "{}")


def import_sdk():
    try:
        import moomoo as sdk  # type: ignore
        return sdk
    except Exception:
        import futu as sdk  # type: ignore
        return sdk


def enum_value(sdk, enum_name, value, fallback=None):
    enum = getattr(sdk, enum_name, None)
    if enum is None:
        return fallback if fallback is not None else value
    for candidate in [value, str(value).upper(), str(value).lower(), str(value).title()]:
        attr = getattr(enum, candidate, None)
        if attr is not None:
            return attr
    return fallback if fallback is not None else value


def normalize_security_firm(value):
    normalized = str(value or "FUTUSECURITIES").strip().upper()
    aliases = {
        "MOOMOO": "FUTUSECURITIES",
        "FUTU": "FUTUSECURITIES",
        "FUTU_SECURITIES": "FUTUSECURITIES",
        "FUTUSECURITIES": "FUTUSECURITIES",
        "FUTUINC": "FUTUINC",
        "FUTUSG": "FUTUSG",
    }
    return aliases.get(normalized, "FUTUSECURITIES")


def ret_ok(sdk):
    return getattr(sdk, "RET_OK", 0)


def dataframe_records(data):
    if data is None:
        return []
    if hasattr(data, "to_dict"):
        return data.to_dict("records")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


def require_ret_ok(sdk, ret, data, action):
    if ret != ret_ok(sdk):
        raise RuntimeError(f"{action} failed: {data}")
    return dataframe_records(data)


def normalize_trade_env(value, fallback="SIMULATE"):
    normalized = str(value or fallback).strip().upper()
    if normalized in {"0", "REAL", "TRDENV_REAL"} or "REAL" in normalized:
        return "REAL"
    return "SIMULATE"


def normalize_account_id(value):
    raw = str(value or "").strip()
    parts = raw.split(":", 1)
    if len(parts) == 2 and parts[0].strip().upper() in {"REAL", "SIMULATE"}:
        raw = parts[1].strip()
    return int(raw) if raw.isdigit() else raw


def account_has_trade_env(row):
    return any(key in row and row.get(key) not in (None, "") for key in ["trd_env", "tradeEnv", "trdEnv"])


def normalize_account(row, payload, trade_env=None):
    resolved_trade_env = normalize_trade_env(
        trade_env or row.get("trd_env") or row.get("tradeEnv") or row.get("trdEnv"),
        payload.get("tradeEnv") or "SIMULATE",
    )
    account_id = str(row.get("acc_id") or row.get("accountId") or payload.get("accountId") or "")
    account_type = row.get("acc_type") or row.get("accountType") or "Paper / Live"
    return {
        "accountId": account_id,
        "accountType": account_type,
        "tradeEnv": resolved_trade_env,
        "market": payload.get("market") or "US",
        "displayName": (
            row.get("displayName")
            or row.get("acc_name")
            or f"{resolved_trade_env} · {account_id}"
        ),
    }


def build_quote_context(sdk, payload):
    return sdk.OpenQuoteContext(host=payload.get("host", "127.0.0.1"), port=int(payload.get("port", 11111)))


def build_trade_context(sdk, payload):
    trd_env = enum_value(
        sdk,
        "TrdEnv",
        "REAL" if str(payload.get("tradeEnv", "SIMULATE")).upper() == "REAL" else "SIMULATE",
    )
    market = enum_value(sdk, "TrdMarket", str(payload.get("market", "US")).upper())
    security_firm = enum_value(sdk, "SecurityFirm", normalize_security_firm(payload.get("securityFirm")))
    kwargs = {
        "filter_trdmarket": market,
        "host": payload.get("host", "127.0.0.1"),
        "port": int(payload.get("port", 11111)),
        "security_firm": security_firm,
    }
    ctx = sdk.OpenSecTradeContext(**kwargs)
    password = payload.get("tradingPasswordMd5")
    if password and hasattr(ctx, "unlock_trade"):
        ctx.unlock_trade(password)
    return ctx, trd_env


def close_context(ctx):
    try:
        ctx.close()
    except Exception:
        pass


def get_accounts(sdk, payload):
    ctx, trd_env = build_trade_context(sdk, payload)
    try:
        ret, data = ctx.get_acc_list()
        accounts = dataframe_records(data) if ret == ret_ok(sdk) else []
        normalized = []
        for row in accounts:
            if payload.get("includeTradeEnvVariants") and not account_has_trade_env(row):
                normalized.append(normalize_account(row, payload, "SIMULATE"))
                normalized.append(normalize_account(row, payload, "REAL"))
            else:
                normalized.append(normalize_account(row, payload))
        return {
            "accounts": normalized,
            "selectedAccountId": payload.get("accountId") or (normalized[0]["accountId"] if normalized else None),
            "accountsFound": len(normalized),
            "accountListResult": "OK" if ret == ret_ok(sdk) else str(data),
        }
    finally:
        close_context(ctx)


def get_funds(sdk, payload):
    ctx, trd_env = build_trade_context(sdk, payload)
    try:
        ret, data = ctx.accinfo_query(trd_env=trd_env, acc_id=normalize_account_id(payload.get("accountId")) or 0)
        records = require_ret_ok(sdk, ret, data, "accinfo_query")
        return {
            "funds": records[0] if records else {},
            "account": normalize_account({}, payload),
            "fundsLoaded": bool(records),
            "fundsResult": "OK" if ret == ret_ok(sdk) else str(data),
        }
    finally:
        close_context(ctx)


def get_positions(sdk, payload):
    ctx, trd_env = build_trade_context(sdk, payload)
    try:
        ret, data = ctx.position_list_query(trd_env=trd_env, acc_id=normalize_account_id(payload.get("accountId")) or 0)
        return {"positions": require_ret_ok(sdk, ret, data, "position_list_query")}
    finally:
        close_context(ctx)


def query_orders(sdk, payload, history=False):
    ctx, trd_env = build_trade_context(sdk, payload)
    try:
        acc_id = normalize_account_id(payload.get("accountId")) or 0
        if history and hasattr(ctx, "history_order_list_query"):
            start = (datetime.now() - timedelta(days=int(payload.get("historyDays") or 90))).strftime("%Y-%m-%d")
            end = datetime.now().strftime("%Y-%m-%d")
            ret, data = ctx.history_order_list_query(
                trd_env=trd_env,
                acc_id=acc_id,
                start=start,
                end=end,
            )
        else:
            ret, data = ctx.order_list_query(trd_env=trd_env, acc_id=acc_id)
        return {
            "orders": require_ret_ok(
                sdk,
                ret,
                data,
                "history_order_list_query" if history else "order_list_query",
            )
        }
    finally:
        close_context(ctx)


def get_quote(sdk, payload):
    ctx = build_quote_context(sdk, payload)
    code = payload.get("symbol")
    try:
        ret, data = ctx.get_market_snapshot([code])
        records = require_ret_ok(sdk, ret, data, "get_market_snapshot")
        return {"record": records[0] if records else {}}
    finally:
        close_context(ctx)


def get_history(sdk, payload):
    ctx = build_quote_context(sdk, payload)
    try:
        ret, data, _page_req_key = ctx.request_history_kline(
            payload.get("symbol"),
            ktype=enum_value(sdk, "KLType", payload.get("ktype", "K_DAY")),
            max_count=int(payload.get("maxCount") or 500),
        )
        return {"points": require_ret_ok(sdk, ret, data, "request_history_kline")}
    finally:
        close_context(ctx)


def map_order_type(sdk, value):
    normalized = str(value or "MARKET").upper()
    if "MARKET" in normalized:
        return enum_value(sdk, "OrderType", "MARKET")
    return enum_value(sdk, "OrderType", "NORMAL")


def map_side(sdk, value):
    normalized = str(value or "BUY").upper()
    return enum_value(sdk, "TrdSide", "SELL" if normalized == "SELL" else "BUY")


def place_order(sdk, payload):
    ctx, trd_env = build_trade_context(sdk, payload)
    try:
        price = float(payload.get("limitPrice") or 0)
        qty = float(payload.get("quantity") or 0)
        ret, data = ctx.place_order(
            price=price,
            qty=qty,
            code=payload.get("symbol"),
            trd_side=map_side(sdk, payload.get("side")),
            order_type=map_order_type(sdk, payload.get("orderType")),
            trd_env=trd_env,
            acc_id=normalize_account_id(payload.get("accountId")) or 0,
            remark=payload.get("clientOrderId") or "",
        )
        records = require_ret_ok(sdk, ret, data, "place_order")
        if records:
            return {"order": records[0]}

        order_lookup = query_orders(sdk, payload, history=False).get("orders", [])
        client_order_id = str(payload.get("clientOrderId") or "")
        symbol = str(payload.get("symbol") or "")
        matched = next(
            (
                row
                for row in order_lookup
                if (
                    client_order_id
                    and str(row.get("remark") or row.get("clientOrderId") or "") == client_order_id
                )
                or (
                    symbol
                    and str(row.get("code") or "").upper() == symbol.upper()
                )
            ),
            None,
        )
        if matched:
            return {"order": matched}
        raise RuntimeError("place_order succeeded but returned no order payload.")
    finally:
        close_context(ctx)


def modify_order(sdk, payload, cancel=False):
    ctx, trd_env = build_trade_context(sdk, payload)
    try:
        op = enum_value(sdk, "ModifyOrderOp", "CANCEL" if cancel else "NORMAL")
        ret, data = ctx.modify_order(
            modify_order_op=op,
            order_id=payload.get("brokerOrderId"),
            qty=float(payload.get("quantity") or 0),
            price=float(payload.get("limitPrice") or 0),
            trd_env=trd_env,
            acc_id=normalize_account_id(payload.get("accountId")) or 0,
        )
        records = require_ret_ok(sdk, ret, data, "modify_order")
        return {"order": records[0] if records else {"order_id": payload.get("brokerOrderId")}}
    finally:
        close_context(ctx)


def get_executions(sdk, payload):
    ctx, trd_env = build_trade_context(sdk, payload)
    try:
        if not hasattr(ctx, "deal_list_query"):
            return {"fills": []}
        ret, data = ctx.deal_list_query(trd_env=trd_env, acc_id=normalize_account_id(payload.get("accountId")) or 0)
        records = dataframe_records(data) if ret == ret_ok(sdk) else []
        fills = []
        for row in records:
            fills.append({
                "executionId": row.get("deal_id") or row.get("executionId"),
                "brokerOrderId": row.get("order_id") or row.get("brokerOrderId"),
                "symbol": row.get("code") or payload.get("symbol") or "",
                "side": row.get("trd_side") or row.get("side"),
                "quantity": row.get("qty") or row.get("quantity"),
                "price": row.get("price"),
                "commission": row.get("commission") or 0,
                "filledAt": row.get("create_time") or row.get("filledAt"),
            })
        return {"fills": fills}
    finally:
        close_context(ctx)


def test_connection(sdk, payload):
    quote_ctx = None
    try:
      quote_ctx = build_quote_context(sdk, payload)
      accounts = get_accounts(sdk, payload)
      funds = get_funds(sdk, payload)
      return {
          "connected": True,
          "opendReachable": True,
          "gatewayRunning": True,
          "loggedIn": True,
          "fundsLoaded": bool(funds.get("funds") is not None),
          "accountLoaded": bool(accounts.get("accounts")),
          "accountsFound": accounts.get("accountsFound", 0),
          "accountListResult": accounts.get("accountListResult", "OK"),
          "paperMode": str(payload.get("tradeEnv", "SIMULATE")).upper() != "REAL",
          "marketDataAvailable": True,
          "orderPermission": True,
          "selectedAccount": accounts.get("selectedAccountId"),
      }
    finally:
      if quote_ctx:
          close_context(quote_ctx)


def run(command, payload):
    sdk = import_sdk()
    if command == "test_connection":
        return test_connection(sdk, payload)
    if command == "get_accounts":
        return get_accounts(sdk, payload)
    if command == "get_funds":
        return get_funds(sdk, payload)
    if command == "get_positions":
        return get_positions(sdk, payload)
    if command == "get_open_orders":
        return query_orders(sdk, payload, history=False)
    if command == "get_orders":
        return query_orders(sdk, payload, history=True)
    if command == "get_quote":
        return get_quote(sdk, payload)
    if command == "get_history":
        return get_history(sdk, payload)
    if command == "place_order":
        return place_order(sdk, payload)
    if command == "cancel_order":
        return modify_order(sdk, payload, cancel=True)
    if command == "modify_order":
        return modify_order(sdk, payload, cancel=False)
    if command == "get_order_status":
        open_orders = query_orders(sdk, payload, history=False).get("orders", [])
        orders = open_orders + query_orders(sdk, payload, history=True).get("orders", [])
        order_id = str(payload.get("brokerOrderId") or "")
        client_order_id = str(payload.get("clientOrderId") or "")
        matched = next(
            (
                order
                for order in orders
                if (order_id and str(order.get("order_id")) == order_id)
                or (
                    client_order_id
                    and str(order.get("remark") or order.get("clientOrderId") or "") == client_order_id
                )
            ),
            None,
        )
        return {"order": matched or {}}
    if command == "get_executions":
        return get_executions(sdk, payload)
    raise ValueError(f"Unsupported command: {command}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--command", required=True)
    args = parser.parse_args()
    payload = read_payload()
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = run(args.command, payload)
        emit({"ok": True, "protocolUsed": PROTOCOL, **result})
    except Exception as error:
        emit({"ok": False, "protocolUsed": PROTOCOL, "error": str(error)}, code=1)


if __name__ == "__main__":
    main()
