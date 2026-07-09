import os
import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from event_mapper import Event, map_finnhub_article_to_event


PYTHON_ENGINE_DIR = Path(__file__).resolve().parent
FINNHUB_COMPANY_NEWS_URL = "https://finnhub.io/api/v1/company-news"


try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


if load_dotenv is not None:
    load_dotenv(PYTHON_ENGINE_DIR / ".env")


LOGGER = logging.getLogger(__name__)
PROVIDER_METRICS = defaultdict(
    lambda: {
        "requests": 0,
        "successes": 0,
        "failures": 0,
        "total_latency_ms": 0.0,
    }
)


def provider_result(provider, success, events=None, errors=None, latency_ms=0):
    return {
        "success": bool(success),
        "provider": provider,
        "events": list(events or []),
        "errors": list(errors or []),
        "latencyMs": round(max(0, float(latency_ms or 0)), 2),
    }


def validate_provider_result(result, provider_name):
    if not isinstance(result, dict):
        raise ValueError("provider result must be an object")

    required_fields = {"success", "provider", "events", "errors", "latencyMs"}
    missing_fields = required_fields.difference(result)
    if missing_fields:
        raise ValueError(
            f"provider result missing fields: {', '.join(sorted(missing_fields))}"
        )
    if not isinstance(result["events"], list):
        raise ValueError("provider events must be a list")
    if not isinstance(result["errors"], list):
        raise ValueError("provider errors must be a list")

    return provider_result(
        result.get("provider") or provider_name,
        result["success"],
        events=result["events"],
        errors=result["errors"],
        latency_ms=result["latencyMs"],
    )


def record_provider_metrics(result):
    metrics = PROVIDER_METRICS[result["provider"]]
    metrics["requests"] += 1
    metrics["successes"] += int(result["success"])
    metrics["failures"] += int(not result["success"])
    metrics["total_latency_ms"] += result["latencyMs"]


def get_provider_metrics(provider_name):
    metrics = PROVIDER_METRICS[provider_name]
    requests = metrics["requests"]
    return {
        "provider": provider_name,
        "requests": requests,
        "news_provider_success_rate": round(
            metrics["successes"] / requests * 100, 2
        ) if requests else 0,
        "news_provider_failure_rate": round(
            metrics["failures"] / requests * 100, 2
        ) if requests else 0,
        "news_provider_latency": round(
            metrics["total_latency_ms"] / requests, 2
        ) if requests else 0,
    }


class BaseNewsProvider:
    provider_name = "unknown"

    def fetch(self, symbol, as_of):
        raise NotImplementedError

    def get_events(self, symbol, as_of):
        return self.fetch(symbol, as_of)["events"]

    def get_status(self):
        return get_provider_metrics(self.provider_name)


BaseEventProvider = BaseNewsProvider


class MockEarningsCalendarProvider(BaseNewsProvider):
    provider_name = "earnings"
    def __init__(self, events=None):
        self.events = events or []

    def fetch(self, symbol, as_of):
        started = time.monotonic()
        events = [
            event for event in self.events
            if event.event_type == "EARNINGS" and event.symbol == symbol
        ]
        result = provider_result(
            self.provider_name,
            True,
            events=events,
            latency_ms=(time.monotonic() - started) * 1000,
        )
        return result


class MockMacroEventProvider(BaseNewsProvider):
    provider_name = "macro"
    def __init__(self, events=None):
        self.events = events or []

    def fetch(self, symbol, as_of):
        started = time.monotonic()
        events = [
            event for event in self.events
            if event.event_type == "MACRO"
        ]
        result = provider_result(
            self.provider_name,
            True,
            events=events,
            latency_ms=(time.monotonic() - started) * 1000,
        )
        return result


class MockFedAnnouncementProvider(BaseNewsProvider):
    provider_name = "fed"
    def __init__(self, events=None):
        self.events = events or []

    def fetch(self, symbol, as_of):
        started = time.monotonic()
        events = [
            event for event in self.events
            if event.event_type == "FED"
        ]
        result = provider_result(
            self.provider_name,
            True,
            events=events,
            latency_ms=(time.monotonic() - started) * 1000,
        )
        return result


class MockSecFilingsProvider(BaseNewsProvider):
    provider_name = "sec_filings"
    def __init__(self, events=None):
        self.events = events or []

    def fetch(self, symbol, as_of):
        started = time.monotonic()
        events = [
            event for event in self.events
            if event.event_type == "SEC_FILING" and event.symbol == symbol
        ]
        result = provider_result(
            self.provider_name,
            True,
            events=events,
            latency_ms=(time.monotonic() - started) * 1000,
        )
        return result


