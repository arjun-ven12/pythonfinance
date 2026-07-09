import unittest
from datetime import datetime
from unittest.mock import Mock, patch

from news_filter import (
    BaseNewsProvider,
    FinnhubCompanyNewsProvider,
    MockFedAnnouncementProvider,
    MockMacroEventProvider,
    UnavailableProvider,
    build_default_providers,
    evaluate_news_filter,
    provider_result,
)


class NewsFilterTrustworthinessTests(unittest.TestCase):
    def test_finnhub_article_converts_to_event(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = [
            {
                "id": 123,
                "datetime": 1781308800,
                "headline": "Company raises guidance after record growth",
                "summary": "Profit beat expectations.",
                "source": "Reuters",
            }
        ]

        with patch("requests.get", return_value=response):
            result = FinnhubCompanyNewsProvider(api_key="test-key").fetch(
                "AAPL",
                datetime(2026, 6, 13),
            )

        self.assertTrue(result["success"])
        self.assertEqual(len(result["events"]), 1)
        self.assertEqual(result["events"][0].symbol, "AAPL")
        self.assertGreater(result["events"][0].sentiment_score, 0)
        self.assertEqual(result["errors"], [])

    def test_malformed_finnhub_article_is_skipped_and_reported(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = [
            {"id": 456, "headline": "Missing timestamp"},
            {
                "id": 457,
                "datetime": 1781308800,
                "headline": "Valid article",
                "summary": "",
            },
        ]

        with patch("requests.get", return_value=response):
            with self.assertLogs("news_filter", level="WARNING") as logs:
                result = FinnhubCompanyNewsProvider(api_key="test-key").fetch(
                    "MSFT",
                    datetime(2026, 6, 13),
                )

        self.assertTrue(result["success"])
        self.assertEqual(len(result["events"]), 1)
        self.assertEqual(len(result["errors"]), 1)
        self.assertIn("456", result["errors"][0])
        self.assertIn("provider=finnhub", logs.output[0])
        self.assertIn("symbol=MSFT", logs.output[0])

    def test_provider_failure_is_visible(self):
        with patch("requests.get", side_effect=TimeoutError("timed out")):
            result = FinnhubCompanyNewsProvider(api_key="test-key").fetch(
                "AAPL",
                datetime(2026, 6, 13),
            )

        self.assertFalse(result["success"])
        self.assertEqual(result["events"], [])
        self.assertIn("TimeoutError", result["errors"][0])
        self.assertGreaterEqual(result["latencyMs"], 0)

    def test_unavailable_provider_uses_provider_contract(self):
        result = UnavailableProvider(
            "macro",
            "Macro provider unavailable.",
        ).fetch("AAPL", datetime(2026, 6, 13))

        self.assertFalse(result["success"])
        self.assertEqual(result["provider"], "macro")
        self.assertEqual(result["events"], [])
        self.assertEqual(result["errors"], ["Macro provider unavailable."])

    def test_scanner_confidence_is_unchanged_without_successful_events(self):
        class EmptyProvider(BaseNewsProvider):
            provider_name = "empty"

            def fetch(self, symbol, as_of):
                return provider_result(self.provider_name, True, events=[])

        class FailedProvider(BaseNewsProvider):
            provider_name = "failed"

            def fetch(self, symbol, as_of):
                return provider_result(
                    self.provider_name,
                    False,
                    errors=["provider unavailable"],
                )

        result = evaluate_news_filter(
            "AAPL",
            as_of=datetime(2026, 6, 13),
            providers=[EmptyProvider(), FailedProvider()],
        )

        self.assertEqual(result["confidence_adjustment"], 0)
        self.assertEqual(result["sentiment_score"], 0)
        self.assertTrue(result["allow_trade"])
        self.assertEqual(result["events"], [])

    def test_malformed_provider_contract_is_reported_as_failure(self):
        class BrokenContractProvider(BaseNewsProvider):
            provider_name = "broken_contract"

            def fetch(self, symbol, as_of):
                return None

        result = evaluate_news_filter(
            "AAPL",
            as_of=datetime(2026, 6, 13),
            providers=[BrokenContractProvider()],
        )

        status = result["provider_status"][0]
        self.assertFalse(status["success"])
        self.assertIn("ValueError", status["errors"][0])
        self.assertEqual(result["confidence_adjustment"], 0)

    def test_live_mode_does_not_load_mock_macro_or_fed_events(self):
        with patch.dict("os.environ", {"FINNHUB_API_KEY": ""}, clear=False):
            providers = build_default_providers(
                datetime(2026, 6, 9),
                mode="live",
            )

        self.assertFalse(
            any(isinstance(provider, MockMacroEventProvider) for provider in providers)
        )
        self.assertFalse(
            any(isinstance(provider, MockFedAnnouncementProvider) for provider in providers)
        )

    def test_live_mode_reports_unavailable_providers_without_fake_events(self):
        with patch.dict("os.environ", {"FINNHUB_API_KEY": ""}, clear=False):
            result = evaluate_news_filter(
                "AAPL",
                as_of=datetime(2026, 6, 9),
                mode="live",
            )

        self.assertEqual(result["events"], [])
        self.assertIn("macro", result["provider_unavailable"])
        self.assertIn("earnings", result["provider_unavailable"])
        self.assertEqual(result["confidence_adjustment"], 0)
        self.assertTrue(result["allow_trade"])

    def test_demo_mode_can_explicitly_use_mock_events(self):
        providers = build_default_providers(
            datetime(2026, 6, 9),
            mode="demo",
        )

        self.assertTrue(
            any(isinstance(provider, MockMacroEventProvider) for provider in providers)
        )


if __name__ == "__main__":
    unittest.main()
