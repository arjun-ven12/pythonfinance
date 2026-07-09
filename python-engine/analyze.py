from indicators import add_indicators
from market_data import get_historical_data
from strategy import generate_signal

symbol = input("Enter stock symbol: ").upper()
account_size = float(input("Account size: "))
risk_per_trade = float(input("Risk per trade, e.g. 0.01 for 1%: "))

df = get_historical_data(symbol)
df = add_indicators(df)
analysis = generate_signal(df, account_size, risk_per_trade)

print("\n--- Analysis Result ---")
for key, value in analysis.items():
    if key != "reasons":
        print(f"{key}: {value}")

print("\nReasons:")
for reason in analysis["reasons"]:
    print("-", reason)