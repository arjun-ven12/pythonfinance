from strategy_json_contract import validate_strategy_json
from strategy_conditioning import resolve_regime_overlay


def _safe_float(value, default=0):
    try:
        if value is None or value != value:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _extract_between_bounds(rule, fallback_upper=None):
    value = rule.get("value")
    if isinstance(value, dict):
        lower = _safe_float(value.get("min"), None)
        upper = _safe_float(value.get("max"), fallback_upper)
        if lower is not None and upper is not None:
            return lower, upper

    raw_right = ((rule.get("raw") or {}).get("right")) or ""
    matches = []
    current = ""
    for char in str(raw_right):
        if char.isdigit() or char in ".-":
            current += char
        elif current:
            matches.append(current)
            current = ""
    if current:
        matches.append(current)
    if len(matches) >= 2:
        return _safe_float(matches[0], 0), _safe_float(matches[1], fallback_upper)

    upper = _safe_float(value, fallback_upper)
    return 30, upper


def _get_indicator_value(row, indicator, parameters, context=None):
    context = context or {}
    indicator = str(indicator or "").upper()
    if indicator == "CLOSE":
        return _safe_float(row.get("close"))
    if indicator == "VOLUME":
        return _safe_float(row.get("volume"))
    if indicator == "VOLUME_SMA_20":
        return _safe_float(row.get("volume_sma_20"))
    if indicator == "BREAKOUT_LEVEL":
        return _safe_float(row.get("rolling_high_20"))
    if indicator == "VOLATILITY_20":
        return _safe_float(row.get("volatility_20"))
    if indicator == "EMA_FAST":
        return _safe_float(row.get("ema_20"))
    if indicator == "EMA_SLOW":
        return _safe_float(row.get("ema_50"))
    if indicator == "RSI":
        return _safe_float(row.get("rsi_14"))
    if indicator == "MACD":
        return _safe_float(row.get("macd_histogram"))
    if indicator == "ATR":
        return _safe_float(row.get("atr_14"))
    if indicator == "MOMENTUM":
        close = _safe_float(row.get("close"))
        ema_fast = _safe_float(row.get("ema_20"))
        return close - ema_fast
    if indicator == "PRICE_ABOVE_EMA":
        return _safe_float(row.get("close")) > _safe_float(row.get("ema_20"))
    if indicator == "VOLATILITY_CONTROLLED":
        return _safe_float(row.get("volatility_20")) < 0.03
    if indicator == "BREAKOUT":
        return _safe_float(row.get("close")) > _safe_float(row.get("rolling_high_20"))
    if indicator == "VOLUME_SPIKE":
        volume = _safe_float(row.get("volume"))
        volume_sma = _safe_float(row.get("volume_sma_20"))
        if volume_sma <= 0:
            return False
        return volume > volume_sma
    if indicator == "SIGNAL_STATE":
        return str(context.get("latest_signal") or "").upper()
    if indicator == "HOLDING_PERIOD_DAYS":
        return _safe_float(context.get("holding_period_days"), 0)
    return _safe_float(row.get("close"))


def _default_comparison_value(indicator, parameters):
    indicator = str(indicator or "").upper()
    if indicator == "EMA_FAST":
        return {
            "kind": "indicator",
            "indicator": "EMA_SLOW",
        }
    if indicator == "EMA_SLOW":
        return {
            "kind": "indicator",
            "indicator": "EMA_FAST",
        }
    if indicator == "RSI":
        return _safe_float(parameters.get("rsiThreshold"), 55)
    if indicator in ("PRICE_ABOVE_EMA", "BREAKOUT", "VOLATILITY_CONTROLLED", "VOLUME_SPIKE"):
        return True
    return 0


def _resolve_rule_value(value, row, parameters, context=None):
    context = context or {}
    if isinstance(value, dict) and value.get("kind") == "indicator":
        return _get_indicator_value(row, value.get("indicator"), parameters, context=context)
    return value


def _compare(left, comparator, right, rule=None, previous_left=None, previous_right=None):
    comparator = str(comparator or ">").upper()
    if comparator == "IS_TRUE":
        return bool(left)
    if isinstance(left, str) or isinstance(right, str):
        left = str(left).upper()
        right = str(right).upper()
        if comparator == "==":
            return left == right
        if comparator == "!=":
            return left != right
        return False
    if isinstance(left, bool):
        return bool(left) if comparator in ("==", "IS_TRUE") else False
    left = _safe_float(left)
    right = _safe_float(right)
    if comparator == ">":
        return left > right
    if comparator == ">=":
        return left >= right
    if comparator == "<":
        return left < right
    if comparator == "<=":
        return left <= right
    if comparator == "==":
        return left == right
    if comparator == "!=":
        return left != right
    if comparator == "BETWEEN":
        lower, upper = _extract_between_bounds(rule or {}, fallback_upper=right)
        return lower <= left <= upper
    if comparator == "CROSSES_ABOVE":
        previous_left = _safe_float(previous_left, left)
        previous_right = _safe_float(previous_right, right)
        return previous_left <= previous_right and left > right
    if comparator == "CROSSES_BELOW":
        previous_left = _safe_float(previous_left, left)
        previous_right = _safe_float(previous_right, right)
        return previous_left >= previous_right and left < right
    return False


