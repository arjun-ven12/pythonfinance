import unittest
import tempfile
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

import scheduler


class SchedulerPersistenceTests(unittest.TestCase):
    def test_us_market_hours_use_new_york_session(self):
        open_time = datetime(
            2026, 6, 15, 10, 0, tzinfo=ZoneInfo("America/New_York")
        )
        closed_time = datetime(
            2026, 6, 15, 8, 0, tzinfo=ZoneInfo("America/New_York")
        )

        self.assertTrue(scheduler.is_market_hours(open_time, market="US"))
        self.assertFalse(scheduler.is_market_hours(closed_time, market="US"))

    def test_singapore_market_hours_include_midday_break(self):
        morning = datetime(
            2026, 6, 15, 10, 0, tzinfo=ZoneInfo("Asia/Singapore")
        )
        lunch_break = datetime(
            2026, 6, 15, 12, 30, tzinfo=ZoneInfo("Asia/Singapore")
        )
        afternoon = datetime(
            2026, 6, 15, 14, 0, tzinfo=ZoneInfo("Asia/Singapore")
        )

        self.assertTrue(scheduler.is_market_hours(morning, market="SG"))
        self.assertFalse(scheduler.is_market_hours(lunch_break, market="SG"))
        self.assertTrue(scheduler.is_market_hours(afternoon, market="SG"))

    def test_both_markets_run_when_either_session_is_open(self):
        singapore_open = datetime(
            2026, 6, 15, 10, 0, tzinfo=ZoneInfo("Asia/Singapore")
        )
        us_open = datetime(
            2026, 6, 15, 10, 0, tzinfo=ZoneInfo("America/New_York")
        )
        both_closed = datetime(
            2026, 6, 14, 10, 0, tzinfo=ZoneInfo("Asia/Singapore")
        )

        self.assertTrue(scheduler.is_market_hours(singapore_open, market="BOTH"))
        self.assertTrue(scheduler.is_market_hours(us_open, market="BOTH"))
        self.assertFalse(scheduler.is_market_hours(both_closed, market="BOTH"))

    def test_completed_scheduler_scan_invokes_prisma_persistence_script(self):
        completed = SimpleNamespace(returncode=0, stdout='{"dataSource":"PRISMA"}', stderr="")

        with patch.object(scheduler.subprocess, "run", return_value=completed) as run:
            with tempfile.NamedTemporaryFile() as log_file:
                error = scheduler.persist_scheduled_scan(
                    "user-123",
                    12.5,
                    "2026-06-09T10:00:00",
                    Path(log_file.name),
                    {
                        "scan_results": {"generated_at": "2026-06-09T10:00:00"},
                        "alerts": [],
                        "proposed_orders": {"orders": []},
                    },
                )

        self.assertIsNone(error)
        command = run.call_args.args[0]
        self.assertEqual(command[0], "node")
        self.assertIn("persist-scheduled-scan.js", command[1])
        self.assertIn("user-123", command)

    def test_scheduler_persistence_fails_visibly_without_owner(self):
        with self.assertRaises(ValueError):
            scheduler.persist_scheduled_scan(
                None,
                12.5,
                "2026-06-09T10:00:00",
                Path("/tmp/scheduler-test.log"),
                {},
            )

    def test_scheduler_lock_prevents_duplicate_process_for_user(self):
        with tempfile.TemporaryDirectory() as directory:
            lock_file = Path(directory) / "scheduler.lock"
            scheduler.acquire_scheduler_lock(lock_file)

            try:
                with self.assertRaisesRegex(RuntimeError, "already running"):
                    scheduler.acquire_scheduler_lock(lock_file)
            finally:
                scheduler.release_scheduler_lock(lock_file)

            self.assertFalse(lock_file.exists())

    def test_scheduler_lock_replaces_stale_process(self):
        with tempfile.TemporaryDirectory() as directory:
            lock_file = Path(directory) / "scheduler.lock"
            lock_file.write_text("99999999", encoding="utf-8")

            scheduler.acquire_scheduler_lock(lock_file)
            try:
                self.assertEqual(
                    lock_file.read_text(encoding="utf-8"),
                    str(scheduler.os.getpid()),
                )
            finally:
                scheduler.release_scheduler_lock(lock_file)


if __name__ == "__main__":
    unittest.main()
