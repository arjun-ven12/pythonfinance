import tempfile
import unittest
from unittest.mock import patch

import paper_execution
import runtime_state
from risk import calculate_position_size


class PaperExecutionTrustworthinessTests(unittest.TestCase):
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

    def test_approval_request_cannot_execute_twice(self):
        portfolio_state = paper_execution.get_default_portfolio()
        trades_state = {"generated_at": None, "trades": []}

        order = {
            "symbol": "AAPL",
            "side": "BUY",
            "order_type": "MARKET",
            "quantity": 10,
            "entry_price": 100,
            "current_price": 100,
            "approval_request_id": "approval-123",
        }

        first = paper_execution.execute_paper_order(
            order,
            "user-a",
            portfolio_state=portfolio_state,
            paper_trades_state=trades_state,
        )
        cash_after_first = first["portfolio"]["cash"]
        second = paper_execution.execute_paper_order(
            order,
            "user-a",
            portfolio_state=first["portfolio"],
            paper_trades_state=first["trades"],
        )

        self.assertTrue(first["filled"])
        self.assertTrue(second["filled"])
        self.assertTrue(second["duplicate"])
        self.assertEqual(len(second["trades"]["trades"]), 1)
        self.assertEqual(second["portfolio"]["cash"], cash_after_first)

    def test_user_paper_portfolios_are_isolated(self):
        order = {
            "symbol": "AAPL",
            "side": "BUY",
            "order_type": "MARKET",
            "quantity": 10,
            "entry_price": 100,
            "current_price": 100,
            "approval_request_id": "approval-a",
        }

        user_a = paper_execution.execute_paper_order(
            order,
            "user-a",
            portfolio_state=paper_execution.get_default_portfolio(),
            paper_trades_state={"trades": []},
        )
        user_b_portfolio = paper_execution.get_default_portfolio()

        self.assertTrue(user_a["filled"])
        self.assertLess(user_a["portfolio"]["cash"], 100000)
        self.assertEqual(user_b_portfolio["cash"], 100000)
        self.assertEqual(user_b_portfolio["positions"], {})

    def test_nan_risk_inputs_fail_closed_instead_of_crashing(self):
        self.assertEqual(
            calculate_position_size(
                account_value=100000,
                risk_per_trade=0.01,
                entry_price=100,
                stop_loss=float("nan"),
            ),
            0,
        )

    def test_nan_atr_uses_conservative_price_fallback(self):
        opportunity = {
            "symbol": "AAPL",
            "signal": "BUY",
            "close": 100,
            "confidence": 80,
            "opportunity_score": 70,
            "reasons": [],
        }

        with patch.object(
            paper_execution,
            "get_entry_and_atr",
            return_value=(100, float("nan")),
        ):
            order = paper_execution.build_proposed_order(
                opportunity,
                account_value=100000,
                risk_per_trade=0.01,
            )

        self.assertIsNone(order)


if __name__ == "__main__":
    unittest.main()
