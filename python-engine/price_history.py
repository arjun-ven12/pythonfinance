import json
import sys

import pandas as pd

from market_data import get_historical_data


def to_number(value):
    try:
        number = float(value)
        if pd.isna(number):
            return None
        return round(number, 4)
    except Exception:
        return None


def main():
    if len(sys.argv) < 5:
        print(json.dumps({"error": "Usage: price_history.py <symbol> <range> <market> <interval>"}))
        sys.exit(1)

    symbol = sys.argv[1]
    history_range = sys.argv[2]
    market = sys.argv[3]
    interval = sys.argv[4]

    range_to_period = {
        "1D": "1d",
        "5D": "5d",
        "1M": "1mo",
        "3M": "3mo",
        "6M": "6mo",
        "1Y": "1y",
    }
    period = range_to_period.get(history_range, "1mo")

    df = get_historical_data(symbol, period=period, interval=interval)

    points = []
    for _, row in df.iterrows():
        timestamp_value = row.get("date")
        if hasattr(timestamp_value, "isoformat"):
            timestamp = timestamp_value.isoformat()
        else:
            timestamp = str(timestamp_value)

        points.append(
            {
                "timestamp": timestamp,
                "open": to_number(row.get("open")),
                "high": to_number(row.get("high")),
                "low": to_number(row.get("low")),
                "close": to_number(row.get("close")),
                "volume": int(row.get("volume") or 0),
            }
        )

    payload = {
        "symbol": symbol,
        "market": market,
        "currency": "SGD" if market == "SG" else "USD",
        "range": history_range,
        "interval": interval,
        "lastUpdated": points[-1]["timestamp"] if points else None,
        "points": points,
        "chartUnavailable": len(points) == 0,
        "providerWarning": "Yahoo Finance data may be delayed/best-effort and is not a broker execution guarantee.",
    }
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
