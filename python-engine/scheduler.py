import argparse
import json
import os
import subprocess
import tempfile
import time
from datetime import datetime, time as clock_time
from pathlib import Path
from zoneinfo import ZoneInfo

from json_utils import dumps_json_strict
from runtime_state import get_runtime_path, require_user_id
from runtime.runtime_writer import runtime_debug_enabled, write_runtime


INTERVAL_SECONDS = {
    "5min": 5 * 60,
    "15min": 15 * 60,
    "30min": 30 * 60,
    "1h": 60 * 60,
}
MARKET_SESSIONS = {
    "US": {
        "timezone": ZoneInfo("America/New_York"),
        "windows": ((clock_time(9, 30), clock_time(16, 0)),),
    },
    "SG": {
        "timezone": ZoneInfo("Asia/Singapore"),
        "windows": (
            (clock_time(9, 0), clock_time(12, 0)),
            (clock_time(13, 0), clock_time(17, 0)),
        ),
    },
}
PYTHON_ENGINE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PYTHON_ENGINE_DIR.parent
SCANNER_PATH = PYTHON_ENGINE_DIR / "scanner.py"
VENV_PYTHON = PYTHON_ENGINE_DIR / "venv" / "bin" / "python"
SCHEDULED_PERSIST_SCRIPT = (
    PROJECT_ROOT / "node-backend" / "scripts" / "persist-scheduled-scan.js"
)


def get_python_executable():
    return str(VENV_PYTHON) if VENV_PYTHON.exists() else "python3"


def get_active_market_codes(market="US"):
    normalized_market = str(market or "US").upper()

    if normalized_market == "BOTH":
        return ("US", "SG")

    if normalized_market in MARKET_SESSIONS:
        return (normalized_market,)

    return ("US",)


def is_market_session_open(market_code, now=None):
    session = MARKET_SESSIONS[market_code]
    timezone = session["timezone"]
    current = (now or datetime.now(timezone)).astimezone(timezone)

    if current.weekday() >= 5:
        return False

    local_time = current.time().replace(tzinfo=None)
    return any(
        session_open <= local_time <= session_close
        for session_open, session_close in session["windows"]
    )


def is_market_hours(now=None, market="US"):
    return any(
        is_market_session_open(market_code, now)
        for market_code in get_active_market_codes(market)
    )


def get_market_hours_label(market="US"):
    market_names = {
        "US": "US market hours",
        "SG": "Singapore market hours",
        "BOTH": "US or Singapore market hours",
    }
    return market_names.get(str(market or "US").upper(), "US market hours")


def log_run(log_file, status, duration_seconds, message=""):
    timestamp = datetime.now().isoformat(timespec="seconds")
    line = (
        f"{timestamp} | status={status} | "
        f"duration_seconds={round(duration_seconds, 2)}"
    )

    if message:
        line = f"{line} | message={message}"

    if runtime_debug_enabled():
        log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(log_file, "a") as file:
            file.write(f"{line}\n")

    print(line)


def iso_now():
    return datetime.now().isoformat(timespec="seconds")


def iso_from_epoch(epoch_seconds):
    return datetime.fromtimestamp(epoch_seconds).isoformat(timespec="seconds")


def build_engine_status(
    is_running,
    interval,
    market_hours_only,
    horizon="SWING",
    last_run_at=None,
    next_run_at=None,
    last_duration_seconds=None,
    last_error=None,
):
    return {
        "is_running": is_running,
        "last_run_at": last_run_at,
        "next_run_at": next_run_at,
        "last_duration_seconds": last_duration_seconds,
        "last_error": last_error,
        "interval": interval,
        "horizon": horizon,
        "market_hours_only": market_hours_only,
    }


def write_engine_status(status, user_id):
    write_runtime(user_id, "engine_status", status)


