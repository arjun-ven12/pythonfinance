import unittest
from unittest.mock import patch

import pandas as pd

import matrix_replay


def make_prices():
    dates = pd.date_range("2025-01-01", periods=55, freq="D")
    rows = []

    for index, date in enumerate(dates):
        if index == 50:
            ema_fast, ema_slow = 101.0, 100.0
        elif index == 51:
            ema_fast, ema_slow = 99.0, 100.0
        else:
            ema_fast = ema_slow = 100.0

        close = 110.0 if index == 54 else 100.0
        rows.append(
            {
                "date": date,
                "open": close,
                "high": close + 0.5,
                "low": close - 0.5,
                "close": close,
                "ema_20": ema_fast,
                "ema_50": ema_slow,
                "rsi_14": 50.0,
                "atr_14": 1.0,
                "volatility_20": 0.01,
                "volume": 1000000,
                "volume_sma_20": 900000,
            }
        )

    return pd.DataFrame(rows)


def build_strategy(strategy_version_id, name):
    return {
        "key": strategy_version_id,
        "experimentId": strategy_version_id.replace("ver", "exp"),
        "strategyVersionId": strategy_version_id,
        "version": int(strategy_version_id.replace("ver", "")),
        "name": name,
        "status": "ACTIVE",
        "allocationPct": 50,
        "strategyJson": {
            "schemaVersion": "strategy-json/v1",
            "metadata": {"template": "Momentum"},
            "executable": {
                "entryRules": [
                    {
                        "operator": "AND",
                        "children": [
                            {"indicator": "EMA_FAST", "comparator": ">", "value": 100},
                        ],
                    }
                ],
                "exitRules": [],
                "positionSizing": {
                    "method": "risk_per_trade",
                    "riskPerTrade": 0.5,
                    "previewCapital": 50000,
                },
                "riskRules": [],
                "filters": {},
                "execution": {},
                "validation": {},
                "parameters": {
                    "atrStopMultiple": 1.5,
                    "atrTakeProfitMultiple": 8,
                    "trailingStopAtrMultiple": 2,
                    "signalThreshold": 20,
                },
                "envelope": {
                    "sectors": ["Technology"],
                    "regimes": ["BULL_LOW_VOL", "BEAR_LOW_VOL"],
                },
                "regimeOverlays": {},
            },
        },
    }


