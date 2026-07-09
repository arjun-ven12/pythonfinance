from indicators import add_indicators
from market_data import get_historical_data


VIX_SYMBOL = "^VIX"
TEN_YEAR_YIELD_SYMBOL = "^TNX"
INFLATION_PROXY_SYMBOL = "TIP"


def get_latest_close(symbol, period="1y"):
    df = get_historical_data(symbol, period=period)
    return float(df.iloc[-1]["close"])


def get_spy_trend():
    df = get_historical_data("SPY", period="1y")
    df = add_indicators(df)
    latest = df.iloc[-1]

    close = float(latest["close"])
    ema_20 = float(latest["ema_20"])
    ema_50 = float(latest["ema_50"])

    return {
        "close": close,
        "ema_20": ema_20,
        "ema_50": ema_50,
        "is_bullish": close > ema_20 and ema_20 > ema_50,
        "is_bearish": close < ema_50,
    }


def get_volatility_state(vix_value=None):
    vix = vix_value if vix_value is not None else get_latest_close(VIX_SYMBOL)

    return {
        "vix": vix,
        "is_high_volatility": vix >= 25,
        "is_extreme_volatility": vix >= 35,
    }


def get_yield_state(yield_value=None):
    ten_year_yield = (
        yield_value
        if yield_value is not None
        else get_latest_close(TEN_YEAR_YIELD_SYMBOL) / 10
    )

    return {
        "ten_year_yield": ten_year_yield,
        "is_restrictive": ten_year_yield >= 4.5,
        "is_stress": ten_year_yield >= 5,
    }


def get_inflation_state(period="1y"):
    df = get_historical_data(INFLATION_PROXY_SYMBOL, period=period)
    df = add_indicators(df)
    latest = df.iloc[-1]

    close = float(latest["close"])
    ema_50 = float(latest["ema_50"])

    return {
        "inflation_proxy": INFLATION_PROXY_SYMBOL,
        "close": close,
        "ema_50": ema_50,
        "is_inflation_pressure": close > ema_50,
    }


def build_regime_response(
    regime_name,
    risk_multiplier,
    allowed_strategy_types,
    allow_new_buys,
    diagnostics,
):
    return {
        "regime_name": regime_name,
        "risk_multiplier": risk_multiplier,
        "allowed_strategy_types": allowed_strategy_types,
        "allow_new_buys": allow_new_buys,
        "diagnostics": diagnostics,
    }


def classify_macro_regime(spy_trend, volatility, yield_state, inflation_state):
    risk_off = (
        volatility["is_extreme_volatility"]
        or yield_state["is_stress"]
        or (
            spy_trend["is_bearish"]
            and volatility["is_high_volatility"]
            and inflation_state["is_inflation_pressure"]
        )
    )

    diagnostics = {
        "spy": spy_trend,
        "volatility": volatility,
        "yield": yield_state,
        "inflation": inflation_state,
    }

    if risk_off:
        return build_regime_response(
            regime_name="RISK_OFF",
            risk_multiplier=0.25,
            allowed_strategy_types=["DEFENSIVE", "CASH", "HEDGE"],
            allow_new_buys=False,
            diagnostics=diagnostics,
        )

    if spy_trend["is_bullish"] and volatility["is_high_volatility"]:
        return build_regime_response(
            regime_name="BULL_HIGH_VOL",
            risk_multiplier=0.75,
            allowed_strategy_types=["MOMENTUM", "BREAKOUT", "DEFENSIVE"],
            allow_new_buys=True,
            diagnostics=diagnostics,
        )

    if spy_trend["is_bullish"]:
        return build_regime_response(
            regime_name="BULL_LOW_VOL",
            risk_multiplier=1.0,
            allowed_strategy_types=["MOMENTUM", "TREND", "BREAKOUT"],
            allow_new_buys=True,
            diagnostics=diagnostics,
        )

    if volatility["is_high_volatility"]:
        return build_regime_response(
            regime_name="BEAR_HIGH_VOL",
            risk_multiplier=0.4,
            allowed_strategy_types=["DEFENSIVE", "MEAN_REVERSION", "CASH"],
            allow_new_buys=False,
            diagnostics=diagnostics,
        )

    return build_regime_response(
        regime_name="BEAR_LOW_VOL",
        risk_multiplier=0.6,
        allowed_strategy_types=["DEFENSIVE", "MEAN_REVERSION"],
        allow_new_buys=True,
        diagnostics=diagnostics,
    )


def detect_macro_regime():
    spy_trend = get_spy_trend()
    volatility = get_volatility_state()
    yield_state = get_yield_state()
    inflation_state = get_inflation_state()

    return classify_macro_regime(
        spy_trend=spy_trend,
        volatility=volatility,
        yield_state=yield_state,
        inflation_state=inflation_state,
    )


if __name__ == "__main__":
    regime = detect_macro_regime()

    print("\n--- Macro Regime ---")
    print("Regime:", regime["regime_name"])
    print("Risk Multiplier:", regime["risk_multiplier"])
    print("Allowed Strategy Types:", ", ".join(regime["allowed_strategy_types"]))
    print("Allow New Buys:", regime["allow_new_buys"])