def evaluate_rule(rule, row, parameters=None, context=None):
    parameters = parameters or {}
    context = context or {}
    operator = str(rule.get("operator", "")).upper()
    children = rule.get("children") or []
    if operator == "AND":
        child_results = [evaluate_rule(child, row, parameters, context) for child in children]
        passed = all(item["passed"] for item in child_results)
        return {
            "passed": passed,
            "score": sum(item["score"] for item in child_results),
            "max_score": sum(item["max_score"] for item in child_results),
            "reasons": [reason for item in child_results for reason in item["reasons"]],
        }
    if operator == "OR":
        child_results = [evaluate_rule(child, row, parameters, context) for child in children]
        passed_results = [item for item in child_results if item["passed"]]
        passed = len(passed_results) > 0
        return {
            "passed": passed,
            "score": max([item["score"] for item in passed_results] or [0]),
            "max_score": max([item["max_score"] for item in child_results] or [1]),
            "reasons": [reason for item in child_results for reason in item["reasons"]],
        }
    if operator == "NOT":
        child_result = evaluate_rule(children[0], row, parameters, context) if children else {"passed": False, "score": 0, "reasons": []}
        return {
            "passed": not child_result["passed"],
            "score": 1 if not child_result["passed"] else 0,
            "max_score": 1,
            "reasons": [f"NOT condition {'passed' if not child_result['passed'] else 'failed'}"],
        }
    if operator == "GROUP":
        return evaluate_rule({"operator": "AND", "children": children}, row, parameters, context)

    indicator = rule.get("indicator")
    left = _get_indicator_value(row, indicator, parameters, context=context)
    right = rule.get("value")
    if right is None:
        right = _default_comparison_value(indicator, parameters)
    resolved_right = _resolve_rule_value(right, row, parameters, context=context)
    previous_row = context.get("previous_row")
    if previous_row is None:
        previous_row = {}
    previous_left = _get_indicator_value(previous_row, indicator, parameters, context=context)
    previous_right = _resolve_rule_value(right, previous_row, parameters, context=context)
    passed = _compare(
        left,
        rule.get("comparator"),
        resolved_right,
        rule=rule,
        previous_left=previous_left,
        previous_right=previous_right,
    )
    score = 1 if passed else 0
    return {
        "passed": passed,
        "score": score,
        "max_score": 1,
        "reasons": [
            {
                "indicator": indicator,
                "passed": passed,
                "contribution": score,
                "comparison": f"{indicator} {rule.get('comparator', '>')} {resolved_right}",
            }
        ],
    }


def generate_signal_from_strategy_json(row, strategy_json, context=None):
    validate_strategy_json(strategy_json)
    executable = (strategy_json or {}).get("executable", {})
    context = context or {}
    overlay_resolution = resolve_regime_overlay(
        executable.get("parameters", {}),
        executable.get("regimeOverlays", {}),
        context.get("regime") or row.get("market_regime") or row.get("regime"),
    )
    parameters = overlay_resolution["parameters"]
    signal_threshold = _safe_float(parameters.get("signalThreshold"), 60)
    entry_rules = executable.get("entryRules") or []
    risk_rules = executable.get("riskRules") or []
    combined_children = [*entry_rules, *risk_rules]
    result = evaluate_rule(
        {"operator": "AND", "children": combined_children},
        row,
        parameters,
        context=context,
    )
    max_score = max(1, result.get("max_score", 1))
    normalized_score = min(100, max(0, (result["score"] / max_score) * 100))
    confidence = round(normalized_score, 2)
    signal = "BUY" if result["passed"] and confidence >= signal_threshold else "HOLD"
    if confidence <= 30 and not result["passed"]:
        signal = "SELL"
    readable_reasons = []
    normalized_decomposition = []
    for reason in result["reasons"]:
        if isinstance(reason, dict):
            normalized_contribution = round((reason["contribution"] / max_score) * 100, 2)
            normalized_reason = {
                **reason,
                "contribution": normalized_contribution,
            }
            normalized_decomposition.append(normalized_reason)
            readable_reasons.append(
                f"{reason['comparison']} {'passed' if reason['passed'] else 'failed'} (+{normalized_contribution})"
            )
        else:
            readable_reasons.append(str(reason))
            normalized_decomposition.append(reason)
    return {
        "signal": signal,
        "confidence": confidence,
        "reasons": readable_reasons,
        "score_decomposition": normalized_decomposition,
        "market_regime": overlay_resolution["regime"],
        "regime_overlay_applied": overlay_resolution["applied"],
        "regime_overlay": overlay_resolution["overlay"],
        "applied_parameters": parameters,
        "rule_tree": {"operator": "AND", "children": combined_children},
        "strategy_json_applied": True,
    }
