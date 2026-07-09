import argparse
import json
from datetime import datetime, timedelta

from backtest import run_backtest


def parse_date(value):
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d")


def metric(result, key, default=0):
    value = result.get(key)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def run_segment(symbol, start_date, end_date, config, phase, index):
    result = run_backtest(
        symbol=symbol,
        initial_cash=float(config.get("initial_cash", 1000)),
        period=config.get("period", "5y"),
        risk_per_trade=float(config.get("risk_per_trade", 0.01)),
        horizon_profile=config.get("horizon_profile"),
        strategy_config=config.get("strategy_config"),
        start_date=start_date,
        end_date=end_date,
        benchmark_symbol=config.get("benchmark", "SPY"),
    )
    return {
        "segmentIndex": index,
        "phase": phase,
        "startDate": start_date.isoformat() if hasattr(start_date, "isoformat") else start_date,
        "endDate": end_date.isoformat() if hasattr(end_date, "isoformat") else end_date,
        "returnPct": result.get("total_return_pct"),
        "sharpe": result.get("sharpe_ratio"),
        "maxDrawdown": result.get("max_drawdown_pct"),
        "tradeCount": result.get("completed_trades"),
        "metrics": result,
    }


def date_diff_days(start_date, end_date):
    return max(1, (end_date - start_date).days + 1)


def add_days(date_value, days):
    return date_value + timedelta(days=max(1, int(days)))


def build_mode_windows(config):
    explicit_windows = config.get("windows")
    if explicit_windows:
        return [
            {
                "phase": window.get("phase", "TEST"),
                "startDate": parse_date(window.get("startDate")),
                "endDate": parse_date(window.get("endDate")),
            }
            for window in explicit_windows
            if window.get("startDate") and window.get("endDate")
        ]

    train_start = parse_date(config.get("trainStart"))
    train_end = parse_date(config.get("trainEnd"))
    validate_start = parse_date(config.get("validateStart"))
    validate_end = parse_date(config.get("validateEnd"))
    test_start = parse_date(config.get("testStart"))
    test_end = parse_date(config.get("testEnd"))
    mode = str(config.get("mode") or "ANCHORED").upper()

    if not all([train_start, train_end, validate_start, validate_end, test_start, test_end]):
        return []

    train_length = date_diff_days(train_start, train_end)
    validate_length = date_diff_days(validate_start, validate_end)
    test_length = date_diff_days(test_start, test_end)
    overall_end = test_end
    windows = []

    if mode == "ANCHORED":
        windows.extend([
            {"phase": "TRAIN", "startDate": train_start, "endDate": train_end},
            {"phase": "VALIDATE", "startDate": validate_start, "endDate": validate_end},
        ])
        current_test_start = test_start
        segment_index = 0
        while current_test_start <= overall_end:
            current_test_end = min(add_days(current_test_start, test_length - 1), overall_end)
            windows.append({
                "phase": "TEST",
                "startDate": current_test_start,
                "endDate": current_test_end,
                "segmentIndex": segment_index,
            })
            current_test_start = add_days(current_test_end, 1)
            segment_index += 1
        return windows

    train_anchor_start = train_start
    cycle = 0
    current_validate_start = validate_start
    current_test_start = test_start

    while current_test_start <= overall_end:
        if mode == "EXPANDING":
            current_train_start = train_anchor_start
            current_train_end = current_validate_start - timedelta(days=1)
        elif mode == "ROLLING":
            current_train_end = current_validate_start - timedelta(days=1)
            current_train_start = current_train_end - timedelta(days=train_length - 1)
        else:  # WINDOW_SHIFT
            block_start = train_anchor_start + timedelta(days=cycle * (train_length + validate_length + test_length))
            current_train_start = block_start
            current_train_end = block_start + timedelta(days=train_length - 1)
            current_validate_start = current_train_end + timedelta(days=1)
            current_test_start = current_validate_start + timedelta(days=validate_length)

        current_validate_end = current_validate_start + timedelta(days=validate_length - 1)
        current_test_end = min(current_test_start + timedelta(days=test_length - 1), overall_end)

        if current_test_start > overall_end or current_train_start > current_train_end:
            break

        windows.extend([
            {"phase": "TRAIN", "startDate": current_train_start, "endDate": current_train_end},
            {"phase": "VALIDATE", "startDate": current_validate_start, "endDate": current_validate_end},
            {"phase": "TEST", "startDate": current_test_start, "endDate": current_test_end},
        ])

        cycle += 1
        if mode == "EXPANDING":
            current_validate_start = current_test_start
            current_test_start = current_test_end + timedelta(days=1)
        elif mode == "ROLLING":
            current_validate_start = current_validate_start + timedelta(days=test_length)
            current_test_start = current_test_start + timedelta(days=test_length)
        else:
            continue

    return windows


def calculate_summary(segments):
    train = [item for item in segments if item["phase"] == "TRAIN"]
    validate = [item for item in segments if item["phase"] == "VALIDATE"]
    test = [item for item in segments if item["phase"] == "TEST"]
    is_returns = [metric(item, "returnPct") for item in train + validate]
    oos_returns = [metric(item, "returnPct") for item in test]
    is_return = sum(is_returns) / max(1, len(is_returns))
    oos_return = sum(oos_returns) / max(1, len(oos_returns))
    oos_sharpe = sum(metric(item, "sharpe") for item in test) / max(1, len(test))
    oos_drawdown = sum(metric(item, "maxDrawdown") for item in test) / max(1, len(test))
    overfit_ratio = abs(is_return / oos_return) if oos_return else None
    return_decay = is_return - oos_return
    stability_score = max(0, min(100, 85 - abs(return_decay) - max(0, abs(oos_drawdown) - 15)))
    out_of_regime = None
    if is_return:
        decay_pct = ((oos_return - is_return) / abs(is_return)) * 100
        out_of_regime = {
            "trainReturn": is_return,
            "outOfRegimeReturn": oos_return,
            "returnDecayPct": decay_pct,
            "pass": decay_pct > -50,
        }
    return {
        "isReturn": is_return,
        "oosReturn": oos_return,
        "oosSharpe": oos_sharpe,
        "oosDrawdown": oos_drawdown,
        "overfitRatio": overfit_ratio,
        "returnDecay": return_decay,
        "stabilityScore": stability_score,
        "rating": "Stable" if stability_score >= 75 else "Moderate" if stability_score >= 55 else "Fragile",
        "outOfRegimeStability": out_of_regime,
    }


def run_walk_forward(config):
    symbol = config.get("symbol", "AAPL")
    mode = config.get("mode", "ANCHORED")
    windows = build_mode_windows(config)
    segments = []
    for index, window in enumerate(windows):
        start_date = window.get("startDate")
        end_date = window.get("endDate")
        if not start_date or not end_date:
            continue
        segments.append(
            run_segment(
                symbol,
                start_date,
                end_date,
                config,
                window.get("phase", "TEST"),
                index,
            )
        )
    return {
        "mode": mode,
        "segments": segments,
        "summary": calculate_summary(segments),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    print(json.dumps(run_walk_forward(json.loads(args.config))))


if __name__ == "__main__":
    main()