def process_is_running(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (ProcessLookupError, ValueError, TypeError):
        return False
    except PermissionError:
        return True


def acquire_scheduler_lock(lock_file):
    lock_file.parent.mkdir(parents=True, exist_ok=True)

    for _ in range(2):
        try:
            descriptor = os.open(
                lock_file,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                0o600,
            )
        except FileExistsError:
            try:
                existing_pid = int(lock_file.read_text(encoding="utf-8").strip())
            except (OSError, ValueError):
                existing_pid = None

            if existing_pid and process_is_running(existing_pid):
                raise RuntimeError(
                    f"Scheduler already running for this user (pid {existing_pid})."
                )

            lock_file.unlink(missing_ok=True)
            continue

        try:
            os.write(descriptor, str(os.getpid()).encode("utf-8"))
        finally:
            os.close(descriptor)
        return

    raise RuntimeError("Unable to acquire scheduler lock.")


def release_scheduler_lock(lock_file):
    try:
        lock_pid = int(lock_file.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        lock_pid = None

    if lock_pid == os.getpid():
        lock_file.unlink(missing_ok=True)


def parse_scan_artifacts(stdout):
    marker = "__SCAN_ARTIFACTS__="

    for line in reversed(str(stdout or "").splitlines()):
        if line.startswith(marker):
            return json.loads(line[len(marker):])

    raise ValueError("Scanner did not return execution artifacts.")


def run_scanner(
    user_id,
    log_file,
    limit=50,
    risk_multiplier=None,
    horizon="SWING",
    symbols=None,
    market="US",
    exchange="ALL",
    include_sgx=False,
    currency="AUTO",
    execution_settings=None,
    portfolio_state=None,
    strategy_config=None,
):
    command = [
        get_python_executable(),
        str(SCANNER_PATH),
        "--user-id",
        require_user_id(user_id),
        "--limit",
        str(limit),
        "--horizon",
        horizon,
        "--market",
        market,
        "--exchange",
        exchange,
        "--currency",
        currency,
        "--execution-settings",
        dumps_json_strict(execution_settings or {}),
        "--portfolio-json",
        dumps_json_strict(portfolio_state or {}),
    ]

    if risk_multiplier is not None:
        command.extend(["--risk-multiplier", str(risk_multiplier)])
    if symbols:
        command.extend(["--symbols", ",".join(symbols)])
    if include_sgx:
        command.append("--include-sgx")
    if strategy_config:
        command.extend(["--strategy-config", dumps_json_strict(strategy_config)])

    started_at = time.monotonic()

    try:
        result = subprocess.run(
            command,
            cwd=PYTHON_ENGINE_DIR,
            capture_output=True,
            text=True,
            check=False,
        )
        duration = time.monotonic() - started_at

        if result.returncode == 0:
            artifacts = parse_scan_artifacts(result.stdout)
            log_run(log_file, "success", duration, "scanner completed")
            return {
                "success": True,
                "duration_seconds": round(duration, 2),
                "error": None,
                "artifacts": artifacts,
            }

        message = (result.stderr or result.stdout or "scanner failed").strip()
        log_run(log_file, "failure", duration, message[-500:])
        return {
            "success": False,
            "duration_seconds": round(duration, 2),
            "error": message[-500:],
        }
    except Exception as error:
        duration = time.monotonic() - started_at
        log_run(log_file, "failure", duration, str(error))
        return {
            "success": False,
            "duration_seconds": round(duration, 2),
            "error": str(error),
        }


def persist_scheduled_scan(
    user_id,
    duration_seconds,
    started_at,
    log_file,
    artifacts,
):
    owner_id = require_user_id(user_id)

    try:
        result = subprocess.run(
            [
                "node",
                str(SCHEDULED_PERSIST_SCRIPT),
                "--user-id",
                owner_id,
                "--duration",
                str(duration_seconds),
                "--started-at",
                started_at,
            ],
            cwd=PROJECT_ROOT / "node-backend",
            capture_output=True,
            text=True,
            input=dumps_json_strict(artifacts),
            check=False,
        )
    except Exception as error:
        return f"scheduler Prisma persistence failed: {error}"

    if result.returncode != 0:
        message = (result.stderr or "scheduler Prisma persistence failed").strip()
        return message[-500:]

    log_run(log_file, "prisma_persisted", 0, "scheduled scan persisted")
    return None


def seconds_until_next_interval(interval_seconds):
    now = time.time()
    return interval_seconds - (now % interval_seconds)


def run_scheduler(
    interval,
    limit=50,
    risk_multiplier=None,
    horizon="SWING",
    market_hours_only=True,
    run_once=False,
    symbols=None,
    market="US",
    exchange="ALL",
    include_sgx=False,
    currency="AUTO",
    user_id=None,
    execution_settings=None,
    portfolio_state=None,
    strategy_config=None,
):
    owner_id = require_user_id(user_id)
    lock_file = Path(tempfile.gettempdir()) / f"trading-cockpit-scheduler-{owner_id}.lock"
    log_file = (
        get_runtime_path(owner_id, "scheduler_log")
        if runtime_debug_enabled()
        else Path(tempfile.gettempdir()) / f"trading-cockpit-scheduler-{owner_id}.log"
    )
    interval_seconds = INTERVAL_SECONDS[interval]
    acquire_scheduler_lock(lock_file)
    status = build_engine_status(
        is_running=True,
        interval=interval,
        horizon=horizon,
        market_hours_only=market_hours_only,
        next_run_at=iso_now(),
    )
    write_engine_status(status, owner_id)

    print(
        "Scheduler started:",
        f"user_id={owner_id}",
        f"interval={interval}",
        f"limit={limit}",
        f"horizon={horizon}",
        f"market={market}",
        f"exchange={exchange}",
        f"market_hours_only={market_hours_only}",
        f"symbols={len(symbols or []) if symbols else 'default'}",
    )

    try:
        while True:
            if not market_hours_only or is_market_hours(market=market):
                scan_started_at = iso_now()
                result = run_scanner(
                    user_id=owner_id,
                    log_file=log_file,
                    limit=limit,
                    risk_multiplier=risk_multiplier,
                    horizon=horizon,
                    symbols=symbols,
                    market=market,
                    exchange=exchange,
                    include_sgx=include_sgx,
                    currency=currency,
                    execution_settings=execution_settings,
                    portfolio_state=portfolio_state,
                    strategy_config=strategy_config,
                )
                persistence_error = (
                    persist_scheduled_scan(
                        owner_id,
                        result["duration_seconds"],
                        scan_started_at,
                        log_file,
                        result["artifacts"],
                    )
                    if result["success"]
                    else None
                )
                status.update(
                    {
                        "is_running": True,
                        "last_run_at": iso_now(),
                        "last_duration_seconds": result["duration_seconds"],
                        "last_error": result["error"] or persistence_error,
                    }
                )
            else:
                market_hours_label = get_market_hours_label(market)
                message = f"outside {market_hours_label}"
                log_run(log_file, "skipped", 0, message)
                status.update(
                    {
                        "is_running": True,
                        "last_run_at": iso_now(),
                        "last_duration_seconds": 0,
                        "last_error": message,
                    }
                )

            if run_once:
                status["next_run_at"] = None
                write_engine_status(status, owner_id)
                break

            sleep_seconds = seconds_until_next_interval(interval_seconds)
            status["next_run_at"] = iso_from_epoch(time.time() + sleep_seconds)
            write_engine_status(status, owner_id)
            time.sleep(sleep_seconds)
    except KeyboardInterrupt:
        print("Scheduler stopped.")
    finally:
        status["is_running"] = False
        status["next_run_at"] = None
        write_engine_status(status, owner_id)
        release_scheduler_lock(lock_file)


def parse_args():
    parser = argparse.ArgumentParser(description="Schedule scanner.py runs.")
    parser.add_argument("--interval", choices=sorted(INTERVAL_SECONDS), default="15min")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--risk-multiplier", type=float, default=None)
    parser.add_argument("--horizon", default="SWING")
    parser.add_argument("--market", choices=["US", "SG", "BOTH"], default="US")
    parser.add_argument("--exchange", default="ALL")
    parser.add_argument("--include-sgx", action="store_true")
    parser.add_argument("--currency", default="AUTO")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--execution-settings", default="{}")
    parser.add_argument("--portfolio-json", default="{}")
    parser.add_argument("--strategy-config", default="{}")
    parser.add_argument("--symbols", default="")
    parser.add_argument("--all-hours", action="store_true")
    parser.add_argument("--run-once", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_scheduler(
        interval=args.interval,
        limit=args.limit,
        risk_multiplier=args.risk_multiplier,
        horizon=args.horizon,
        market_hours_only=not args.all_hours,
        run_once=args.run_once,
        symbols=[
            symbol.strip().upper()
            for symbol in args.symbols.split(",")
            if symbol.strip()
        ],
        market=args.market,
        exchange=args.exchange,
        include_sgx=args.include_sgx,
        currency=args.currency,
        user_id=args.user_id,
        execution_settings=json.loads(args.execution_settings or "{}"),
        portfolio_state=json.loads(args.portfolio_json or "{}"),
        strategy_config=json.loads(args.strategy_config or "{}"),
    )
