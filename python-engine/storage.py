from datetime import datetime
from uuid import uuid4

from json_utils import sanitize_json_value
from runtime.runtime_writer import write_runtime


def save_scan_results(
    opportunities,
    market_regime,
    filename=None,
    horizon_profile=None,
    active_strategy=None,
    universe_settings=None,
    scan_duration=None,
    scan_summary=None,
    scan_id=None,
    user_id=None,
):
    duration = round(float(scan_duration), 2) if scan_duration is not None else None
    data = {
        "scan_id": scan_id or str(uuid4()),
        "generated_at": datetime.now().isoformat(),
        "scan_duration": duration,
        "market_regime": market_regime,
        "opportunities": opportunities,
    }

    if horizon_profile:
        data["trading_horizon"] = horizon_profile

    if active_strategy:
        data["active_strategy"] = active_strategy

    if universe_settings:
        data["universe_settings"] = universe_settings

    if scan_summary:
        data["scan_summary"] = scan_summary

    data = sanitize_json_value(data)

    if user_id:
        path = write_runtime(user_id, "scan_results", data)
        if path:
            print(f"\nDebug scan results mirrored to {path}")
    elif filename:
        from json_utils import dump_json_strict

        with open(filename, "w") as file:
            dump_json_strict(data, file, indent=4)
        print(f"\nExported scan results to {filename}")

    return data
