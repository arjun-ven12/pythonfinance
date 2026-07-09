from indicators import add_indicators
from market_data import get_historical_data


def detect_market_regime():
    df = get_historical_data("SPY", period="1y")
    df = add_indicators(df)

    latest = df.iloc[-1]

    close = float(latest["close"])
    ema_20 = float(latest["ema_20"])
    ema_50 = float(latest["ema_50"])
    volatility = float(latest["volatility_20"])

    if close > ema_20 and ema_20 > ema_50 and volatility < 0.03:
        return {
            "regime": "BULL_MARKET",
            "risk_multiplier": 1.0,
            "allow_new_buys": True,
        }

    if close < ema_50:
        return {
            "regime": "BEAR_MARKET",
            "risk_multiplier": 0.5,
            "allow_new_buys": False,
        }

    if volatility >= 0.03:
        return {
            "regime": "HIGH_VOLATILITY",
            "risk_multiplier": 0.5,
            "allow_new_buys": True,
        }

    return {
        "regime": "NEUTRAL_MARKET",
        "risk_multiplier": 0.75,
        "allow_new_buys": True,
    }