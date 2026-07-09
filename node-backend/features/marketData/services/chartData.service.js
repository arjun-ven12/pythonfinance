function createChartDataService({
  appendOutput,
  getPythonPath,
  parseJsonOutput,
  pythonEngineDir,
  spawn,
}) {
  function getChartPeriod(value) {
    const period = String(value || "1y");
    const allowedPeriods = new Set(["1mo", "3mo", "6mo", "1y", "2y", "5y"]);
    return allowedPeriods.has(period) ? period : "1y";
  }

  function runChartData(symbol, period = "1y") {
    return new Promise((resolve, reject) => {
      const script = [
        "import json, math, sys",
        "from indicators import add_indicators",
        "from market_data import get_historical_data",
        "from strategy import generate_signal_from_row",
        "from trade_rules import calculate_trailing_stop, should_exit_position",
        "symbol = sys.argv[1]",
        "period = sys.argv[2]",
        "df = add_indicators(get_historical_data(symbol, period=period))",
        "def clean(value):",
        "    try:",
        "        number = float(value)",
        "        return round(number, 4) if math.isfinite(number) else None",
        "    except Exception:",
        "        return None",
        "candles, ema20, ema50, markers, trailing = [], [], [], [], []",
        "shares = 0",
        "stop_loss = 0",
        "trailing_stop = None",
        "for i in range(len(df)):",
        "    row = df.iloc[i]",
        "    date = str(row['date'].date() if hasattr(row['date'], 'date') else row['date'])",
        "    close = clean(row['close'])",
        "    high = clean(row['high'])",
        "    low = clean(row['low'])",
        "    candle = {",
        "        'time': date,",
        "        'open': clean(row['open']),",
        "        'high': high,",
        "        'low': low,",
        "        'close': close,",
        "        'volume': clean(row.get('volume')),",
        "    }",
        "    if all(candle[key] is not None for key in ['open', 'high', 'low', 'close']):",
        "        candles.append(candle)",
        "    ema_20 = clean(row.get('ema_20'))",
        "    ema_50 = clean(row.get('ema_50'))",
        "    atr = clean(row.get('atr_14'))",
        "    if ema_20 is not None:",
        "        ema20.append({'time': date, 'value': ema_20})",
        "    if ema_50 is not None:",
        "        ema50.append({'time': date, 'value': ema_50})",
        "    if i < 50 or close is None or atr is None:",
        "        continue",
        "    signal_data = generate_signal_from_row(row)",
        "    signal = signal_data['signal']",
        "    if shares > 0:",
        "        trailing_stop = calculate_trailing_stop(close, atr, trailing_stop)",
        "        trailing.append({'time': date, 'value': clean(trailing_stop)})",
        "        should_exit, exit_reason = should_exit_position(row, close, stop_loss, signal, trailing_stop)",
        "        if should_exit:",
        "            markers.append({'time': date, 'position': 'aboveBar', 'color': '#ff6b6b', 'shape': 'arrowDown', 'text': exit_reason or 'SELL'})",
        "            shares = 0",
        "            stop_loss = 0",
        "            trailing_stop = None",
        "            continue",
        "    if shares == 0 and signal == 'BUY':",
        "        shares = 1",
        "        stop_loss = close - (2 * atr)",
        "        trailing_stop = calculate_trailing_stop(close, atr)",
        "        trailing.append({'time': date, 'value': clean(trailing_stop)})",
        "        markers.append({'time': date, 'position': 'belowBar', 'color': '#4cc38a', 'shape': 'arrowUp', 'text': 'BUY'})",
        "    elif signal == 'SELL':",
        "        markers.append({'time': date, 'position': 'aboveBar', 'color': '#ff6b6b', 'shape': 'arrowDown', 'text': 'SELL'})",
        "volume = [{'time': candle['time'], 'value': candle.get('volume') or 0, 'color': '#263242'} for candle in candles]",
        "print(json.dumps({'symbol': symbol, 'period': period, 'candles': candles, 'volume': volume, 'ema20': ema20, 'ema50': ema50, 'markers': markers, 'trailing_stop': trailing}))",
      ].join("\n");
      const child = spawn(getPythonPath(), ["-c", script, symbol, period], {
        cwd: pythonEngineDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr = appendOutput(stderr, chunk);
      });

      child.on("error", reject);

      child.on("close", (code) => {
        if (code !== 0) {
          const error = new Error("Chart data fetch failed.");
          error.details = { code, stdout, stderr };
          reject(error);
          return;
        }

        try {
          resolve(parseJsonOutput(stdout));
        } catch (error) {
          error.details = { stdout, stderr };
          reject(error);
        }
      });
    });
  }

  return {
    getChartPeriod,
    runChartData,
  };
}

module.exports = createChartDataService;
