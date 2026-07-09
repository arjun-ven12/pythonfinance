MAX_RAW_SCORE = 80
BUY_CONFIDENCE_THRESHOLD = 70
SELL_CONFIDENCE_THRESHOLD = 30


def normalize_confidence(score, max_score=MAX_RAW_SCORE):
    if max_score <= 0:
        return 0

    normalized = (score / max_score) * 100
    return round(max(0, min(normalized, 100)), 2)


def generate_signal_from_row(row):
    close = row["close"]
    ema_20 = row["ema_20"]
    ema_50 = row["ema_50"]
    rsi = row["rsi_14"]
    volatility = row["volatility_20"]

    score = 0
    reasons = []

    if ema_20 > ema_50:
        score += 30
        reasons.append("Bullish trend: EMA20 > EMA50")

    if close > ema_20:
        score += 20
        reasons.append("Price above EMA20")

    if 30 <= rsi <= 65:
        score += 20
        reasons.append("RSI healthy")
    elif rsi > 70:
        reasons.append("RSI overbought")
    elif rsi < 30:
        score += 10
        reasons.append("RSI oversold")

    if volatility < 0.03:
        score += 10
        reasons.append("Volatility controlled")

    confidence = normalize_confidence(score)

    if confidence >= BUY_CONFIDENCE_THRESHOLD:
        signal = "BUY"
    elif confidence <= SELL_CONFIDENCE_THRESHOLD:
        signal = "SELL"
    else:
        signal = "HOLD"

    return {
        "signal": signal,
        "confidence": confidence,
        "reasons": reasons
    }