class FinnhubCompanyNewsProvider(BaseNewsProvider):
    provider_name = "finnhub"

    def __init__(self, api_key=None, lookback_days=7, timeout=10):
        self.api_key = api_key or os.getenv("FINNHUB_API_KEY")
        self.lookback_days = lookback_days
        self.timeout = timeout
    def fetch(self, symbol, as_of):
        started = time.monotonic()
        if not self.api_key:
            result = provider_result(
                self.provider_name,
                False,
                errors=["FINNHUB_API_KEY is not configured."],
                latency_ms=(time.monotonic() - started) * 1000,
            )
            return result

        try:
            import requests

            end_date = as_of.date()
            start_date = end_date - timedelta(days=self.lookback_days)
            response = requests.get(
                FINNHUB_COMPANY_NEWS_URL,
                params={
                    "symbol": symbol,
                    "from": start_date.isoformat(),
                    "to": end_date.isoformat(),
                    "token": self.api_key,
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            articles = response.json()
        except Exception as error:
            result = provider_result(
                self.provider_name,
                False,
                errors=[f"Finnhub request failed: {error.__class__.__name__}"],
                latency_ms=(time.monotonic() - started) * 1000,
            )
            return result

        if not isinstance(articles, list):
            result = provider_result(
                self.provider_name,
                False,
                errors=["Finnhub response was not a list of articles."],
                latency_ms=(time.monotonic() - started) * 1000,
            )
            return result

        events = []
        errors = []

        for article in articles:
            try:
                event = map_finnhub_article_to_event(
                    article,
                    symbol,
                    estimate_article_sentiment,
                    is_major_article,
                )
                events.append(event)
            except Exception as error:
                article_id = (
                    article.get("id")
                    if isinstance(article, dict)
                    else None
                )
                reason = str(error)
                errors.append(
                    f"Article {article_id or 'unknown'} skipped: {reason}"
                )
                LOGGER.warning(
                    "news_provider_conversion_failure provider=%s symbol=%s "
                    "article_id=%s reason=%s",
                    self.provider_name,
                    symbol,
                    article_id or "unknown",
                    reason,
                )

        result = provider_result(
            self.provider_name,
            True,
            events=events,
            errors=errors,
            latency_ms=(time.monotonic() - started) * 1000,
        )
        return result


class UnavailableProvider(BaseNewsProvider):
    def __init__(self, provider_name, message):
        self.provider_name = provider_name
        self.message = message

    def fetch(self, symbol, as_of):
        result = provider_result(
            self.provider_name,
            False,
            errors=[self.message],
        )
        return result


UnavailableEventProvider = UnavailableProvider


class EarningsProvider(UnavailableProvider):
    def __init__(self):
        super().__init__("earnings", "Earnings provider unavailable.")


class MacroProvider(UnavailableProvider):
    def __init__(self):
        super().__init__("macro", "Macro provider unavailable.")


def estimate_article_sentiment(text):
    normalized = text.lower()
    positive_terms = {
        "beat",
        "growth",
        "raises",
        "upgrade",
        "profit",
        "record",
    }
    negative_terms = {
        "miss",
        "lawsuit",
        "downgrade",
        "loss",
        "cuts",
        "probe",
        "investigation",
    }
    score = 0

    for term in positive_terms:
        if term in normalized:
            score += 8

    for term in negative_terms:
        if term in normalized:
            score -= 8

    return clamp_score(score)


def is_major_article(title, summary):
    normalized = f"{title} {summary}".lower()
    major_terms = {
        "earnings",
        "guidance",
        "sec",
        "merger",
        "acquisition",
        "lawsuit",
        "investigation",
        "bankruptcy",
        "fed",
        "rate",
        "inflation",
    }

    return any(term in normalized for term in major_terms)


def get_default_mock_events(as_of):
    return [
        Event(
            source="mock",
            event_type="MACRO",
            title="Major CPI release",
            starts_at=as_of + timedelta(hours=24),
            sentiment_score=-10,
            is_major=True,
        ),
        Event(
            source="mock",
            event_type="FED",
            title="FOMC rate decision",
            starts_at=as_of + timedelta(days=7),
            sentiment_score=-15,
            is_major=True,
        ),
        Event(
            source="mock",
            event_type="SEC_FILING",
            title="Positive product-related filing",
            starts_at=as_of - timedelta(days=1),
            symbol="AAPL",
            sentiment_score=20,
        ),
    ]


def build_default_providers(as_of=None, mode=None):
    current_time = as_of or datetime.now()
    provider_mode = str(
        mode or os.getenv("NEWS_PROVIDER_MODE", "live")
    ).strip().lower()

    if provider_mode in {"test", "demo", "mock"}:
        mock_events = get_default_mock_events(current_time)
        return [
            MockEarningsCalendarProvider(mock_events),
            MockMacroEventProvider(mock_events),
            MockFedAnnouncementProvider(mock_events),
            MockSecFilingsProvider(mock_events),
            FinnhubCompanyNewsProvider(),
        ]

    return [
        EarningsProvider(),
        MacroProvider(),
        UnavailableEventProvider(
            "fed",
            "Fed provider unavailable.",
        ),
        UnavailableEventProvider(
            "sec_filings",
            "SEC filings provider unavailable.",
        ),
        FinnhubCompanyNewsProvider(),
    ]


def collect_events_with_status(symbol, as_of=None, providers=None, mode=None):
    current_time = as_of or datetime.now()
    active_providers = (
        providers
        if providers is not None
        else build_default_providers(current_time, mode=mode)
    )
    events = []
    provider_status = []

    for provider in active_providers:
        try:
            result = validate_provider_result(
                provider.fetch(symbol, current_time),
                getattr(
                    provider,
                    "provider_name",
                    provider.__class__.__name__,
                ),
            )
        except Exception as error:
            provider_name = getattr(
                provider,
                "provider_name",
                provider.__class__.__name__,
            )
            result = provider_result(
                provider_name,
                False,
                errors=[f"Provider failed safely: {error.__class__.__name__}"],
            )
        record_provider_metrics(result)

        if result["success"] and result["events"]:
            events.extend(result["events"])

        metrics = get_provider_metrics(result["provider"])
        provider_status.append({
            "provider": result["provider"],
            "success": result["success"],
            "available": result["success"],
            "eventCount": len(result["events"]),
            "errors": result["errors"],
            "error": result["errors"][0] if result["errors"] else None,
            "latencyMs": result["latencyMs"],
            **metrics,
        })

    return events, provider_status


def collect_events(symbol, as_of=None, providers=None, mode=None):
    events, _provider_status = collect_events_with_status(
        symbol,
        as_of=as_of,
        providers=providers,
        mode=mode,
    )
    return events


def is_within_window(event_time, as_of, hours):
    window = timedelta(hours=hours)
    return abs(event_time - as_of) <= window


def clamp_score(value, minimum=-100, maximum=100):
    return max(minimum, min(maximum, value))


def evaluate_events(events, as_of=None, sensitivity_multiplier=1):
    current_time = as_of or datetime.now()
    allow_trade = True
    confidence_adjustment = 0
    sentiment_score = 0
    reasons = []

    for event in events:
        sentiment_score += event.sentiment_score

        if event.event_type == "EARNINGS" and is_within_window(
            event.starts_at,
            current_time,
            48,
        ):
            allow_trade = False
            confidence_adjustment -= 30
            reasons.append(f"Blocked: earnings within 48h ({event.title}).")

        if event.event_type in {"MACRO", "FED"} and event.is_major:
            if is_within_window(event.starts_at, current_time, 72):
                confidence_adjustment -= 15
                reasons.append(f"Reduced confidence: major {event.event_type} event.")

        if event.sentiment_score > 0:
            confidence_adjustment += min(5, event.sentiment_score // 10)
            reasons.append(f"Positive catalyst: {event.title}.")

        if event.sentiment_score < 0:
            confidence_adjustment -= min(10, abs(event.sentiment_score) // 10)
            reasons.append(f"Negative catalyst: {event.title}.")

    sentiment_score = clamp_score(sentiment_score)
    confidence_adjustment = clamp_score(
        confidence_adjustment * float(sensitivity_multiplier),
        -50,
        10,
    )

    if not reasons:
        reasons.append("No blocking or confidence-adjusting events found.")

    return {
        "sentiment_score": sentiment_score,
        "confidence_adjustment": round(confidence_adjustment, 2),
        "allow_trade": allow_trade,
        "reasons": reasons,
    }


def serialize_event(event):
    return {
        "source": event.source,
        "event_type": event.event_type,
        "title": event.title,
        "starts_at": event.starts_at.isoformat(),
        "symbol": event.symbol,
        "sentiment_score": event.sentiment_score,
        "is_major": event.is_major,
    }


def evaluate_news_filter(
    symbol,
    as_of=None,
    providers=None,
    sensitivity_multiplier=1,
    mode=None,
):
    current_time = as_of or datetime.now()
    events, provider_status = collect_events_with_status(
        symbol,
        current_time,
        providers,
        mode=mode,
    )
    result = evaluate_events(
        events,
        current_time,
        sensitivity_multiplier=sensitivity_multiplier,
    )
    result["events"] = [serialize_event(event) for event in events]
    result["sensitivity_multiplier"] = sensitivity_multiplier
    result["provider_status"] = provider_status
    result["provider_unavailable"] = [
        status["provider"]
        for status in provider_status
        if not status.get("success")
    ]
    result["provider_conversion_failures"] = [
        {
            "provider": status["provider"],
            "errors": status["errors"],
        }
        for status in provider_status
        if status.get("success") and status.get("errors")
    ]
    result["news_provider_metrics"] = {
        status["provider"]: {
            "news_provider_success_rate": status["news_provider_success_rate"],
            "news_provider_failure_rate": status["news_provider_failure_rate"],
            "news_provider_latency": status["news_provider_latency"],
        }
        for status in provider_status
    }
    return result


if __name__ == "__main__":
    result = evaluate_news_filter("AAPL")

    print("\n--- News Filter ---")
    print("Sentiment Score:", result["sentiment_score"])
    print("Confidence Adjustment:", result["confidence_adjustment"])
    print("Allow Trade:", result["allow_trade"])
    print("Reasons:")
    for reason in result["reasons"]:
        print("-", reason)
