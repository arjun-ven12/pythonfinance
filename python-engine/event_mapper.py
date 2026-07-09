from dataclasses import dataclass
from datetime import datetime


@dataclass
class Event:
    source: str
    event_type: str
    title: str
    starts_at: datetime
    symbol: str | None = None
    sentiment_score: int = 0
    is_major: bool = False


def map_finnhub_article_to_event(
    article,
    symbol,
    sentiment_estimator,
    major_article_detector,
):
    if not isinstance(article, dict):
        raise ValueError("article must be an object")

    timestamp = article.get("datetime")
    if timestamp in (None, ""):
        raise ValueError("article datetime is missing")

    try:
        starts_at = datetime.fromtimestamp(int(timestamp))
    except (TypeError, ValueError, OSError) as error:
        raise ValueError("article datetime is invalid") from error

    title = str(article.get("headline") or article.get("summary") or "").strip()
    if not title:
        raise ValueError("article headline and summary are missing")

    summary = str(article.get("summary") or "")
    return Event(
        source=f"finnhub:{article.get('source') or 'unknown'}",
        event_type="COMPANY_NEWS",
        title=title,
        starts_at=starts_at,
        symbol=symbol,
        sentiment_score=sentiment_estimator(f"{title} {summary}"),
        is_major=major_article_detector(title, summary),
    )
