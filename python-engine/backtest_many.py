from backtest import run_backtest

symbols = ["AAPL", "MSFT", "NVDA", "AMD", "TSLA", "GOOGL", "META", "SPY", "QQQ"]

initial_cash = 1000
period = "2y"
risk_per_trade = 0.02

results = []

for symbol in symbols:
    try:
        result = run_backtest(symbol, initial_cash, period, risk_per_trade)
        results.append(result)
    except Exception as e:
        print(f"Error testing {symbol}: {e}")

print("\n--- Multi-Symbol Backtest ---")

for result in results:
    print(
        result["symbol"],
        "| Strategy Return:",
        result["total_return_pct"],
        "% | Buy & Hold:",
        result["buy_and_hold_return_pct"],
        "% | Win Rate:",
        result["win_rate_pct"],
        "% | Drawdown:",
        result["max_drawdown_pct"],
        "% | Trades:",
        result["completed_trades"],
    )

avg_return = sum(r["total_return_pct"] for r in results) / len(results)
avg_buy_hold = sum(r["buy_and_hold_return_pct"] for r in results) / len(results)
avg_drawdown = sum(r["max_drawdown_pct"] for r in results) / len(results)
avg_win_rate = sum(r["win_rate_pct"] for r in results) / len(results)

beat_buy_hold = sum(
    1 for r in results
    if r["total_return_pct"] > r["buy_and_hold_return_pct"]
)

print("\n--- Summary ---")
print("Average Strategy Return:", round(avg_return, 2), "%")
print("Average Buy & Hold Return:", round(avg_buy_hold, 2), "%")
print("Average Drawdown:", round(avg_drawdown, 2), "%")
print("Average Win Rate:", round(avg_win_rate, 2), "%")
print("Beat Buy & Hold:", beat_buy_hold, "/", len(results))