from strategy import generate_signal_from_row, normalize_confidence


def make_row(close, ema_20, ema_50, rsi_14, volatility_20):
    return {
        "close": close,
        "ema_20": ema_20,
        "ema_50": ema_50,
        "rsi_14": rsi_14,
        "volatility_20": volatility_20,
    }


def test_normalized_confidence_reaches_100():
    row = make_row(
        close=110,
        ema_20=100,
        ema_50=90,
        rsi_14=55,
        volatility_20=0.02,
    )

    result = generate_signal_from_row(row)

    assert result["confidence"] == 100
    assert result["signal"] == "BUY"


def test_confidence_uses_full_bucket_range():
    assert normalize_confidence(0) == 0
    assert normalize_confidence(40) == 50
    assert normalize_confidence(80) == 100


def test_mid_strength_setup_remains_hold():
    row = make_row(
        close=95,
        ema_20=100,
        ema_50=90,
        rsi_14=55,
        volatility_20=0.04,
    )

    result = generate_signal_from_row(row)

    assert result["confidence"] == 62.5
    assert result["signal"] == "HOLD"


if __name__ == "__main__":
    test_normalized_confidence_reaches_100()
    test_confidence_uses_full_bucket_range()
    test_mid_strength_setup_remains_hold()
    print("strategy tests passed")