class MatrixReplayTests(unittest.TestCase):
    def run_replay(self, matrix_cells, strategies, signal_rule):
        prices = make_prices()

        def load_prices(symbol, **_kwargs):
            return prices.copy()

        def signal(row, strategy_config=None, context=None):
            return signal_rule(row, strategy_config or {}, context or {})

        with (
            patch.object(matrix_replay, "get_historical_data", side_effect=load_prices),
            patch.object(matrix_replay, "add_indicators", side_effect=lambda frame, _config=None: frame),
            patch.object(matrix_replay, "get_symbol_metadata", return_value={
                "sector": "Technology",
                "industry": "Software",
                "company_name": "Test",
                "is_us": True,
                "is_sgx": False,
            }),
            patch.object(matrix_replay, "generate_research_signal_from_row", side_effect=signal),
            patch.object(matrix_replay, "determine_position_size", return_value=(1000, False)),
            patch.object(matrix_replay, "evaluate_long_intraday_exit", return_value=(False, None, None)),
        ):
            return matrix_replay.run_matrix_replay(
                {
                    "deployment": {
                        "deploymentSetId": "deployment-1",
                        "deploymentVersionId": "deployment-1",
                        "matrix": {
                            "cells": matrix_cells,
                        },
                    },
                    "strategies": strategies,
                    "symbols": ["AAPL"],
                    "period": "2y",
                    "initialCash": 100000,
                }
            )

    def test_matrix_routing_changes_by_regime(self):
        strategies = [
            build_strategy("ver1", "Bull Strategy"),
            build_strategy("ver2", "Bear Strategy"),
        ]
        matrix_cells = [
            {
                "key": "Technology::BULL_LOW_VOL",
                "sector": "Technology",
                "regime": "BULL_LOW_VOL",
                "selectedExperimentId": "exp1",
                "selectedStrategyVersionId": "ver1",
                "allocationPct": 50,
                "status": "ACTIVE",
            },
            {
                "key": "Technology::BEAR_LOW_VOL",
                "sector": "Technology",
                "regime": "BEAR_LOW_VOL",
                "selectedExperimentId": "exp2",
                "selectedStrategyVersionId": "ver2",
                "allocationPct": 50,
                "status": "ACTIVE",
            },
        ]

        def signal(row, strategy_config=None, _context=None):
            if row["date"] == make_prices().iloc[50]["date"] and strategy_config.get("strategyVersionId") == "ver1":
                return {"signal": "BUY", "confidence": 80, "reasons": ["bull route"]}
            if row["date"] == make_prices().iloc[51]["date"] and strategy_config.get("strategyVersionId") == "ver2":
                return {"signal": "BUY", "confidence": 80, "reasons": ["bear route"]}
            return {"signal": "HOLD", "confidence": 10, "reasons": []}

        result = self.run_replay(matrix_cells, strategies, signal)

        routed = [event for event in result["routing_events"] if event["timestamp"]]
        self.assertEqual(routed[0]["selectedStrategy"], "Bull Strategy")
        self.assertEqual(routed[1]["selectedStrategy"], "Bear Strategy")

    def test_allocation_caps_change_position_size(self):
        strategies = [build_strategy("ver1", "Bull Strategy")]
        matrix_low = [{
            "key": "Technology::BULL_LOW_VOL",
            "sector": "Technology",
            "regime": "BULL_LOW_VOL",
            "selectedExperimentId": "exp1",
            "selectedStrategyVersionId": "ver1",
            "allocationPct": 25,
            "status": "ACTIVE",
        }]
        matrix_high = [{
            "key": "Technology::BULL_LOW_VOL",
            "sector": "Technology",
            "regime": "BULL_LOW_VOL",
            "selectedExperimentId": "exp1",
            "selectedStrategyVersionId": "ver1",
            "allocationPct": 50,
            "status": "ACTIVE",
        }]

        def signal(row, strategy_config=None, context=None):
            if row["date"] == make_prices().iloc[50]["date"]:
                return {"signal": "BUY", "confidence": 80, "reasons": ["route"]}
            return {"signal": "HOLD", "confidence": 10, "reasons": []}

        low = self.run_replay(matrix_low, strategies, signal)
        high = self.run_replay(matrix_high, strategies, signal)

        self.assertLess(low["completed_trade_log"][0]["shares"], high["completed_trade_log"][0]["shares"])
        self.assertNotEqual(low["final_value"], high["final_value"])

    def test_replay_is_deterministic_and_preserves_attribution(self):
        strategies = [build_strategy("ver1", "Bull Strategy")]
        matrix_cells = [{
            "key": "Technology::BULL_LOW_VOL",
            "sector": "Technology",
            "regime": "BULL_LOW_VOL",
            "selectedExperimentId": "exp1",
            "selectedStrategyVersionId": "ver1",
            "allocationPct": 50,
            "status": "ACTIVE",
        }]

        def signal(row, strategy_config=None, context=None):
            if row["date"] == make_prices().iloc[50]["date"]:
                return {"signal": "BUY", "confidence": 80, "reasons": ["route"]}
            return {"signal": "HOLD", "confidence": 10, "reasons": []}

        first = self.run_replay(matrix_cells, strategies, signal)
        second = self.run_replay(matrix_cells, strategies, signal)

        self.assertEqual(first["final_value"], second["final_value"])
        self.assertEqual(first["completed_trade_log"], second["completed_trade_log"])
        trade = first["completed_trade_log"][0]
        self.assertEqual(trade["matrixCell"], "Technology::BULL_LOW_VOL")
        self.assertEqual(trade["selectedStrategy"], "Bull Strategy")
        self.assertEqual(trade["deploymentVersion"], "deployment-1")
        self.assertEqual(trade["sector"], "Technology")
        self.assertEqual(trade["regime"], "BULL_LOW_VOL")

    def test_sector_aliases_route_to_saved_matrix_cell(self):
        strategies = [build_strategy("ver1", "Bull Strategy")]
        matrix_cells = [{
            "key": "Technology::BULL_LOW_VOL",
            "sector": "Technology",
            "regime": "BULL_LOW_VOL",
            "selectedExperimentId": "exp1",
            "selectedStrategyVersionId": "ver1",
            "allocationPct": 50,
            "status": "ACTIVE",
        }]

        def signal(row, strategy_config=None, context=None):
            if row["date"] == make_prices().iloc[50]["date"]:
                return {"signal": "BUY", "confidence": 80, "reasons": ["route"]}
            return {"signal": "HOLD", "confidence": 10, "reasons": []}

        prices = make_prices()

        def load_prices(symbol, **_kwargs):
            return prices.copy()

        with (
            patch.object(matrix_replay, "get_historical_data", side_effect=load_prices),
            patch.object(matrix_replay, "add_indicators", side_effect=lambda frame, _config=None: frame),
            patch.object(matrix_replay, "get_symbol_metadata", return_value={
                "sector": "Information Technology",
                "industry": "Software",
                "company_name": "Test",
                "is_us": True,
                "is_sgx": False,
            }),
            patch.object(matrix_replay, "generate_research_signal_from_row", side_effect=signal),
            patch.object(matrix_replay, "determine_position_size", return_value=(1000, False)),
            patch.object(matrix_replay, "evaluate_long_intraday_exit", return_value=(False, None, None)),
        ):
            result = matrix_replay.run_matrix_replay(
                {
                    "deployment": {
                        "deploymentSetId": "deployment-1",
                        "deploymentVersionId": "deployment-1",
                        "matrix": {
                            "cells": matrix_cells,
                        },
                    },
                    "strategies": strategies,
                    "symbols": ["AAPL"],
                    "period": "2y",
                    "initialCash": 100000,
                }
            )

        self.assertEqual(result["completed_trades"], 1)
        self.assertEqual(result["routing_events"][0]["matrixCell"], "Technology::BULL_LOW_VOL")


if __name__ == "__main__":
    unittest.main()
