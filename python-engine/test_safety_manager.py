from safety_manager import evaluate_trade_safety


def run_safety_check(**kwargs):
    return evaluate_trade_safety(
        proposed_order={
            "symbol": "AAPL",
            "side": "BUY",
            "quantity": 10,
            "entry_price": 100,
            "sector": "Technology",
        },
        current_portfolio_state={
            "portfolio_value": 100000,
            "positions": [],
            "weekly_realized_pl": kwargs.get("weekly_realized_pl", 0),
        },
        daily_realized_pl=kwargs.get("daily_realized_pl", 0),
        market_regime=kwargs.get(
            "market_regime",
            {"regime": "BULL_LOW_VOL", "allow_new_buys": True},
        ),
        safety_status={"emergency_kill_switch": False},
    )


def test_market_regime_blocks_new_buys():
    result = run_safety_check(
        market_regime={"regime": "RISK_OFF", "allow_new_buys": False}
    )

    assert result["allow_trade"] is False
    assert "Market regime disallows new buys." in result["violations"]
    assert result["risk_level"] == "HIGH"


def test_daily_loss_limit_blocks_trade():
    result = run_safety_check(daily_realized_pl=-4000)

    assert result["allow_trade"] is False
    assert "Max daily loss percentage exceeded." in result["violations"]


if __name__ == "__main__":
    test_market_regime_blocks_new_buys()
    test_daily_loss_limit_blocks_trade()
    print("safety manager tests passed")
