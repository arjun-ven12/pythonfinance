from regime import detect_market_regime

regime = detect_market_regime()

print("\n--- Market Regime ---")
print("Regime:", regime["regime"])
print("Risk Multiplier:", regime["risk_multiplier"])
print("Allow New Buys:", regime["allow_new_buys"])