from datetime import datetime

from json_utils import sanitize_json_value
from runtime.runtime_writer import write_runtime


ALERT_SCORE_THRESHOLD = 60


def build_alert(opportunity, generated_at):
    return {
        "symbol": opportunity["symbol"],
        "score": opportunity["opportunity_score"],
        "confidence": opportunity["confidence"],
        "backtest_return": opportunity["backtest_return"],
        "drawdown": opportunity["drawdown"],
        "reasons": opportunity["reasons"],
        "generated_at": generated_at,
    }


def detect_buy_alerts(opportunities, generated_at=None):
    alert_time = generated_at or datetime.now().isoformat()
    seen_symbols = set()
    alerts = []

    for opportunity in opportunities:
        symbol = opportunity.get("symbol")

        if symbol in seen_symbols:
            continue

        if (
            opportunity.get("signal") == "BUY"
            and opportunity.get("opportunity_score", 0) >= ALERT_SCORE_THRESHOLD
        ):
            alerts.append(build_alert(opportunity, alert_time))
            seen_symbols.add(symbol)

    return alerts


def save_alerts(alerts, filename=None, user_id=None):
    data = sanitize_json_value({
        "generated_at": datetime.now().isoformat(),
        "alerts": alerts,
    })

    if user_id:
        path = write_runtime(user_id, "alerts", data)
        if path:
            print(f"Debug alerts mirrored to {path}")
    elif filename:
        from json_utils import dump_json_strict

        with open(filename, "w") as file:
            dump_json_strict(data, file, indent=4)
        print(f"Exported {len(alerts)} alerts to {filename}")

    return data


def generate_and_save_alerts(opportunities, filename):
    generated_at = datetime.now().isoformat()
    alerts = detect_buy_alerts(opportunities, generated_at)
    save_alerts(alerts, filename)
    return alerts


def generate_alerts_from_scan_results(scan_results, alerts_file=None, user_id=None):
    generated_at = scan_results.get("generated_at") or datetime.now().isoformat()
    alerts = detect_buy_alerts(
        scan_results.get("opportunities", []),
        generated_at,
    )
    save_alerts(alerts, alerts_file, user_id=user_id)
    return alerts
