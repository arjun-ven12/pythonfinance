EXECUTION_MODES = {"MANUAL_APPROVAL", "SEMI_AUTOMATED", "FULL_AUTOMATION"}

DEFAULT_EXECUTION_SETTINGS = {
    "execution_mode": "MANUAL_APPROVAL",
    "auto_execute_confidence_threshold": 85,
    "allow_trading_near_earnings": False,
    "max_trade_size_for_auto_execution": 5000,
    "allow_overnight_positions": True,
    "pause_automation_during_major_macro_events": True,
}


def normalize_execution_mode(value):
    mode = str(value or DEFAULT_EXECUTION_SETTINGS["execution_mode"]).strip().upper()
    return mode if mode in EXECUTION_MODES else DEFAULT_EXECUTION_SETTINGS["execution_mode"]


def load_execution_settings():
    return dict(DEFAULT_EXECUTION_SETTINGS)


def has_high_risk_news(opportunity):
    news_filter = opportunity.get("news_filter") or {}
    openai_reasoning = opportunity.get("openai_news_reasoning") or {}
    events = news_filter.get("events", [])

    if openai_reasoning.get("risk_level") == "HIGH":
        return True

    if not news_filter.get("allow_trade", True):
        return True

    return any(
        event.get("is_major")
        or event.get("event_type") in {"EARNINGS", "MACRO", "FED"}
        for event in events
    )


def is_near_earnings(opportunity):
    events = (opportunity.get("news_filter") or {}).get("events", [])
    return any(event.get("event_type") == "EARNINGS" for event in events)


def has_major_macro_event(opportunity):
    events = (opportunity.get("news_filter") or {}).get("events", [])
    return any(
        event.get("is_major") and event.get("event_type") in {"MACRO", "FED"}
        for event in events
    )


def get_order_value(order):
    try:
        return float(order.get("entry_price", 0)) * float(order.get("quantity", 0))
    except (TypeError, ValueError):
        return 0


def evaluate_execution_route(order, opportunity, market_regime, settings=None):
    active_settings = {
        **DEFAULT_EXECUTION_SETTINGS,
        **(settings or load_execution_settings()),
    }
    mode = normalize_execution_mode(active_settings.get("execution_mode"))
    confidence = float(opportunity.get("confidence") or 0)
    order_value = get_order_value(order)
    blockers = []
    approval_reasons = []

    if not market_regime.get("allow_new_buys", True):
        blockers.append("Market regime blocks new buys.")

    if opportunity.get("high_risk_flag"):
        approval_reasons.append("High-risk universe trade requires manual review.")

    if has_high_risk_news(opportunity):
        approval_reasons.append("High-risk news or event context.")

    if (
        is_near_earnings(opportunity)
        and not active_settings.get("allow_trading_near_earnings", False)
    ):
        approval_reasons.append("Earnings proximity requires approval.")

    if (
        has_major_macro_event(opportunity)
        and active_settings.get("pause_automation_during_major_macro_events", True)
    ):
        approval_reasons.append("Major macro/Fed event pauses automation.")

    if confidence < float(active_settings["auto_execute_confidence_threshold"]):
        approval_reasons.append("Confidence below auto-execute threshold.")

    if order_value > float(active_settings["max_trade_size_for_auto_execution"]):
        approval_reasons.append("Trade size exceeds auto-execute maximum.")

    if blockers:
        return {
            "mode": mode,
            "route": "BLOCKED",
            "requires_user_approval": True,
            "eligible_for_auto_execution": False,
            "auto_execute_ready": False,
            "blockers": blockers,
            "approval_reasons": approval_reasons,
            "safety_required": True,
            "pre_trade_analysis_required": True,
            "broker_execution_enabled": False,
        }

    if mode == "MANUAL_APPROVAL":
        return {
            "mode": mode,
            "route": "REQUEST_APPROVAL",
            "requires_user_approval": True,
            "eligible_for_auto_execution": False,
            "auto_execute_ready": False,
            "blockers": [],
            "approval_reasons": ["Manual Approval mode requires explicit approval."],
            "safety_required": True,
            "pre_trade_analysis_required": True,
            "broker_execution_enabled": False,
        }

    if opportunity.get("high_risk_flag"):
        return {
            "mode": mode,
            "route": "REQUEST_APPROVAL",
            "requires_user_approval": True,
            "eligible_for_auto_execution": False,
            "auto_execute_ready": False,
            "blockers": [],
            "approval_reasons": approval_reasons,
            "safety_required": True,
            "pre_trade_analysis_required": True,
            "broker_execution_enabled": False,
            "high_risk_manual_review_required": True,
        }

    if mode == "SEMI_AUTOMATED" and approval_reasons:
        return {
            "mode": mode,
            "route": "REQUEST_APPROVAL",
            "requires_user_approval": True,
            "eligible_for_auto_execution": False,
            "auto_execute_ready": False,
            "blockers": [],
            "approval_reasons": approval_reasons,
            "safety_required": True,
            "pre_trade_analysis_required": True,
            "broker_execution_enabled": False,
        }

    return {
        "mode": mode,
        "route": "READY_FOR_AUTO_EXECUTION",
        "requires_user_approval": False,
        "eligible_for_auto_execution": True,
        "auto_execute_ready": True,
        "blockers": [],
        "approval_reasons": approval_reasons,
        "safety_required": True,
        "pre_trade_analysis_required": True,
        "broker_execution_enabled": False,
    }


def summarize_execution_routes(orders, settings=None):
    active_settings = settings or load_execution_settings()
    pending_approvals = [
        order for order in orders if order.get("execution_route", {}).get("route") == "REQUEST_APPROVAL"
    ]
    blocked_trades = [
        order for order in orders if order.get("execution_route", {}).get("route") == "BLOCKED"
    ]
    auto_ready = [
        order
        for order in orders
        if order.get("execution_route", {}).get("route") == "READY_FOR_AUTO_EXECUTION"
    ]

    return {
        "execution_mode": normalize_execution_mode(active_settings.get("execution_mode")),
        "pending_approvals": len(pending_approvals),
        "blocked_trades": len(blocked_trades),
        "auto_ready": len(auto_ready),
        "approval_requests": [
            {
                "symbol": order.get("symbol"),
                "reasons": order.get("execution_route", {}).get("approval_reasons", []),
            }
            for order in pending_approvals
        ],
        "last_automated_action": None,
        "broker_execution_enabled": False,
    }
