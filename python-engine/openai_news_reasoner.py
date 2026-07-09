import json
import os
import hashlib
from pathlib import Path


PYTHON_ENGINE_DIR = Path(__file__).resolve().parent
OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"
_SCAN_CACHE = {}


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


def default_reasoning(symbol, reason):
    return {
        "news_summary": "OpenAI news reasoning unavailable.",
        "risk_level": "MEDIUM",
        "sentiment": "NEUTRAL",
        "confidence_adjustment": 0,
        "allow_trade": True,
        "reasoning": f"{symbol}: {reason}",
    }


def normalize_reasoning(symbol, raw_result):
    if not isinstance(raw_result, dict):
        return default_reasoning(symbol, "Model returned an invalid response.")

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


def request_openai_reasoning(payload, api_key, model, timeout):
    import requests

    response = requests.post(
        OPENAI_CHAT_COMPLETIONS_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "temperature": 0.1,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a risk analyst for a trading dashboard. "
                        "You may not generate BUY, HOLD, or SELL recommendations. "
                        "Only explain news risk and suggest a confidence adjustment."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(payload),
                },
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "news_reasoning",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "news_summary": {"type": "string"},
                            "risk_level": {
                                "type": "string",
                                "enum": ["LOW", "MEDIUM", "HIGH"],
                            },
                            "sentiment": {
                                "type": "string",
                                "enum": ["POSITIVE", "NEUTRAL", "NEGATIVE"],
                            },
                            "confidence_adjustment": {
                                "type": "integer",
                                "minimum": -25,
                                "maximum": 15,
                            },
                            "allow_trade": {"type": "boolean"},
                            "reasoning": {"type": "string"},
                        },
                        "required": [
                            "news_summary",
                            "risk_level",
                            "sentiment",
                            "confidence_adjustment",
                            "allow_trade",
                            "reasoning",
                        ],
                    },
                },
            },
        },
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)


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
        return _SCAN_CACHE[cache_key]

    resolved_api_key = os.getenv("OPENAI_API_KEY") if api_key is None else api_key

    if not resolved_api_key:
        result = default_reasoning(symbol, "OPENAI_API_KEY is not configured.")
        _SCAN_CACHE[cache_key] = result
        return result

    payload = build_prompt(
        symbol=symbol,
        technical_signal=technical_signal,
        confidence=confidence,
        market_regime=market_regime,
        news_events=news_events or [],
    )

    try:
        raw_result = request_openai_reasoning(
            payload=payload,
            api_key=resolved_api_key,
            model=model or os.getenv("OPENAI_NEWS_MODEL", DEFAULT_MODEL),
            timeout=timeout,
        )
        result = normalize_reasoning(symbol, raw_result)
    except Exception as error:
        result = default_reasoning(symbol, f"OpenAI request failed safely: {error}")

    _SCAN_CACHE[cache_key] = result
    return result
