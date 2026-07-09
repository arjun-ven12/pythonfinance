def add_indicators(df, config=None):
    config = config or {}
    ema_fast = int(config.get("ema_fast", 20))
    ema_slow = int(config.get("ema_slow", 50))
    rsi_period = int(config.get("rsi_period", 14))
    atr_period = int(config.get("atr_period", 14))
    volatility_period = int(config.get("volatility_period", 20))

    df["ema_20"] = df["close"].ewm(span=ema_fast, adjust=False).mean()
    df["ema_50"] = df["close"].ewm(span=ema_slow, adjust=False).mean()

    delta = df["close"].diff()
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)

    avg_gain = gain.rolling(rsi_period).mean()
    avg_loss = loss.rolling(rsi_period).mean()

    rs = avg_gain / avg_loss
    df["rsi_14"] = 100 - (100 / (1 + rs))

    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift()).abs()
    low_close = (df["low"] - df["close"].shift()).abs()

    true_range = high_low.combine(high_close, max).combine(low_close, max)
    df["atr_14"] = true_range.rolling(atr_period).mean()

    df["daily_return"] = df["close"].pct_change()
    df["volatility_20"] = df["daily_return"].rolling(volatility_period).std()
    df["volume_sma_20"] = df["volume"].rolling(20).mean()
    df["rolling_high_20"] = df["high"].rolling(20).max().shift(1)

    ema_12 = df["close"].ewm(span=12, adjust=False).mean()
    ema_26 = df["close"].ewm(span=26, adjust=False).mean()
    df["macd_line"] = ema_12 - ema_26
    df["macd_signal"] = df["macd_line"].ewm(span=9, adjust=False).mean()
    df["macd_histogram"] = df["macd_line"] - df["macd_signal"]

    return df
