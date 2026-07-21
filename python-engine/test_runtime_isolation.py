import tempfile
import unittest
from unittest.mock import patch

import runtime_state
import openai_news_reasoner
from safety_manager import evaluate_trade_safety


class RuntimeIsolationTests(unittest.TestCase):
    def setUp(self):
        self.runtime_directory = tempfile.TemporaryDirectory()
        self.previous_runtime_root = runtime_state.RUNTIME_ROOT
        self.previous_users_root = runtime_state.USERS_ROOT
        runtime_state.RUNTIME_ROOT = runtime_state.Path(self.runtime_directory.name)
        runtime_state.USERS_ROOT = runtime_state.RUNTIME_ROOT / "users"

    def tearDown(self):
        runtime_state.RUNTIME_ROOT = self.previous_runtime_root
        runtime_state.USERS_ROOT = self.previous_users_root
        self.runtime_directory.cleanup()

    def test_user_scan_cannot_overwrite_another_user(self):
        runtime_state.write_runtime_json(
            "user-a",
            "scan_results",
            {"opportunities": [{"symbol": "AAPL"}]},
        )
        runtime_state.write_runtime_json(
            "user-b",
            "scan_results",
            {"opportunities": [{"symbol": "MSFT"}]},
        )

        self.assertEqual(
            runtime_state.read_runtime_json("user-a", "scan_results")[
                "opportunities"
            ][0]["symbol"],
            "AAPL",
        )
        self.assertEqual(
            runtime_state.read_runtime_json("user-b", "scan_results")[
                "opportunities"
            ][0]["symbol"],
            "MSFT",
        )

    def test_user_safety_limits_do_not_affect_another_user(self):
        user_a_safety = runtime_state.get_runtime_path("user-a", "safety")
        user_b_safety = runtime_state.get_runtime_path("user-b", "safety")
        runtime_state.write_runtime_json(
            "user-a",
            "safety",
            {"limits": {"max_daily_loss_pct": 0.01}},
        )
        runtime_state.write_runtime_json(
            "user-b",
            "safety",
            {"limits": {"max_daily_loss_pct": 0.05}},
        )
        order = {
            "symbol": "AAPL",
            "side": "BUY",
            "quantity": 1,
            "entry_price": 100,
            "sector": "Technology",
        }
        portfolio = {"portfolio_value": 100000, "positions": []}
        regime = {"allow_new_buys": True}

        user_a = evaluate_trade_safety(
            order,
            current_portfolio_state=portfolio,
            daily_realized_pl=-2000,
            market_regime=regime,
            safety_status=runtime_state.read_runtime_json("user-a", "safety", {}),
        )
        user_b = evaluate_trade_safety(
            order,
            current_portfolio_state=portfolio,
            daily_realized_pl=-2000,
            market_regime=regime,
            safety_status=runtime_state.read_runtime_json("user-b", "safety", {}),
        )

        self.assertFalse(user_a["allow_trade"])
        self.assertTrue(user_b["allow_trade"])

    def test_node_ai_cache_is_partitioned_by_user_and_inputs(self):
        openai_news_reasoner._SCAN_CACHE.clear()
        news_events = [{"source": "test", "title": "Material update"}]

        def fake_gateway(payload, user_id, timeout):
            return {
                "news_summary": f"{user_id} governed result",
                "risk_level": "LOW",
                "sentiment": "POSITIVE",
                "confidence_adjustment": 2,
                "allow_trade": True,
                "reasoning": "Node AI gateway response.",
            }

        with patch.object(openai_news_reasoner, "request_node_ai_reasoning", fake_gateway):
            openai_news_reasoner.reason_about_news(
                symbol="AAPL",
                technical_signal="BUY",
                confidence=80,
                market_regime={"regime": "BULL"},
                news_events=news_events,
                user_id="user-a",
                api_key="ignored",
            )
            openai_news_reasoner.reason_about_news(
                symbol="AAPL",
                technical_signal="BUY",
                confidence=80,
                market_regime={"regime": "BULL"},
                news_events=news_events,
                user_id="user-b",
                api_key="ignored",
            )

        self.assertEqual(len(openai_news_reasoner._SCAN_CACHE), 2)

    def test_node_ai_gateway_fallback_is_visible(self):
        openai_news_reasoner._SCAN_CACHE.clear()

        with patch.object(
            openai_news_reasoner,
            "request_node_ai_reasoning",
            side_effect=RuntimeError("gateway down"),
        ):
            result = openai_news_reasoner.reason_about_news(
                symbol="AAPL",
                technical_signal="BUY",
                confidence=80,
                market_regime={"regime": "BULL"},
                news_events=[{"source": "test", "title": "Material update"}],
                user_id="user-a",
            )

        self.assertTrue(result["aiUnavailable"])
        self.assertTrue(result["fallbackUsed"])
        self.assertEqual(result["reason"], "gateway_unavailable")

    def test_no_news_events_do_not_consume_ai_gateway_quota(self):
        openai_news_reasoner._SCAN_CACHE.clear()

        with patch.object(
            openai_news_reasoner,
            "request_node_ai_reasoning",
        ) as gateway:
            result = openai_news_reasoner.reason_about_news(
                symbol="STX",
                technical_signal="BUY",
                confidence=80,
                market_regime={"regime": "BULL"},
                news_events=[],
                user_id="user-a",
            )

        gateway.assert_not_called()
        self.assertFalse(result["aiUnavailable"])
        self.assertFalse(result["fallbackUsed"])
        self.assertEqual(result["reason"], "no_news_events")


if __name__ == "__main__":
    unittest.main()
