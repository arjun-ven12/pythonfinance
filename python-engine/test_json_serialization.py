import json
import tempfile
import unittest
from pathlib import Path

from alerts import save_alerts
from json_utils import dumps_json_strict, sanitize_json_value
from storage import save_scan_results


class StrictJsonSerializationTests(unittest.TestCase):
    def test_non_finite_numbers_become_json_null(self):
        sanitized = sanitize_json_value(
            {
                "nan": float("nan"),
                "positive_infinity": float("inf"),
                "negative_infinity": float("-inf"),
                "nested": [1, float("nan")],
            }
        )

        self.assertIsNone(sanitized["nan"])
        self.assertIsNone(sanitized["positive_infinity"])
        self.assertIsNone(sanitized["negative_infinity"])
        self.assertIsNone(sanitized["nested"][1])
        self.assertNotIn("NaN", dumps_json_strict(sanitized))

    def test_scan_and_alert_files_are_strict_json(self):
        with tempfile.TemporaryDirectory() as directory:
            scan_file = Path(directory) / "scan_results.json"
            alert_file = Path(directory) / "alerts.json"
            scan = save_scan_results(
                [{"symbol": "TEST", "close": float("nan"), "rsi": float("inf")}],
                {"risk_multiplier": 1.0},
                filename=scan_file,
            )
            alerts = save_alerts(
                [{"symbol": "TEST", "score": float("nan")}],
                alert_file,
            )

            self.assertIsNone(scan["opportunities"][0]["close"])
            self.assertIsNone(alerts["alerts"][0]["score"])
            self.assertIsNone(json.loads(scan_file.read_text())["opportunities"][0]["rsi"])


if __name__ == "__main__":
    unittest.main()
