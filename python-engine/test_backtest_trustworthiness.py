import unittest
from unittest.mock import patch

import pandas as pd

import backtest
from test_strategy_interpreter import build_strategy_json


def make_prices():
    dates = pd.date_range("2025-01-01", periods=55, freq="D")
    rows = []

    for index, date in enumerate(dates):
        close = 100.0
        rows.append({
            "date": date,
            "open": close,
            "high": close + 0.5,
            "low": close - 0.5,
            "close": close,
            "ema_20": 101.0,
            "ema_50": 100.0,
            "rsi_14": 50.0,
            "atr_14": 1.0,
            "volatility_20": 0.01,
            "test_signal": "BUY" if index == 50 else "HOLD",
        })

    return pd.DataFrame(rows)


def fake_signal(row, _config=None, context=None):
    return {
        "signal": row["test_signal"],
        "confidence": 80,
        "reasons": ["test signal"],
    }


class BacktestTrustworthinessTests(unittest.TestCase):
    def run_with_prices(self, prices, benchmark=None, **kwargs):
        benchmark = benchmark if benchmark is not None else prices.copy()
        horizon_profile = kwargs.pop(
            "horizon_profile",
            {
                "stop_loss_atr_multiple": 1.5,
                "take_profit_atr_multiple": 8,
                "trailing_stop_atr_multiple": 2,
            },
        )

        def load_prices(symbol, **_load_kwargs):
            if symbol == "SPY":
                if isinstance(benchmark, Exception):
                    raise benchmark
                return benchmark.copy()
            return prices.copy()

        with (
            patch.object(backtest, "get_historical_data", side_effect=load_prices),
            patch.object(backtest, "add_indicators", side_effect=lambda frame, _config=None: frame),
            patch.object(
                backtest,
                "generate_research_signal_from_row",
                side_effect=fake_signal,
            ),
        ):
            return backtest.run_backtest(
                "TEST",
                initial_cash=10000,
                fee_per_trade=0,
                horizon_profile=horizon_profile,
                **kwargs,
            )

    def test_signal_executes_on_next_bar_open(self):
        prices = make_prices()
        prices.loc[50, ["open", "close"]] = [99.0, 100.0]
        prices.loc[51, ["open", "high", "low", "close"]] = [110.0, 110.5, 109.5, 110.0]

        result = self.run_with_prices(prices)
        buy = next(trade for trade in result["trades"] if trade["type"] == "BUY")

        self.assertEqual(buy["signal_date"], str(prices.loc[50, "date"]))
        self.assertEqual(buy["date"], str(prices.loc[51, "date"]))
        self.assertEqual(buy["price"], 110.0)

    def test_gap_through_stop_uses_open_price(self):
        prices = make_prices()
        prices.loc[51, ["open", "high", "low", "close"]] = [100.0, 100.5, 99.5, 100.0]
        prices.loc[52, ["open", "high", "low", "close"]] = [90.0, 91.0, 89.0, 90.0]

        result = self.run_with_prices(prices)
        completed = result["completed_trade_log"]

        self.assertEqual(completed[0]["exit_reason"], "STOP_LOSS")
        self.assertEqual(completed[0]["exit_price"], 90.0)

    def test_take_profit_uses_intraday_high(self):
        prices = make_prices()
        prices.loc[51, ["open", "high", "low", "close"]] = [100.0, 103.0, 99.5, 101.0]

        result = self.run_with_prices(
            prices,
            horizon_profile={
                "stop_loss_atr_multiple": 1.5,
                "take_profit_atr_multiple": 2,
                "trailing_stop_atr_multiple": 2,
            },
        )

        self.assertEqual(result["completed_trade_log"][0]["exit_reason"], "TAKE_PROFIT")
        self.assertEqual(result["completed_trade_log"][0]["exit_price"], 102.0)

    def test_trade_count_matches_trade_log(self):
        prices = make_prices()
        prices.loc[52, ["open", "high", "low", "close"]] = [90.0, 91.0, 89.0, 90.0]

        result = self.run_with_prices(prices)

        self.assertEqual(
            result["completed_trades"],
            len(result["completed_trade_log"]),
        )

    def test_benchmark_failure_is_explicit(self):
        result = self.run_with_prices(
            make_prices(),
            benchmark=ValueError("benchmark unavailable"),
        )

        self.assertIsNone(result["benchmark_return_pct"])
        self.assertTrue(result["benchmarkUnavailable"])
        self.assertEqual(result["benchmark_curve"], [])

    def test_open_position_is_marked_open(self):
        result = self.run_with_prices(make_prices())

        self.assertEqual(result["open_positions_count"], 1)
        self.assertEqual(result["open_position"]["status"], "OPEN")
        self.assertEqual(result["completed_trades"], 0)

    def test_strategy_json_rule_change_changes_backtest_trades(self):
        prices = make_prices()
        prices["test_signal"] = "HOLD"
        prices.loc[50, ["ema_20", "ema_50", "rsi_14"]] = [105.0, 100.0, 55.0]
        prices.loc[51, ["open", "high", "low", "close"]] = [101.0, 102.0, 100.5, 101.5]
        restrictive_strategy = build_strategy_json(
            entry_rules=[
                {
                    "operator": "AND",
                    "children": [
                        {"indicator": "EMA_FAST", "comparator": ">", "value": 100},
                        {"indicator": "RSI", "comparator": "<", "value": 50},
                    ],
                }
            ]
        )
        permissive_strategy = build_strategy_json(
            entry_rules=[
                {
                    "operator": "AND",
                    "children": [
                        {"indicator": "EMA_FAST", "comparator": ">", "value": 100},
                        {"indicator": "RSI", "comparator": "<", "value": 60},
                    ],
                }
            ]
        )

        def load_prices(symbol, **_load_kwargs):
            return prices.copy()

        with (
            patch.object(backtest, "get_historical_data", side_effect=load_prices),
            patch.object(backtest, "add_indicators", side_effect=lambda frame, _config=None: frame),
        ):
            restrictive_result = backtest.run_backtest(
                "TEST",
                initial_cash=10000,
                fee_per_trade=0,
                horizon_profile={
                    "stop_loss_atr_multiple": 1.5,
                    "take_profit_atr_multiple": 8,
                    "trailing_stop_atr_multiple": 2,
                },
                strategy_config={"strategyJson": restrictive_strategy},
            )
            permissive_result = backtest.run_backtest(
                "TEST",
                initial_cash=10000,
                fee_per_trade=0,
                horizon_profile={
                    "stop_loss_atr_multiple": 1.5,
                    "take_profit_atr_multiple": 8,
                    "trailing_stop_atr_multiple": 2,
                },
                strategy_config={"strategyJson": permissive_strategy},
            )

        self.assertEqual(len(restrictive_result["trades"]), 0)
        self.assertGreater(len(permissive_result["trades"]), 0)
        self.assertTrue(
            permissive_result["trades"][0]["reasons"][1].startswith("RSI < 60")
        )
        self.assertEqual(
            permissive_result["trades"][0]["decision_snapshot"][
                "indicatorContributions"
            ][1]["indicator"],
            "RSI",
        )
        self.assertIn(
            "RSI < 60",
            permissive_result["trades"][0]["decision_snapshot"]["entryReason"],
        )

    def test_strategy_json_default_exit_rules_drive_take_profit(self):
        prices = make_prices()
        prices.loc[51, ["open", "high", "low", "close"]] = [100.0, 103.0, 99.5, 101.0]
        strategy_json = build_strategy_json(
            entry_rules=[
                {
                    "operator": "AND",
                    "children": [
                        {
                            "indicator": "EMA_FAST",
                            "comparator": ">",
                            "value": {"kind": "indicator", "indicator": "EMA_SLOW"},
                        }
                    ],
                }
            ]
        )
        strategy_json["executable"]["parameters"]["atrTakeProfitMultiple"] = 2
        strategy_json["executable"]["exitRules"] = [
            {"indicator": "ATR", "comparator": "STOP_LOSS_ATR", "value": 1.5},
            {"indicator": "ATR", "comparator": "TAKE_PROFIT_ATR", "value": 2},
            {"indicator": "ATR", "comparator": "TRAILING_STOP_ATR", "value": 2},
            {"indicator": "SIGNAL_STATE", "comparator": "==", "value": "SELL"},
        ]

        def load_prices(_symbol, **_load_kwargs):
            return prices.copy()

        with (
            patch.object(backtest, "get_historical_data", side_effect=load_prices),
            patch.object(backtest, "add_indicators", side_effect=lambda frame, _config=None: frame),
        ):
            result = backtest.run_backtest(
                "TEST",
                initial_cash=10000,
                fee_per_trade=0,
                strategy_config={"strategyJson": strategy_json},
            )

        self.assertEqual(result["completed_trade_log"][0]["exit_reason"], "TAKE_PROFIT")

    def test_multi_asset_backtest_uses_shared_capital(self):
        prices = make_prices()
        prices.loc[51, ["open", "high", "low", "close"]] = [100.0, 103.0, 99.5, 101.0]
        alt_prices = prices.copy()
        alt_prices.loc[51, ["open", "high", "low", "close"]] = [102.0, 106.0, 101.0, 105.0]
        alt_prices.loc[50, "test_signal"] = "BUY"
        strategy_json = build_strategy_json(
            entry_rules=[
                {
                    "operator": "AND",
                    "children": [
                        {
                            "indicator": "EMA_FAST",
                            "comparator": ">",
                            "value": {"kind": "indicator", "indicator": "EMA_SLOW"},
                        }
                    ],
                }
            ]
        )

        def load_prices(symbol, **_kwargs):
            return prices.copy() if symbol == "AAA" else alt_prices.copy()

        with (
            patch.object(backtest, "get_historical_data", side_effect=load_prices),
            patch.object(backtest, "add_indicators", side_effect=lambda frame, _config=None: frame),
        ):
            result = backtest.run_multi_asset_backtest(
                ["AAA", "BBB"],
                initial_cash=10000,
                fee_per_trade=0,
                strategy_config={"strategyJson": strategy_json},
            )

        buy_trades = [trade for trade in result["trades"] if trade["type"] == "BUY"]
        self.assertEqual(result["is_multi_symbol"], True)
        self.assertGreaterEqual(len(buy_trades), 1)
        self.assertGreaterEqual(result["open_positions_count"], 0)
        self.assertLessEqual(result["average_exposure_pct"], 100)


if __name__ == "__main__":
    unittest.main()
