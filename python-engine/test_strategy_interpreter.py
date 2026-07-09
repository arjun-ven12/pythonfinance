import re

try:
    import pytest
except ModuleNotFoundError:
    class _RaisesContext:
        def __init__(self, exc_type, match=None):
            self.exc_type = exc_type
            self.match = match

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, _tb):
            if exc_type is None:
                raise AssertionError(f"Expected {self.exc_type.__name__} to be raised.")
            if not issubclass(exc_type, self.exc_type):
                return False
            if self.match and not re.search(self.match, str(exc)):
                raise AssertionError(f"Expected error matching {self.match!r}, got {exc!r}.")
            return True

    class _PytestCompat:
        @staticmethod
        def raises(exc_type, match=None):
            return _RaisesContext(exc_type, match=match)

    pytest = _PytestCompat()

from strategy_interpreter import generate_signal_from_strategy_json
from strategy_json_contract import StrategyJsonValidationError, validate_strategy_json


def build_strategy_json(entry_rules=None):
    return {
        "schemaVersion": "strategy-json/v1",
        "metadata": {
            "template": "Momentum",
            "compiler": "test",
            "generatedAt": "1970-01-01T00:00:00.000Z",
            "designNotes": [],
        },
        "executable": {
            "universe": {
                "type": "SINGLE",
                "universeId": "",
                "universeName": "",
                "market": "US_AND_SGX",
            },
            "timeframe": {"primary": "1D", "entry": "1H"},
            "entryRules": entry_rules
            or [
                {
                    "operator": "AND",
                    "children": [
                        {"indicator": "EMA_FAST", "comparator": ">", "value": 100},
                        {"indicator": "RSI", "comparator": "<", "value": 35},
                    ],
                }
            ],
            "exitRules": [],
            "positionSizing": {
                "method": "risk_per_trade",
                "riskPerTrade": 0.01,
                "previewCapital": 50000,
            },
            "riskRules": [],
            "filters": {
                "marketRegime": True,
                "news": True,
                "earnings": True,
                "marketHoursOnly": True,
            },
            "execution": {
                "entryTiming": "next_bar",
                "confirmation": "close_confirmation",
                "scaleIn": False,
                "scaleOut": False,
            },
            "validation": {
                "minimumTrades": 30,
                "minimumExpectancy": 0,
                "maxDrawdown": 12,
                "sharpeFloor": 1,
                "maxPositionSize": 8,
                "maxSectorExposure": 30,
                "maxDailyLoss": 3,
            },
            "parameters": {
                "emaFast": 20,
                "emaSlow": 50,
                "rsiThreshold": 55,
                "atrStopMultiple": 1.5,
                "atrTakeProfitMultiple": 8,
                "trailingStopAtrMultiple": 2,
                "signalThreshold": 20,
            },
            "weights": {
                "technical": 0.45,
                "regime": 0.25,
                "news": 0.15,
                "openai": 0.15,
            },
            "envelope": {
                "sectors": [],
                "regimes": [],
                "instrumentTypes": [],
                "volBand": {"min": 0, "max": 0.03},
                "liquidityFloor": 1000000,
                "holdingPeriodDays": 15,
            },
            "regimeOverlays": {},
        },
        "research": {
            "hypothesis": "Test",
            "rationale": "",
            "notes": "",
            "designNotes": {},
            "assumptions": [],
        },
        "evidence": {
            "robustness": None,
            "confidence": None,
            "validation": None,
            "deploymentScore": None,
        },
    }


def test_strategy_interpreter_generates_signal_from_nested_rules():
    row = {
        "close": 110,
        "ema_20": 105,
        "ema_50": 100,
        "rsi_14": 32,
        "atr_14": 2,
        "volatility_20": 0.02,
    }
    strategy_json = build_strategy_json()

    signal = generate_signal_from_strategy_json(row, strategy_json)

    assert signal["strategy_json_applied"] is True
    assert signal["signal"] == "BUY"
    assert signal["confidence"] >= 20
    assert signal["score_decomposition"]


def test_indicator_to_indicator_comparison_uses_rhs_indicator_value():
    row = {
        "close": 110,
        "ema_20": 105,
        "ema_50": 100,
        "rsi_14": 40,
        "atr_14": 2,
        "volatility_20": 0.02,
    }
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

    signal = generate_signal_from_strategy_json(row, strategy_json)

    assert signal["signal"] == "BUY"


def test_crossover_requires_previous_bar_transition():
    strategy_json = build_strategy_json(
        entry_rules=[
            {
                "operator": "AND",
                "children": [
                    {
                        "indicator": "EMA_FAST",
                        "comparator": "CROSSES_ABOVE",
                        "value": {"kind": "indicator", "indicator": "EMA_SLOW"},
                    }
                ],
            }
        ]
    )
    previous_row = {
        "close": 98,
        "ema_20": 99,
        "ema_50": 100,
        "rsi_14": 50,
        "atr_14": 2,
        "volatility_20": 0.02,
    }
    current_row = {
        "close": 101,
        "ema_20": 101,
        "ema_50": 100,
        "rsi_14": 50,
        "atr_14": 2,
        "volatility_20": 0.02,
    }

    signal = generate_signal_from_strategy_json(
        current_row,
        strategy_json,
        context={"previous_row": previous_row},
    )

    assert signal["signal"] == "BUY"


