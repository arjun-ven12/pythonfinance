import argparse
import asyncio
import contextlib
import json
import socket
import sys
from datetime import datetime, timezone


SUPPORTED_PYTHON_MIN = (3, 11)
SUPPORTED_PYTHON_MAX = (3, 12)


def get_runtime_version():
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def is_supported_python():
    current = (sys.version_info.major, sys.version_info.minor)
    return SUPPORTED_PYTHON_MIN <= current <= SUPPORTED_PYTHON_MAX


def build_result(
    connected=False,
    mode="paper",
    host=None,
    port=None,
    client_id=None,
    server_time=None,
    account_summary_available=False,
    dependency_available=None,
    socket_reachable=None,
    setup_hint=None,
    error=None,
    compatibility_passed=None,
    python_version=None,
):
    return {
        "connected": bool(connected),
        "mode": mode,
        "host": host,
        "port": port,
        "client_id": client_id,
        "server_time": server_time,
        "account_summary_available": bool(account_summary_available),
        "dependency_available": dependency_available,
        "socket_reachable": socket_reachable,
        "setup_hint": setup_hint,
        "error": error,
        "compatibility_passed": compatibility_passed,
        "python_version": python_version or get_runtime_version(),
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Test an IBKR TWS/Gateway API connection.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7497)
    parser.add_argument("--client-id", type=int, default=11)
    parser.add_argument("--mode", choices=["paper", "live"], default="paper")
    parser.add_argument("--timeout", type=float, default=5)
    return parser.parse_args()


def test_socket(host, port, timeout):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def main():
    args = parse_args()

    if not is_supported_python():
        print(json.dumps(build_result(
            mode=args.mode,
            host=args.host,
            port=args.port,
            client_id=args.client_id,
            dependency_available=False,
            socket_reachable=False,
            compatibility_passed=False,
            setup_hint=(
                "Use Python 3.11 or 3.12 for IBKR diagnostics. "
                "Create the python-engine virtual environment with that runtime."
            ),
            error=(
                f"Unsupported Python {get_runtime_version()}. "
                "IBKR diagnostics require Python 3.11 or 3.12."
            ),
        )))
        return

    try:
        try:
            asyncio.get_event_loop()
        except RuntimeError:
            asyncio.set_event_loop(asyncio.new_event_loop())

        from ib_insync import IB
    except Exception as import_error:
        socket_reachable = test_socket(args.host, args.port, min(args.timeout, 3))
        print(json.dumps(build_result(
            mode=args.mode,
            host=args.host,
            port=args.port,
            client_id=args.client_id,
            dependency_available=False,
            compatibility_passed=True,
            socket_reachable=socket_reachable,
            setup_hint="Install ib_insync in the Python environment used by node-backend, then retry the IBKR test.",
            error=(
                f"ib_insync is unavailable or failed to initialize: {import_error}. "
                f"Socket reachability to {args.host}:{args.port} is "
                f"{'available' if socket_reachable else 'not available'}."
            ),
        )))
        return

    ib = IB()

    try:
        with contextlib.redirect_stdout(sys.stderr):
            ib.connect(
                args.host,
                args.port,
                clientId=args.client_id,
                timeout=args.timeout,
                readonly=True,
            )
            server_time = ib.reqCurrentTime()
        account_summary_available = False

        try:
            with contextlib.redirect_stdout(sys.stderr):
                summary = ib.accountSummary()
            account_summary_available = bool(summary)
        except Exception:
            account_summary_available = False

        print(json.dumps(build_result(
            connected=ib.isConnected(),
            mode=args.mode,
            host=args.host,
            port=args.port,
            client_id=args.client_id,
            server_time=(
                server_time.astimezone(timezone.utc).isoformat()
                if isinstance(server_time, datetime)
                else str(server_time)
            ),
            account_summary_available=account_summary_available,
            dependency_available=True,
            compatibility_passed=True,
            socket_reachable=ib.isConnected(),
            error=None,
        )))
    except Exception as error:
        print(json.dumps(build_result(
            connected=False,
            mode=args.mode,
            host=args.host,
            port=args.port,
            client_id=args.client_id,
            dependency_available=True,
            compatibility_passed=True,
            socket_reachable=test_socket(args.host, args.port, min(args.timeout, 3)),
            setup_hint="Confirm TWS or IB Gateway is open, paper/live mode matches the port, and API socket clients are enabled.",
            error=str(error),
        )))
    finally:
        if ib.isConnected():
            ib.disconnect()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps(build_result(
            error=f"IBKR connection test failed before completion: {error}",
        )))
        sys.exit(0)
