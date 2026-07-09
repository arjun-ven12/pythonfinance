from regime_engine import summarize_trades_by_regime
import json
from walk_forward_engine import build_mode_windows, calculate_summary
from walk_forward_engine import run_walk_forward


def test_walk_forward_summary_tracks_return_decay():
    summary = calculate_summary([
        {"phase": "TRAIN", "returnPct": 20, "sharpe": 1.2, "maxDrawdown": -8},
        {"phase": "VALIDATE", "returnPct": 10, "sharpe": 0.9, "maxDrawdown": -9},
        {"phase": "TEST", "returnPct": 5, "sharpe": 0.4, "maxDrawdown": -12},
    ])

    assert summary["isReturn"] == 15
    assert summary["oosReturn"] == 5
    assert summary["returnDecay"] == 10
    assert summary["stabilityScore"] > 0
    assert summary["outOfRegimeStability"]["pass"] is False


def test_regime_summary_calculates_expectancy_and_strength():
    regimes = summarize_trades_by_regime([
        {"pnl": 10, "return_pct": 5, "regime": "BULL_LOW_VOL"},
        {"pnl": -5, "return_pct": -2.5, "regime": "BULL_LOW_VOL"},
        {"pnl": 3, "return_pct": 1.25, "regime": "SIDEWAYS"},
    ])

    bull = next(item for item in regimes if item["regime"] == "BULL_LOW_VOL")
    assert bull["tradeCount"] == 2
    assert bull["expectancy"] == 2.5
    assert bull["profitFactor"] == 2
    assert bull["returnPct"] == 1.25
    assert bull["drawdownPct"] == 2.5


def test_walk_forward_modes_generate_distinct_window_sequences():
    base = {
        "trainStart": "2020-01-01",
        "trainEnd": "2020-12-31",
        "validateStart": "2021-01-01",
        "validateEnd": "2021-06-30",
        "testStart": "2021-07-01",
        "testEnd": "2022-12-31",
    }

    anchored = build_mode_windows({**base, "mode": "ANCHORED"})
    rolling = build_mode_windows({**base, "mode": "ROLLING"})
    window_shift = build_mode_windows({**base, "mode": "WINDOW_SHIFT"})

    assert len(anchored) != len(window_shift)
    assert anchored[0]["startDate"] == rolling[0]["startDate"]
    assert rolling[3]["startDate"] != anchored[2]["startDate"]


def test_walk_forward_output_is_json_serializable(monkeypatch):
    def fake_run_backtest(*_args, **_kwargs):
        return {
            "total_return_pct": 1.0,
            "sharpe_ratio": 0.5,
            "max_drawdown_pct": -2.0,
            "completed_trades": 3,
        }

    monkeypatch.setattr("walk_forward_engine.run_backtest", fake_run_backtest)

    payload = {
        "symbol": "AAPL",
        "mode": "ANCHORED",
        "trainStart": "2020-01-01",
        "trainEnd": "2020-01-10",
        "validateStart": "2020-01-11",
        "validateEnd": "2020-01-20",
        "testStart": "2020-01-21",
        "testEnd": "2020-01-30",
    }

    result = run_walk_forward(payload)
    assert json.dumps(result)
