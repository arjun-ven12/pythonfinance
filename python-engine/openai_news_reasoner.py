import json
import os
import hashlib
import time
from collections import OrderedDict
from pathlib import Path


PYTHON_ENGINE_DIR = Path(__file__).resolve().parent
CACHE_TTL_SECONDS = int(os.getenv("NODE_AI_NEWS_CACHE_TTL_SECONDS", "300"))
CACHE_MAX_ENTRIES = int(os.getenv("NODE_AI_NEWS_CACHE_MAX_ENTRIES", "250"))
_SCAN_CACHE = OrderedDict()


try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


if load_dotenv is not None:
    load_dotenv(PYTHON_ENGINE_DIR / ".env")


def clamp_confidence_adjustment(value):
    try:
        adjustment = int(value)
    except (TypeError, ValueError):
        return 0

    return max(-25, min(15, adjustment))


def default_reasoning(symbol, reason, reason_code="gateway_unavailable"):
    return {
        "news_summary": "AI news reasoning unavailable.",
        "risk_level": "MEDIUM",
        "sentiment": "NEUTRAL",
        "confidence_adjustment": 0,
        "allow_trade": True,
        "reasoning": f"{symbol}: {reason}",
        "aiUnavailable": True,
        "reason": reason_code,
        "fallbackUsed": True,
    }


def no_news_reasoning():
    return {
        "news_summary": "No relevant news events were supplied for AI assessment.",
        "risk_level": "MEDIUM",
        "sentiment": "NEUTRAL",
        "confidence_adjustment": 0,
        "allow_trade": True,
        "reasoning": "News AI was not needed because there were no events to assess.",
        "aiUnavailable": False,
        "reason": "no_news_events",
        "fallbackUsed": False,
    }


def normalize_reasoning(symbol, raw_result):
    if not isinstance(raw_result, dict):
        return default_reasoning(
            symbol,
            "Model returned an invalid response.",
            reason_code="invalid_ai_response",
        )

    risk_level = str(raw_result.get("risk_level", "MEDIUM")).upper()
    sentiment = str(raw_result.get("sentiment", "NEUTRAL")).upper()

    if risk_level not in {"LOW", "MEDIUM", "HIGH"}:
        risk_level = "MEDIUM"

    if sentiment not in {"POSITIVE", "NEUTRAL", "NEGATIVE"}:
        sentiment = "NEUTRAL"

    return {
        "news_summary": str(raw_result.get("news_summary") or "No summary available."),
        "risk_level": risk_level,
        "sentiment": sentiment,
        "confidence_adjustment": clamp_confidence_adjustment(
            raw_result.get("confidence_adjustment", 0)
        ),
        "allow_trade": bool(raw_result.get("allow_trade", True)),
        "reasoning": str(raw_result.get("reasoning") or "No reasoning provided."),
        "aiUnavailable": False,
        "reason": None,
        "fallbackUsed": False,
    }


def build_prompt(symbol, technical_signal, confidence, market_regime, news_events):
    return {
        "symbol": symbol,
        "current_technical_signal": technical_signal,
        "confidence": confidence,
        "market_regime": market_regime,
        "news_events": news_events[:12],
        "instruction": (
            "Assess news and event risk only. Do not create or change BUY, HOLD, "
            "or SELL signals. Return only confidence adjustment and risk context."
        ),
    }


def get_cached_reasoning(cache_key):
    cached = _SCAN_CACHE.get(cache_key)
    if not cached:
        return None

    if time.time() - cached["created_at"] > CACHE_TTL_SECONDS:
        _SCAN_CACHE.pop(cache_key, None)
        return None

    _SCAN_CACHE.move_to_end(cache_key)
    return cached["value"]


def set_cached_reasoning(cache_key, value):
    _SCAN_CACHE[cache_key] = {
        "created_at": time.time(),
        "value": value,
    }
    _SCAN_CACHE.move_to_end(cache_key)

    while len(_SCAN_CACHE) > CACHE_MAX_ENTRIES:
        _SCAN_CACHE.popitem(last=False)


def request_node_ai_reasoning(payload, user_id, timeout):
    import requests

    gateway_url = os.getenv("NODE_AI_GATEWAY_URL")
    gateway_token = os.getenv("NODE_AI_GATEWAY_TOKEN")

    if not gateway_url or not gateway_token:
        raise RuntimeError("Node AI gateway is not configured.")

    response = requests.post(
        gateway_url,
        headers={
            "X-Internal-AI-Token": gateway_token,
            "X-AI-User-ID": str(user_id),
            "Content-Type": "application/json",
        },
        json={**payload, "userId": str(user_id)},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def reason_about_news(
    symbol,
    technical_signal,
    confidence,
    market_regime,
    news_events,
    user_id,
    api_key=None,
    model=None,
    timeout=20,
):
    if not news_events:
        return no_news_reasoning()

    cache_inputs = {
        "user_id": str(user_id),
        "symbol": symbol.upper(),
        "technical_signal": technical_signal,
        "confidence": confidence,
        "market_regime": market_regime,
        "news_events": news_events or [],
    }
    cache_key = hashlib.sha256(
        json.dumps(cache_inputs, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()

    if cache_key in _SCAN_CACHE:
        cached = get_cached_reasoning(cache_key)
        if cached:
            return cached

    payload = build_prompt(
        symbol=symbol,
        technical_signal=technical_signal,
        confidence=confidence,
        market_regime=market_regime,
        news_events=news_events or [],
    )

    try:
        raw_result = request_node_ai_reasoning(
            payload=payload,
            user_id=os.getenv("NODE_AI_USER_ID") or user_id,
            timeout=timeout,
        )
        result = normalize_reasoning(symbol, raw_result)
        set_cached_reasoning(cache_key, result)
    except Exception as error:
        result = default_reasoning(
            symbol,
            f"Node AI gateway request failed safely: {error}",
            reason_code="gateway_unavailable",
        )

    return result