def test_strategy_rule_edit_changes_signal_output():
    row = {
        "close": 110,
        "ema_20": 105,
        "ema_50": 100,
        "rsi_14": 55,
        "atr_14": 2,
        "volatility_20": 0.02,
    }
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

    restrictive_signal = generate_signal_from_strategy_json(row, restrictive_strategy)
    permissive_signal = generate_signal_from_strategy_json(row, permissive_strategy)

    assert restrictive_signal["signal"] != permissive_signal["signal"]
    assert restrictive_signal["signal"] == "SELL"
    assert permissive_signal["signal"] == "BUY"


def test_strategy_json_contract_rejects_malformed_strategy():
    strategy_json = build_strategy_json(
        entry_rules=[{"indicator": "MOON_PHASE", "comparator": ">", "value": 1}]
    )

    with pytest.raises(StrategyJsonValidationError, match="unsupported"):
        validate_strategy_json(strategy_json)


def test_strategy_json_contract_rejects_unknown_rhs_indicator_reference():
    strategy_json = build_strategy_json(
        entry_rules=[
            {
                "operator": "AND",
                "children": [
                    {
                        "indicator": "EMA_FAST",
                        "comparator": ">",
                        "value": {"kind": "indicator", "indicator": "MOON_PHASE"},
                    }
                ],
            }
        ]
    )

    with pytest.raises(StrategyJsonValidationError, match="value.indicator"):
        validate_strategy_json(strategy_json)


def test_risk_rules_gate_buy_signal():
    row = {
        "close": 110,
        "ema_20": 105,
        "ema_50": 100,
        "rsi_14": 50,
        "atr_14": 2,
        "volatility_20": 0.05,
    }
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
    strategy_json["executable"]["riskRules"] = [
        {"indicator": "VOLATILITY_20", "comparator": "<", "value": 0.03}
    ]

    signal = generate_signal_from_strategy_json(row, strategy_json)

    assert signal["signal"] != "BUY"


def test_between_rule_uses_full_lower_and_upper_bounds():
    row = {
        "close": 110,
        "ema_20": 105,
        "ema_50": 100,
        "rsi_14": 55,
        "atr_14": 2,
        "volatility_20": 0.02,
        "volume": 2_000_000,
        "volume_sma_20": 1_000_000,
    }
    strategy_json = build_strategy_json(
        entry_rules=[
            {
                "operator": "AND",
                "children": [
                    {
                        "indicator": "RSI",
                        "comparator": "BETWEEN",
                        "value": {"min": 45, "max": 68},
                        "raw": {"right": "45 and 68"},
                    }
                ],
            }
        ]
    )

    signal = generate_signal_from_strategy_json(row, strategy_json)

    assert signal["signal"] == "BUY"


def test_volume_spike_rule_can_pass_when_volume_exceeds_average():
    row = {
        "close": 110,
        "ema_20": 105,
        "ema_50": 100,
        "rsi_14": 55,
        "atr_14": 2,
        "volatility_20": 0.02,
        "volume": 2_000_000,
        "volume_sma_20": 1_000_000,
    }
    strategy_json = build_strategy_json(
        entry_rules=[
            {
                "operator": "AND",
                "children": [
                    {
                        "indicator": "VOLUME",
                        "comparator": ">",
                        "value": {"kind": "indicator", "indicator": "VOLUME_SMA_20"},
                    }
                ],
            }
        ]
    )

    signal = generate_signal_from_strategy_json(row, strategy_json)

    assert signal["signal"] == "BUY"


def test_three_passing_rules_normalize_to_buy_confidence_above_threshold():
    row = {
        "close": 110,
        "ema_20": 105,
        "ema_50": 100,
        "rsi_14": 55,
        "atr_14": 2,
        "volatility_20": 0.02,
        "volume": 2_000_000,
        "volume_sma_20": 1_000_000,
    }
    strategy_json = build_strategy_json(
        entry_rules=[
            {
                "operator": "AND",
                "children": [
                    {"indicator": "EMA_FAST", "comparator": ">", "value": 100},
                    {
                        "indicator": "RSI",
                        "comparator": "BETWEEN",
                        "value": {"min": 45, "max": 68},
                        "raw": {"right": "45 and 68"},
                    },
                    {
                        "indicator": "VOLUME",
                        "comparator": ">",
                        "value": {"kind": "indicator", "indicator": "VOLUME_SMA_20"},
                    },
                ],
            }
        ]
    )
    strategy_json["executable"]["parameters"]["signalThreshold"] = 60

    signal = generate_signal_from_strategy_json(row, strategy_json)

    assert signal["signal"] == "BUY"
    assert signal["confidence"] == 100
