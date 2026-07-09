RISK_LOW = "LOW"
RISK_MEDIUM = "MEDIUM"
RISK_HIGH = "HIGH"


def safe_number(value, default=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def calculate_relative_gap(train_value, test_value):
    train = safe_number(train_value)
    test = safe_number(test_value)
    denominator = max(abs(train), 1)
    return abs(train - test) / denominator


def score_too_few_trades(train, test, min_test_trades=5, min_total_trades=12):
    train_trades = safe_number(train.get("completed_trades"))
    test_trades = safe_number(test.get("completed_trades"))
    total_trades = train_trades + test_trades

    if test_trades < min_test_trades:
        return 2, f"Test window has only {int(test_trades)} completed trades."

    if total_trades < min_total_trades:
        return 1, f"Walk-forward sample has only {int(total_trades)} completed trades."

    return 0, "Trade sample is large enough for a first-pass check."


def score_unstable_returns(train, test):
    train_return = safe_number(train.get("strategy_return"))
    test_return = safe_number(test.get("strategy_return"))
    return_gap = calculate_relative_gap(train_return, test_return)

    if train_return > 10 and test_return < 0:
        return 2, "Train return is positive while test return is negative."

    if return_gap > 1.25:
        return 2, f"Train/test return gap is high ({round(return_gap * 100, 1)}%)."

    if return_gap > 0.65:
        return 1, f"Train/test return gap is elevated ({round(return_gap * 100, 1)}%)."

    return 0, "Train/test returns are reasonably aligned."


def score_drawdown_variation(train, test):
    train_drawdown = abs(safe_number(train.get("drawdown")))
    test_drawdown = abs(safe_number(test.get("drawdown")))
    drawdown_gap = abs(test_drawdown - train_drawdown)
    drawdown_ratio = test_drawdown / max(train_drawdown, 1)

    if drawdown_gap > 20 or drawdown_ratio > 2.5:
        return 2, "Test drawdown is much different from train drawdown."

    if drawdown_gap > 10 or drawdown_ratio > 1.75:
        return 1, "Drawdown variation between train and test is elevated."

    return 0, "Drawdown behavior is reasonably stable."


def score_train_test_divergence(train, test):
    train_sharpe = safe_number(train.get("sharpe_ratio"))
    test_sharpe = safe_number(test.get("sharpe_ratio"))
    train_expectancy = safe_number(train.get("expectancy_per_trade"))
    test_expectancy = safe_number(test.get("expectancy_per_trade"))
    warnings = []

    if train_sharpe > 1 and test_sharpe <= 0:
        warnings.append("Sharpe collapses from positive train to non-positive test.")

    if train_expectancy > 0 and test_expectancy <= 0:
        warnings.append("Expectancy flips from positive train to non-positive test.")

    if len(warnings) >= 2:
        return 2, " ".join(warnings)

    if warnings or calculate_relative_gap(train_sharpe, test_sharpe) > 1:
        return 1, warnings[0] if warnings else "Train/test Sharpe divergence is elevated."

    return 0, "No major Sharpe or expectancy divergence detected."


def classify_risk(score):
    if score >= 5:
        return RISK_HIGH

    if score >= 3:
        return RISK_MEDIUM

    return RISK_LOW


def detect_overfitting(train_summary, test_summary):
    checks = []

    for check_name, scorer in [
        ("too_few_trades", score_too_few_trades),
        ("unstable_returns", score_unstable_returns),
        ("drawdown_variation", score_drawdown_variation),
        ("train_test_divergence", score_train_test_divergence),
    ]:
        score, message = scorer(train_summary, test_summary)
        checks.append({
            "check": check_name,
            "score": score,
            "flagged": score > 0,
            "message": message,
        })

    total_score = sum(check["score"] for check in checks)

    return {
        "overfitting_risk": classify_risk(total_score),
        "risk_score": total_score,
        "checks": checks,
        "flags": [
            check["check"]
            for check in checks
            if check["flagged"]
        ],
    }


def aggregate_overfitting(results):
    if not results:
        return {
            "overfitting_risk": RISK_LOW,
            "average_risk_score": 0,
            "high_risk_symbols": [],
            "medium_risk_symbols": [],
        }

    scores = [
        safe_number(item.get("overfitting", {}).get("risk_score"))
        for item in results
    ]
    average_score = sum(scores) / len(scores)
    high_risk_symbols = [
        item["symbol"]
        for item in results
        if item.get("overfitting", {}).get("overfitting_risk") == RISK_HIGH
    ]
    medium_risk_symbols = [
        item["symbol"]
        for item in results
        if item.get("overfitting", {}).get("overfitting_risk") == RISK_MEDIUM
    ]

    if high_risk_symbols or average_score >= 5:
        aggregate_risk = RISK_HIGH
    elif medium_risk_symbols or average_score >= 3:
        aggregate_risk = RISK_MEDIUM
    else:
        aggregate_risk = RISK_LOW

    return {
        "overfitting_risk": aggregate_risk,
        "average_risk_score": round(average_score, 2),
        "high_risk_symbols": high_risk_symbols,
        "medium_risk_symbols": medium_risk_symbols,
    }
