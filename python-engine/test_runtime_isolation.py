import tempfile
import unittest

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

    def test_openai_cache_is_partitioned_by_user_and_inputs(self):
        openai_news_reasoner._SCAN_CACHE.clear()

        openai_news_reasoner.reason_about_news(
            symbol="AAPL",
            technical_signal="BUY",
            confidence=80,
            market_regime={"regime": "BULL"},
            news_events=[],
            user_id="user-a",
            api_key="",
        )
        openai_news_reasoner.reason_about_news(
            symbol="AAPL",
            technical_signal="BUY",
            confidence=80,
            market_regime={"regime": "BULL"},
            news_events=[],
            user_id="user-b",
            api_key="",
        )

        self.assertEqual(len(openai_news_reasoner._SCAN_CACHE), 2)


if __name__ == "__main__":
    unittest.main()
