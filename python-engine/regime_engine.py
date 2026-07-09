def classify_regime(row):
    close = float(row.get("close", 0) or 0)
    ema_fast = float(row.get("ema_20", close) or close)
    ema_slow = float(row.get("ema_50", close) or close)
    volatility = float(row.get("volatility_20", 0) or 0)
    if ema_fast > ema_slow and volatility < 0.03:
        return "BULL_LOW_VOL"
    if ema_fast > ema_slow:
        return "BULL_HIGH_VOL"
    if abs(ema_fast - ema_slow) / max(close, 1) < 0.01:
        return "SIDEWAYS"
    if volatility >= 0.03:
        return "BEAR_HIGH_VOL"
    return "BEAR_LOW_VOL"


def summarize_trades_by_regime(trades):
    buckets = {}
    for trade in trades or []:
        regime = trade.get("market_regime") or trade.get("regime") or "UNKNOWN"
        bucket = buckets.setdefault(regime, {
            "regime": regime,
            "tradeCount": 0,
            "wins": 0,
            "losses": 0,
            "totalPnl": 0,
            "grossProfit": 0,
            "grossLoss": 0,
            "maxDrawdown": 0,
            "totalReturnPct": 0,
            "worstReturnPct": 0,
        })
        pnl = float(trade.get("pnl") or trade.get("profit") or 0)
        return_pct = float(trade.get("return_pct") or trade.get("returnPct") or 0)
        bucket["tradeCount"] += 1
        bucket["totalPnl"] += pnl
        bucket["totalReturnPct"] += return_pct
        if pnl >= 0:
            bucket["wins"] += 1
            bucket["grossProfit"] += pnl
        else:
            bucket["losses"] += 1
            bucket["grossLoss"] += abs(pnl)
            bucket["maxDrawdown"] = min(bucket["maxDrawdown"], pnl)
        bucket["worstReturnPct"] = min(bucket["worstReturnPct"], return_pct)
    for bucket in buckets.values():
        count = max(1, bucket["tradeCount"])
        bucket["expectancy"] = bucket["totalPnl"] / count
        bucket["winRate"] = (bucket["wins"] / count) * 100
        bucket["averageReturnPct"] = bucket["totalReturnPct"] / count
        bucket["returnPct"] = bucket["averageReturnPct"]
        bucket["drawdownPct"] = abs(bucket["worstReturnPct"])
        bucket["maxDrawdownPct"] = bucket["drawdownPct"]
        bucket["profitFactor"] = None if bucket["grossLoss"] == 0 else bucket["grossProfit"] / bucket["grossLoss"]
        bucket["strength"] = (
            "Strong"
            if bucket["winRate"] >= 55 and bucket["expectancy"] > 0
            else "Stable"
            if bucket["expectancy"] >= 0
            else "Weak"
        )
    return list(buckets.values())
