# market_data.py = gets price history
# indicators.py = adds EMA, RSI, ATR, volatility
# strategy.py = decides BUY / HOLD / SELL
# risk.py = decides position sizing and stop-loss
# trade_rules.py = decides when to exit
# backtest.py = simulates everything historically

from math import sqrt

from indicators import add_indicators
from market_data import get_historical_data
from risk import calculate_position_size, calculate_stop_loss_take_profit
from strategy import generate_signal_from_row
from strategy_interpreter import generate_signal_from_strategy_json
from regime_engine import classify_regime, summarize_trades_by_regime
from strategy_conditioning import (
    classify_instrument_type,
    compute_fit_score,
    evaluate_instrument_constraints,
)
from trade_rules import calculate_trailing_stop, evaluate_long_intraday_exit


def generate_research_signal_from_row(row, config=None, context=None):
    config = config or {}
    context = context or {}

    if not config:
        return generate_signal_from_row(row)

    strategy_json = config.get("strategyJson") or config.get("strategy_json")
    if strategy_json:
        return generate_signal_from_strategy_json(row, strategy_json, context=context)

    close = row["close"]
    ema_20 = row["ema_20"]
    ema_50 = row["ema_50"]
    rsi = row["rsi_14"]
    volatility = row["volatility_20"]
    rsi_threshold = float(config.get("rsi_threshold", 65))
    buy_threshold = float(config.get("signal_threshold", 70))
    sell_threshold = float(config.get("sell_threshold", 30))

    score = 0
    reasons = []

    if ema_20 > ema_50:
        score += 30
        reasons.append("Bullish trend: EMA fast > EMA slow")

    if close > ema_20:
        score += 20
        reasons.append("Price above fast EMA")

    if 30 <= rsi <= rsi_threshold:
        score += 20
        reasons.append("RSI within research threshold")
    elif rsi > 70:
        reasons.append("RSI overbought")
    elif rsi < 30:
        score += 10
        reasons.append("RSI oversold")

    if volatility < 0.03:
        score += 10
        reasons.append("Volatility controlled")

    confidence = min(100, max(0, round((score / 80) * 100, 2)))

    if confidence >= buy_threshold:
        signal = "BUY"
    elif confidence <= sell_threshold:
        signal = "SELL"
    else:
        signal = "HOLD"

    return {
        "signal": signal,
        "confidence": confidence,
        "reasons": reasons,
    }


def calculate_return_series(equity_curve):
    returns = []

    for previous, current in zip(equity_curve, equity_curve[1:]):
        if previous > 0:
            returns.append((current - previous) / previous)

    return returns


def calculate_sharpe_ratio(returns, trading_days=252):
    if len(returns) < 2:
        return 0

    average_return = sum(returns) / len(returns)
    variance = sum((value - average_return) ** 2 for value in returns) / (
        len(returns) - 1
    )
    volatility = sqrt(variance)

    if volatility == 0:
        return 0

    return (average_return / volatility) * sqrt(trading_days)


def calculate_annualized_volatility(returns, trading_days=252):
    if len(returns) < 2:
        return 0

    average_return = sum(returns) / len(returns)
    variance = sum((value - average_return) ** 2 for value in returns) / (
        len(returns) - 1
    )

    return sqrt(variance) * sqrt(trading_days) * 100


def get_trade_profit(trade):
    return trade.get("profit", trade.get("pnl", 0))


def calculate_profit_factor(winning_trades, losing_trades):
    gross_profit = sum(get_trade_profit(trade) for trade in winning_trades)
    gross_loss = abs(sum(get_trade_profit(trade) for trade in losing_trades))

    if gross_loss == 0:
        return None

    return gross_profit / gross_loss


def calculate_expectancy(completed_trades):
    if not completed_trades:
        return 0

    return sum(get_trade_profit(trade) for trade in completed_trades) / len(completed_trades)


def calculate_average_holding_period(completed_trades):
    holding_periods = [
        trade["holding_period_days"]
        for trade in completed_trades
        if "holding_period_days" in trade
    ]

    if not holding_periods:
        return 0

    return sum(holding_periods) / len(holding_periods)


def round_or_none(value, decimals=2):
    if value is None:
        return None

    return round(float(value), decimals)


def calculate_sortino_ratio(returns, trading_days=252):
    if len(returns) < 2:
        return 0

    average_return = sum(returns) / len(returns)
    downside_returns = [value for value in returns if value < 0]

    if not downside_returns:
        return 0

    downside_variance = sum(value ** 2 for value in downside_returns) / len(downside_returns)
    downside_deviation = sqrt(downside_variance)

    if downside_deviation == 0:
        return 0

    return (average_return / downside_deviation) * sqrt(trading_days)


def build_execution_assumptions(strategy_config=None, fee_per_trade=1):
    strategy_config = strategy_config or {}
    strategy_json = _extract_strategy_json(strategy_config)
    explicit = (
        strategy_config.get("executionAssumptions")
        or strategy_json.get("executable", {}).get("executionAssumptions")
        or {}
    )

    def get_number(key, fallback):
        value = explicit.get(key, fallback)
        try:
            parsed = float(value)
            return parsed if parsed >= 0 else fallback
        except (TypeError, ValueError):
            return fallback

    return {
        "commission_per_trade": get_number("commissionPerTrade", fee_per_trade),
        "regulatory_fee_bps": get_number("regulatoryFeeBps", 0),
        "slippage_bps": get_number("slippageBps", 0),
        "spread_bps": get_number("spreadBps", 0),
        "max_participation_rate": min(1, max(0, get_number("maxParticipationRate", 0))),
        "allow_partial_fills": explicit.get("allowPartialFills", True) is not False,
    }


def apply_fill_price(price, side, assumptions):
    price = float(price)
    slippage_multiplier = float(assumptions.get("slippage_bps", 0)) / 10000
    spread_multiplier = float(assumptions.get("spread_bps", 0)) / 20000
    impact = slippage_multiplier + spread_multiplier
    if side == "BUY":
        return price * (1 + impact)
    return price * (1 - impact)


def calculate_execution_fee(notional, assumptions):
    commission = float(assumptions.get("commission_per_trade", 0))
    fee_bps = float(assumptions.get("regulatory_fee_bps", 0))
    return commission + (float(notional) * fee_bps / 10000)


def apply_volume_cap(requested_shares, row, assumptions):
    requested_shares = int(max(0, requested_shares))
    max_participation_rate = float(assumptions.get("max_participation_rate", 0))
    if requested_shares <= 0 or max_participation_rate <= 0:
        return requested_shares, False

    volume = row.get("volume")
    volume = 0 if volume is None or volume != volume else float(volume)
    if volume <= 0:
        return requested_shares, False

    max_shares = int(volume * max_participation_rate)
    if max_shares <= 0:
        return (0, requested_shares > 0) if assumptions.get("allow_partial_fills", True) else (requested_shares, False)

    if requested_shares <= max_shares:
        return requested_shares, False

    if assumptions.get("allow_partial_fills", True):
        return max_shares, True

    return requested_shares, False


def determine_position_size(
    account_value,
    cash,
    entry_price,
    stop_loss,
    risk_per_trade,
    position_sizing,
    row=None,
    assumptions=None,
    remaining_slots=1,
):
    position_sizing = position_sizing or {}
    assumptions = assumptions or {}
    method = str(position_sizing.get("method") or "risk_per_trade").lower()
    preview_capital = float(position_sizing.get("previewCapital", account_value) or account_value)
    volatility = 0
    if row is not None:
        volatility = get_bar_price(row, "volatility_20", 0)

    if method == "equal_weight":
        target_notional = max(0, account_value) / max(1, remaining_slots)
        shares = int(target_notional // max(entry_price, 0.0001))
    elif method == "vol_targeting":
        target_weight = min(1, risk_per_trade / max(volatility, 0.005))
        target_notional = max(0, account_value) * target_weight
        shares = int(target_notional // max(entry_price, 0.0001))
    elif method == "kelly_capped":
        target_notional = max(0, account_value) * min(0.2, max(0.01, risk_per_trade * 2))
        shares = int(target_notional // max(entry_price, 0.0001))
    elif method == "risk_parity":
        target_notional = max(0, account_value) * min(0.25, max(0.01, risk_per_trade / max(volatility, 0.01)))
        shares = int(target_notional // max(entry_price, 0.0001))
    else:
        shares = calculate_position_size(
            max(account_value, preview_capital),
            risk_per_trade,
            entry_price,
            stop_loss,
        )

    max_affordable_shares = int(max(0, cash) // max(entry_price, 0.0001))
    shares = min(int(max(0, shares)), max_affordable_shares)
    volume_row = row if row is not None else {}
    shares, was_partial = apply_volume_cap(shares, volume_row, assumptions)
    return shares, was_partial


def validate_backtest_inputs(symbol, initial_cash, risk_per_trade, period, start_date=None, end_date=None):
    if isinstance(symbol, (list, tuple, set)):
        cleaned = [str(item).strip().upper() for item in symbol if str(item).strip()]
        if not cleaned:
            raise ValueError("At least one symbol is required.")
    elif not str(symbol or "").strip():
        raise ValueError("Symbol is required.")

    if float(initial_cash) <= 0:
        raise ValueError("Initial cash must be greater than zero.")
    if float(risk_per_trade) <= 0 or float(risk_per_trade) > 1:
        raise ValueError("Risk per trade must be between 0 and 1.")
    if not period and not (start_date and end_date):
        raise ValueError("A period or explicit date range is required.")


def calculate_exposure_stats(exposure_curve):
    if not exposure_curve:
        return {"average_exposure_pct": 0, "max_exposure_pct": 0}
    return {
        "average_exposure_pct": round(sum(exposure_curve) / len(exposure_curve), 2),
        "max_exposure_pct": round(max(exposure_curve), 2),
    }


def _extract_strategy_json(strategy_config=None):
    strategy_config = strategy_config or {}
    return strategy_config.get("strategyJson") or strategy_config.get("strategy_json") or {}


def _build_exit_contract(strategy_json, parameters, fallback_profile):
    fallback_profile = fallback_profile or {}
    exit_contract = {
        "stop_loss_atr_multiple": fallback_profile.get("stop_loss_atr_multiple", 1.5),
        "take_profit_atr_multiple": fallback_profile.get("take_profit_atr_multiple", 8),
        "trailing_stop_atr_multiple": fallback_profile.get("trailing_stop_atr_multiple", 2),
        "signal_exit": True,
        "time_exit_days": None,
    }
    executable = (strategy_json or {}).get("executable", {})
    exit_rules = executable.get("exitRules") or []
    if not strategy_json:
        return exit_contract

    exit_contract["stop_loss_atr_multiple"] = None
    exit_contract["take_profit_atr_multiple"] = None
    exit_contract["trailing_stop_atr_multiple"] = None
    exit_contract["signal_exit"] = False

    for rule in exit_rules:
        indicator = str(rule.get("indicator") or "").upper()
        comparator = str(rule.get("comparator") or "").upper()
        value = rule.get("value")
        if indicator == "ATR" and comparator == "STOP_LOSS_ATR":
            exit_contract["stop_loss_atr_multiple"] = float(value)
        elif indicator == "ATR" and comparator == "TAKE_PROFIT_ATR":
            exit_contract["take_profit_atr_multiple"] = float(value)
        elif indicator == "ATR" and comparator == "TRAILING_STOP_ATR":
            exit_contract["trailing_stop_atr_multiple"] = float(value)
        elif indicator == "SIGNAL_STATE" and comparator == "==":
            exit_contract["signal_exit"] = str(value).upper() == "SELL"
        elif indicator == "HOLDING_PERIOD_DAYS":
            exit_contract["time_exit_days"] = int(float(value))

    if exit_contract["stop_loss_atr_multiple"] is None:
        exit_contract["stop_loss_atr_multiple"] = float(parameters.get("atrStopMultiple", 1.5))
    if exit_contract["take_profit_atr_multiple"] is None:
        exit_contract["take_profit_atr_multiple"] = float(parameters.get("atrTakeProfitMultiple", 8))
    if exit_contract["trailing_stop_atr_multiple"] is None:
        exit_contract["trailing_stop_atr_multiple"] = float(parameters.get("trailingStopAtrMultiple", 2))
    return exit_contract


def get_valid_close_rows(df):
    valid_rows = df[df["close"].notna()]

    if len(valid_rows) < 2:
        raise ValueError("Backtest requires at least two valid closing prices.")

    return valid_rows


def get_bar_price(row, field, fallback):
    value = row.get(field, fallback)

    if value is None or value != value:
        return float(fallback)

    return float(value)


def build_backtest_validation(result):
    warnings = []

    if result.get("completed_trades", 0) > 0 and not result.get("completed_trade_log"):
        warnings.append("trade count exists but trade log is empty")

    if result.get("buy_and_hold_return_pct") is None:
        warnings.append("buy and hold return missing")

    if result.get("benchmark_return_pct") is None:
        warnings.append("benchmark return missing")

    required_pnl_fields = [
        "profit_factor",
        "average_winner",
        "average_loser",
        "largest_winner",
        "largest_loser",
        "average_holding_period_days",
    ]

    if any(field not in result for field in required_pnl_fields):
        warnings.append("pnl breakdown missing")

    return {
        "is_valid": len(warnings) == 0,
        "warnings": warnings,
    }


def calculate_cagr(initial_cash, final_value, start_date, end_date):
    years = (end_date - start_date).days / 365.25

    if years <= 0 or initial_cash <= 0 or final_value <= 0:
        return 0

    return (((final_value / initial_cash) ** (1 / years)) - 1) * 100


def run_backtest(
    symbol,
    initial_cash=1000,
    period="5y",
    risk_per_trade=0.01,
    fee_per_trade=1,
    horizon_profile=None,
    strategy_config=None,
    start_date=None,
    end_date=None,
    benchmark_symbol="SPY",
):
    validate_backtest_inputs(symbol, initial_cash, risk_per_trade, period, start_date, end_date)
    df = get_historical_data(
        symbol,
        period=period,
        start=start_date,
        end=end_date,
    )
    horizon_profile = horizon_profile or {}
    indicator_config = horizon_profile.get("indicator_configuration")
    df = add_indicators(df, indicator_config)
    strategy_json = _extract_strategy_json(strategy_config)
    executable = strategy_json.get("executable", {})
    base_parameters = executable.get("parameters", {})
    risk_per_trade = float(
        executable.get("positionSizing", {}).get("riskPerTrade", risk_per_trade)
    )
    position_sizing = executable.get("positionSizing", {})
    execution_assumptions = build_execution_assumptions(strategy_config, fee_per_trade=fee_per_trade)
    exit_contract = _build_exit_contract(strategy_json, base_parameters, horizon_profile)
    envelope = strategy_json.get("executable", {}).get("envelope", {})
    instrument_type = classify_instrument_type(symbol, strategy_config or {})
    instrument_constraints = evaluate_instrument_constraints(
        instrument_type,
        envelope=envelope,
        strategy_context={
            "allowOvernight": bool((envelope or {}).get("holdingPeriodDays", 15) > 1),
        },
    )

    cash = float(initial_cash)
    shares = 0
    entry_price = None
    entry_date = None
    entry_confidence = None
    entry_signal_data = None
    entry_fee_paid = None
    stop_loss = None
    trailing_stop = None
    take_profit = None
    pending_signal = None

    trades = []
    completed_trade_log = []
    equity_curve = []
    equity_curve_points = []
    exposure_curve = []
    regime_timeline = []
    total_fees_paid = 0
    total_slippage_cost = 0

    def close_position(exit_price, exit_date, exit_reason):
        nonlocal cash, shares, entry_price, entry_date, entry_confidence
        nonlocal entry_signal_data, stop_loss, trailing_stop, take_profit
        nonlocal entry_fee_paid
        nonlocal total_fees_paid, total_slippage_cost

        market_exit_price = float(exit_price)
        exit_price = apply_fill_price(market_exit_price, "SELL", execution_assumptions)
        exited_shares = int(shares)
        notional = exited_shares * exit_price
        exit_fee = calculate_execution_fee(notional, execution_assumptions)
        cash += notional
        cash -= exit_fee
        total_fees_paid += exit_fee
        total_slippage_cost += max(0, (market_exit_price - exit_price) * exited_shares)
        profit = (
            (exit_price - float(entry_price)) * exited_shares
            - exit_fee
            - float(entry_fee_paid or 0)
        )
        holding_period_days = (
            (exit_date - entry_date).days if entry_date is not None else 0
        )
        trade = {
            "entry_date": str(entry_date),
            "exit_date": str(exit_date),
            "side": "BUY",
            "entry_price": round(float(entry_price), 2),
            "exit_price": round(exit_price, 2),
            "shares": exited_shares,
            "pnl": round(float(profit), 2),
            "profit": round(float(profit), 2),
            "return_pct": round(
                ((exit_price - float(entry_price)) / float(entry_price)) * 100,
                2,
            ),
            "holding_period_days": int(holding_period_days),
            "exit_reason": exit_reason,
            "partial_fill": entry_signal_data.get("partial_fill") if entry_signal_data else False,
            "stop_loss": round_or_none(stop_loss),
            "trailing_stop": round_or_none(trailing_stop),
            "take_profit": round_or_none(take_profit),
            "confidence": round_or_none(entry_confidence),
            "market_regime": (
                entry_signal_data.get("market_regime")
                if entry_signal_data
                else None
            ),
            "instrument_type": instrument_type,
            "decision_snapshot": {
                "entryReason": "; ".join(entry_signal_data.get("reasons", []))
                if entry_signal_data
                else "Entry generated by strategy rules.",
                "exitReason": exit_reason,
                "indicatorContributions": (
                    entry_signal_data.get("score_decomposition", [])
                    if entry_signal_data
                    else []
                ),
                "ruleTree": (
                    entry_signal_data.get("rule_tree")
                    or entry_signal_data.get("ruleTree")
                    if entry_signal_data
                    else None
                ),
                "fit": entry_signal_data.get("fit") if entry_signal_data else None,
                "marketRegime": entry_signal_data.get("market_regime")
                if entry_signal_data
                else None,
                "confidence": round_or_none(entry_confidence),
            },
        }
        completed_trade_log.append(trade)
        trades.append({
            "type": "SELL",
            "date": str(exit_date),
            "price": round(exit_price, 2),
            **trade,
        })

        shares = 0
        entry_price = None
        entry_date = None
        entry_confidence = None
        entry_signal_data = None
        entry_fee_paid = None
        stop_loss = None
        trailing_stop = None
        take_profit = None

    for i in range(50, len(df)):
        row = df.iloc[i]
        row_regime = classify_regime(row)
        close = float(row["close"])
        open_price = get_bar_price(row, "open", close)
        high_price = get_bar_price(row, "high", max(open_price, close))
        low_price = get_bar_price(row, "low", min(open_price, close))
        date = row["date"]
        exited_existing_position = False
        regime_timeline.append({"date": str(date), "regime": row_regime})

        if shares > 0:
            should_exit, exit_reason, exit_price = evaluate_long_intraday_exit(
                open_price=open_price,
                high_price=high_price,
                low_price=low_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                trailing_stop=trailing_stop,
            )

            if (
                not should_exit
                and exit_contract["time_exit_days"] is not None
                and entry_date is not None
                and (date - entry_date).days >= exit_contract["time_exit_days"]
            ):
                should_exit = True
                exit_reason = "TIME_EXIT"
                exit_price = open_price

            if not should_exit and pending_signal and exit_contract["signal_exit"]:
                pending_row = pending_signal["row"]
                pending_close = float(pending_row["close"])
                strong_uptrend = (
                    pending_close > float(pending_row["ema_50"])
                    and float(pending_row["ema_20"]) > float(pending_row["ema_50"])
                )
                if (
                    pending_signal["signal_data"]["signal"] == "SELL"
                    and not strong_uptrend
                ):
                    should_exit = True
                    exit_reason = "STRATEGY_SELL"
                    exit_price = open_price

            if should_exit:
                close_position(exit_price, date, exit_reason)
                exited_existing_position = True

        if (
            shares == 0
            and not exited_existing_position
            and pending_signal
            and pending_signal["signal_data"]["signal"] == "BUY"
        ):
            signal_data = pending_signal["signal_data"]
            signal_atr = float(pending_signal["row"]["atr_14"])
            proposed_stop, proposed_take_profit = calculate_stop_loss_take_profit(
                open_price,
                signal_atr,
                stop_loss_atr_multiple=exit_contract["stop_loss_atr_multiple"],
                take_profit_atr_multiple=exit_contract["take_profit_atr_multiple"],
            )
            account_value = cash
            fill_price = apply_fill_price(open_price, "BUY", execution_assumptions)
            position_size, was_partial_fill = determine_position_size(
                account_value=account_value,
                cash=cash,
                entry_price=fill_price,
                stop_loss=proposed_stop,
                risk_per_trade=risk_per_trade,
                position_sizing=position_sizing,
                row=pending_signal["row"],
                assumptions=execution_assumptions,
            )

            if position_size > 0:
                entry_fee = calculate_execution_fee(position_size * fill_price, execution_assumptions)
                shares = position_size
                entry_price = fill_price
                entry_date = date
                entry_confidence = signal_data["confidence"]
                entry_signal_data = {
                    **signal_data,
                    "partial_fill": was_partial_fill,
                }
                entry_fee_paid = entry_fee
                stop_loss = proposed_stop
                trailing_stop = calculate_trailing_stop(
                    close=fill_price,
                    atr=signal_atr,
                    atr_multiple=exit_contract["trailing_stop_atr_multiple"],
                )
                take_profit = proposed_take_profit
                cash -= shares * fill_price
                cash -= entry_fee
                total_fees_paid += entry_fee
                total_slippage_cost += max(0, (fill_price - open_price) * shares)
                trades.append({
                    "type": "BUY",
                    "signal_date": str(pending_signal["date"]),
                    "date": str(date),
                    "price": round(fill_price, 2),
                    "shares": int(shares),
                    "partial_fill": was_partial_fill,
                    "stop_loss": round(float(stop_loss), 2),
                    "trailing_stop": round(float(trailing_stop), 2),
                    "take_profit": round(float(take_profit), 2),
                    "confidence": round_or_none(entry_confidence),
                    "reasons": signal_data["reasons"],
                    "decision_snapshot": {
                        "entryReason": "; ".join(signal_data.get("reasons", [])),
                        "exitReason": None,
                        "indicatorContributions": signal_data.get(
                            "score_decomposition", []
                        ),
                        "ruleTree": signal_data.get("rule_tree")
                        or signal_data.get("ruleTree"),
                        "confidence": round_or_none(entry_confidence),
                    },
                })

                should_exit, exit_reason, exit_price = evaluate_long_intraday_exit(
                    open_price=open_price,
                    high_price=high_price,
                    low_price=low_price,
                    stop_loss=stop_loss,
                    take_profit=take_profit,
                    trailing_stop=trailing_stop,
                )
                if should_exit:
                    close_position(exit_price, date, exit_reason)

        if shares > 0:
            trailing_stop = calculate_trailing_stop(
                close=close,
                atr=float(row["atr_14"]),
                current_trailing_stop=trailing_stop,
                atr_multiple=exit_contract["trailing_stop_atr_multiple"],
            )

        account_value = cash + (shares * close)
        exposure = ((shares * close) / account_value * 100) if account_value > 0 else 0
        exposure_curve.append(exposure)
        equity_curve.append(account_value)
        equity_curve_points.append({
            "date": str(date),
            "equity": round(float(account_value), 2),
        })

        pending_signal = {
            "date": date,
            "row": row,
            "signal_data": generate_research_signal_from_row(
                row,
                strategy_config,
                context={
                    "previous_row": df.iloc[i - 1] if i > 0 else None,
                    "regime": row_regime,
                    "symbol": symbol,
                    "instrumentType": instrument_type,
                },
            ),
        }
        if pending_signal["signal_data"]:
            fit = compute_fit_score(
                {
                    "symbol": symbol,
                    "sector": (strategy_config or {}).get("sector") or "UNKNOWN",
                    "regime": row_regime,
                    "volatility": row.get("volatility_20"),
                    "averageVolume": row.get("volume_sma_20") or row.get("volume"),
                    "metadata": strategy_config or {},
                },
                envelope,
            )
            pending_signal["signal_data"]["fit"] = fit
            pending_signal["signal_data"]["market_regime"] = row_regime
            pending_signal["signal_data"]["instrument_type"] = instrument_type
            pending_signal["signal_data"]["instrument_constraints"] = instrument_constraints
            if instrument_constraints.get("warnings"):
                pending_signal["signal_data"]["reasons"] = [
                    *pending_signal["signal_data"].get("reasons", []),
                    *instrument_constraints["warnings"],
                ]

    final_close = float(get_valid_close_rows(df).iloc[-1]["close"])
    final_value = cash + (shares * final_close)
    total_return_pct = ((final_value - initial_cash) / initial_cash) * 100

    completed_trades = completed_trade_log
    winning_trades = [t for t in completed_trades if get_trade_profit(t) > 0]
    losing_trades = [t for t in completed_trades if get_trade_profit(t) <= 0]

    win_rate = (
        len(winning_trades) / len(completed_trades) * 100
        if completed_trades
        else 0
    )

    peak = equity_curve[0] if equity_curve else initial_cash
    max_drawdown = 0
    drawdown_curve = []

    for point, value in zip(equity_curve_points, equity_curve):
        peak = max(peak, value)
        drawdown = ((peak - value) / peak) * 100
        max_drawdown = max(max_drawdown, drawdown)
        drawdown_curve.append({
            "date": point["date"],
            "drawdown": round(float(drawdown), 2),
        })

    total_profit = sum(t["pnl"] for t in completed_trades)

    avg_win = (
        sum(t["pnl"] for t in winning_trades) / len(winning_trades)
        if winning_trades
        else None
    )

    avg_loss = (
        sum(t["pnl"] for t in losing_trades) / len(losing_trades)
        if losing_trades
        else None
    )
    largest_winner = max((trade["pnl"] for trade in winning_trades), default=None)
    largest_loser = min((trade["pnl"] for trade in losing_trades), default=None)

    returns = calculate_return_series(equity_curve)
    sharpe_ratio = calculate_sharpe_ratio(returns)
    sortino_ratio = calculate_sortino_ratio(returns)
    profit_factor = calculate_profit_factor(winning_trades, losing_trades)
    expectancy = calculate_expectancy(completed_trades)
    average_holding_period = calculate_average_holding_period(completed_trades)
    cagr = calculate_cagr(
        initial_cash=initial_cash,
        final_value=final_value,
        start_date=df.iloc[50]["date"] if len(df) > 50 else df.iloc[0]["date"],
        end_date=df.iloc[-1]["date"],
    )
    volatility = calculate_annualized_volatility(returns)

    valid_close_rows = get_valid_close_rows(df)
    start_price = float(valid_close_rows.iloc[0]["close"])
    end_price = float(valid_close_rows.iloc[-1]["close"])
    buy_and_hold_shares = int(initial_cash // start_price)
    buy_and_hold_cash = initial_cash - (
        buy_and_hold_shares * start_price
    )
    buy_and_hold_final_value = buy_and_hold_cash + (
        buy_and_hold_shares * end_price
    )
    buy_and_hold_return_pct = ((end_price - start_price) / start_price) * 100
    benchmark_return_pct = None
    benchmark_curve = []
    benchmark_df = None
    benchmark_unavailable = False

    try:
        benchmark_df = get_historical_data(
            benchmark_symbol,
            period=period,
            start=start_date,
            end=end_date,
        )
    except Exception:
        benchmark_df = None
        benchmark_unavailable = True

    if benchmark_df is not None and len(benchmark_df) > 1:
        try:
            benchmark_valid_rows = get_valid_close_rows(benchmark_df)
            benchmark_start_price = float(benchmark_valid_rows.iloc[0]["close"])
            benchmark_end_price = float(benchmark_valid_rows.iloc[-1]["close"])
            benchmark_return_pct = (
                (benchmark_end_price - benchmark_start_price)
                / benchmark_start_price
            ) * 100
            benchmark_shares = int(initial_cash // benchmark_start_price)
            benchmark_cash = initial_cash - (
                benchmark_shares * benchmark_start_price
            )

            for i in range(min(50, len(benchmark_df) - 1), len(benchmark_df)):
                benchmark_close = benchmark_df.iloc[i]["close"]
                if benchmark_close != benchmark_close:
                    continue
                benchmark_value = benchmark_cash + (
                    benchmark_shares * float(benchmark_close)
                )
                benchmark_curve.append({
                    "date": str(benchmark_df.iloc[i]["date"]),
                    "benchmark": round(float(benchmark_value), 2),
                })
        except (TypeError, ValueError, IndexError):
            benchmark_return_pct = None
            benchmark_curve = []
            benchmark_unavailable = True

    if not benchmark_curve:
        benchmark_unavailable = True

    result = {
        "symbol": symbol,
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "start_price": round(float(start_price), 2),
        "end_price": round(float(end_price), 2),
        "benchmark_symbol": benchmark_symbol,
        "initial_cash": round(float(initial_cash), 2),
        "final_value": round(float(final_value), 2),
        "total_return_pct": round(float(total_return_pct), 2),
        "buy_and_hold_return_pct": round(float(buy_and_hold_return_pct), 2),
        "benchmark_return_pct": round_or_none(benchmark_return_pct),
        "benchmarkUnavailable": benchmark_unavailable,
        "benchmark_unavailable": benchmark_unavailable,
        "total_profit": round(float(total_profit), 2),
        "completed_trades": len(completed_trades),
        "win_rate_pct": round(float(win_rate), 2),
        "avg_win": round_or_none(avg_win),
        "avg_loss": round_or_none(avg_loss),
        "average_winner": round_or_none(avg_win),
        "average_loser": round_or_none(avg_loss),
        "largest_winner": round_or_none(largest_winner),
        "largest_loser": round_or_none(largest_loser),
        "max_drawdown_pct": round(float(max_drawdown), 2),
        "sharpe_ratio": round(float(sharpe_ratio), 2),
        "profit_factor": round_or_none(profit_factor),
        "sortino_ratio": round(float(sortino_ratio), 2),
        "expectancy_per_trade": round(float(expectancy), 2),
        "average_trade_return_pct": round(
            sum(trade.get("return_pct", 0) for trade in completed_trades) / len(completed_trades),
            2,
        ) if completed_trades else 0,
        "average_holding_period_days": round(float(average_holding_period), 2),
        "annualized_return_pct": round(float(cagr), 2),
        "volatility_pct": round(float(volatility), 2),
        "total_fees_paid": round(float(total_fees_paid), 2),
        "estimated_slippage_cost": round(float(total_slippage_cost), 2),
        "execution_assumptions": execution_assumptions,
        "instrument_type": instrument_type,
        "instrument_constraints": instrument_constraints,
        "regime_timeline": regime_timeline,
        "regime_breakdown": summarize_trades_by_regime(completed_trade_log),
        "equity_curve": equity_curve_points,
        "drawdown_curve": drawdown_curve,
        "benchmark_curve": benchmark_curve,
        "trades": trades,
        "completed_trade_log": completed_trade_log,
        "open_position": (
            {
                "symbol": symbol,
                "side": "BUY",
                "entry_date": str(entry_date),
                "entry_price": round_or_none(entry_price),
                "shares": int(shares),
                "last_price": round(float(final_close), 2),
                "unrealized_pnl": round(
                    (final_close - float(entry_price)) * shares - fee_per_trade,
                    2,
                ),
                "stop_loss": round_or_none(stop_loss),
                "trailing_stop": round_or_none(trailing_stop),
                "take_profit": round_or_none(take_profit),
                "status": "OPEN",
            }
            if shares > 0
            else None
        ),
        "open_positions_count": 1 if shares > 0 else 0,
    }
    result.update(calculate_exposure_stats(exposure_curve))
    result["validation"] = build_backtest_validation(result)
    return result


def run_multi_asset_backtest(
    symbols,
    initial_cash=1000,
    period="5y",
    risk_per_trade=0.01,
    fee_per_trade=1,
    horizon_profile=None,
    strategy_config=None,
    start_date=None,
    end_date=None,
    benchmark_symbol="SPY",
):
    validate_backtest_inputs(symbols, initial_cash, risk_per_trade, period, start_date, end_date)
    symbols = [str(symbol).strip().upper() for symbol in symbols if str(symbol).strip()]
    if len(symbols) == 1:
        return run_backtest(
            symbol=symbols[0],
            initial_cash=initial_cash,
            period=period,
            risk_per_trade=risk_per_trade,
            fee_per_trade=fee_per_trade,
            horizon_profile=horizon_profile,
            strategy_config=strategy_config,
            start_date=start_date,
            end_date=end_date,
            benchmark_symbol=benchmark_symbol,
        )

    horizon_profile = horizon_profile or {}
    strategy_json = _extract_strategy_json(strategy_config)
    executable = strategy_json.get("executable", {})
    base_parameters = executable.get("parameters", {})
    position_sizing = executable.get("positionSizing", {})
    risk_per_trade = float(
        executable.get("positionSizing", {}).get("riskPerTrade", risk_per_trade)
    )
    execution_assumptions = build_execution_assumptions(strategy_config, fee_per_trade=fee_per_trade)
    exit_contract = _build_exit_contract(strategy_json, base_parameters, horizon_profile)

    data_by_symbol = {}
    previous_row_by_symbol = {}
    latest_close_by_symbol = {}
    states = {}
    all_dates = set()

    for symbol in symbols:
        df = get_historical_data(symbol, period=period, start=start_date, end=end_date)
        df = add_indicators(df, horizon_profile.get("indicator_configuration"))
        if len(df) <= 50:
            continue
        trimmed = df.iloc[50:].copy()
        trimmed["date"] = trimmed["date"].apply(lambda value: value.to_pydatetime() if hasattr(value, "to_pydatetime") else value)
        rows = {}
        for _, row in trimmed.iterrows():
            rows[row["date"]] = row
            all_dates.add(row["date"])
        data_by_symbol[symbol] = rows
        states[symbol] = {
            "shares": 0,
            "entry_price": None,
            "entry_date": None,
            "entry_fee_paid": 0,
            "entry_confidence": None,
            "entry_signal_data": None,
            "stop_loss": None,
            "trailing_stop": None,
            "take_profit": None,
            "pending_signal": None,
        }

    if not data_by_symbol:
        raise ValueError("No historical data available for the requested symbols.")

    cash = float(initial_cash)
    trades = []
    completed_trade_log = []
    equity_curve = []
    equity_curve_points = []
    drawdown_curve = []
    exposure_curve = []
    regime_timeline = []
    total_fees_paid = 0
    total_slippage_cost = 0

    def close_position(symbol, state, exit_price, exit_date, exit_reason):
        nonlocal cash, total_fees_paid, total_slippage_cost
        market_exit_price = float(exit_price)
        filled_exit_price = apply_fill_price(market_exit_price, "SELL", execution_assumptions)
        shares = int(state["shares"])
        notional = shares * filled_exit_price
        exit_fee = calculate_execution_fee(notional, execution_assumptions)
        cash += notional - exit_fee
        total_fees_paid += exit_fee
        total_slippage_cost += max(0, (market_exit_price - filled_exit_price) * shares)
        holding_period_days = (
            (exit_date - state["entry_date"]).days if state["entry_date"] is not None else 0
        )
        profit = (
            (filled_exit_price - float(state["entry_price"])) * shares
            - float(state["entry_fee_paid"] or 0)
            - exit_fee
        )
        trade = {
            "symbol": symbol,
            "entry_date": str(state["entry_date"]),
            "exit_date": str(exit_date),
            "side": "BUY",
            "entry_price": round(float(state["entry_price"]), 2),
            "exit_price": round(float(filled_exit_price), 2),
            "shares": shares,
            "pnl": round(float(profit), 2),
            "profit": round(float(profit), 2),
            "return_pct": round(
                ((filled_exit_price - float(state["entry_price"])) / float(state["entry_price"])) * 100,
                2,
            ),
            "holding_period_days": int(holding_period_days),
            "exit_reason": exit_reason,
            "stop_loss": round_or_none(state["stop_loss"]),
            "trailing_stop": round_or_none(state["trailing_stop"]),
            "take_profit": round_or_none(state["take_profit"]),
            "confidence": round_or_none(state["entry_confidence"]),
            "market_regime": state["entry_signal_data"].get("market_regime") if state["entry_signal_data"] else None,
            "decision_snapshot": {
                "entryReason": "; ".join(state["entry_signal_data"].get("reasons", [])) if state["entry_signal_data"] else "",
                "exitReason": exit_reason,
                "indicatorContributions": state["entry_signal_data"].get("score_decomposition", []) if state["entry_signal_data"] else [],
                "ruleTree": state["entry_signal_data"].get("rule_tree") if state["entry_signal_data"] else None,
                "confidence": round_or_none(state["entry_confidence"]),
            },
        }
        completed_trade_log.append(trade)
        trades.append({
            "type": "SELL",
            "date": str(exit_date),
            "price": round(float(filled_exit_price), 2),
            **trade,
        })
        state.update({
            "shares": 0,
            "entry_price": None,
            "entry_date": None,
            "entry_fee_paid": 0,
            "entry_confidence": None,
            "entry_signal_data": None,
            "stop_loss": None,
            "trailing_stop": None,
            "take_profit": None,
        })

    ordered_dates = sorted(all_dates)

    for date in ordered_dates:
        entry_candidates = []

        for symbol in symbols:
            row = data_by_symbol.get(symbol, {}).get(date)
            state = states.get(symbol)
            if row is None or state is None:
                continue

            close = float(row["close"])
            open_price = get_bar_price(row, "open", close)
            high_price = get_bar_price(row, "high", max(open_price, close))
            low_price = get_bar_price(row, "low", min(open_price, close))
            latest_close_by_symbol[symbol] = close
            row_regime = classify_regime(row)
            regime_timeline.append({"date": str(date), "symbol": symbol, "regime": row_regime})

            if state["shares"] > 0:
                should_exit, exit_reason, exit_price = evaluate_long_intraday_exit(
                    open_price=open_price,
                    high_price=high_price,
                    low_price=low_price,
                    stop_loss=state["stop_loss"],
                    take_profit=state["take_profit"],
                    trailing_stop=state["trailing_stop"],
                )
                if (
                    not should_exit
                    and exit_contract["time_exit_days"] is not None
                    and state["entry_date"] is not None
                    and (date - state["entry_date"]).days >= exit_contract["time_exit_days"]
                ):
                    should_exit = True
                    exit_reason = "TIME_EXIT"
                    exit_price = open_price

                if not should_exit and state["pending_signal"] and exit_contract["signal_exit"]:
                    pending_signal = state["pending_signal"]["signal_data"]
                    if pending_signal.get("signal") == "SELL":
                        should_exit = True
                        exit_reason = "STRATEGY_SELL"
                        exit_price = open_price

                if should_exit:
                    close_position(symbol, state, exit_price, date, exit_reason)

            pending_signal = state.get("pending_signal")
            if state["shares"] == 0 and pending_signal and pending_signal["signal_data"]["signal"] == "BUY":
                signal_atr = float(pending_signal["row"]["atr_14"])
                proposed_stop, proposed_take_profit = calculate_stop_loss_take_profit(
                    open_price,
                    signal_atr,
                    stop_loss_atr_multiple=exit_contract["stop_loss_atr_multiple"],
                    take_profit_atr_multiple=exit_contract["take_profit_atr_multiple"],
                )
                entry_candidates.append({
                    "symbol": symbol,
                    "state": state,
                    "row": row,
                    "date": date,
                    "open_price": open_price,
                    "signal_atr": signal_atr,
                    "proposed_stop": proposed_stop,
                    "proposed_take_profit": proposed_take_profit,
                    "signal_data": pending_signal["signal_data"],
                })

            signal_data = generate_research_signal_from_row(
                row,
                strategy_config,
                context={
                    "previous_row": previous_row_by_symbol.get(symbol),
                    "regime": row_regime,
                    "symbol": symbol,
                },
            )
            state["pending_signal"] = {
                "date": date,
                "row": row,
                "signal_data": signal_data,
            }
            previous_row_by_symbol[symbol] = row

        entry_candidates.sort(key=lambda item: (-float(item["signal_data"].get("confidence", 0)), item["symbol"]))

        for candidate in entry_candidates:
            state = candidate["state"]
            if state["shares"] > 0:
                continue
            fill_price = apply_fill_price(candidate["open_price"], "BUY", execution_assumptions)
            account_value = cash + sum(
                states[item_symbol]["shares"] * latest_close_by_symbol.get(item_symbol, 0)
                for item_symbol in symbols
            )
            remaining_slots = max(1, len([item for item in entry_candidates if states[item["symbol"]]["shares"] == 0]))
            position_size, was_partial_fill = determine_position_size(
                account_value=account_value,
                cash=cash,
                entry_price=fill_price,
                stop_loss=candidate["proposed_stop"],
                risk_per_trade=risk_per_trade,
                position_sizing=position_sizing,
                row=candidate["row"],
                assumptions=execution_assumptions,
                remaining_slots=remaining_slots,
            )
            if position_size <= 0:
                continue

            entry_fee = calculate_execution_fee(position_size * fill_price, execution_assumptions)
            if cash < (position_size * fill_price) + entry_fee:
                continue

            state["shares"] = position_size
            state["entry_price"] = fill_price
            state["entry_date"] = candidate["date"]
            state["entry_fee_paid"] = entry_fee
            state["entry_confidence"] = candidate["signal_data"]["confidence"]
            state["entry_signal_data"] = {
                **candidate["signal_data"],
                "partial_fill": was_partial_fill,
            }
            state["stop_loss"] = candidate["proposed_stop"]
            state["trailing_stop"] = calculate_trailing_stop(
                close=fill_price,
                atr=candidate["signal_atr"],
                atr_multiple=exit_contract["trailing_stop_atr_multiple"],
            )
            state["take_profit"] = candidate["proposed_take_profit"]
            cash -= (position_size * fill_price) + entry_fee
            total_fees_paid += entry_fee
            total_slippage_cost += max(0, (fill_price - candidate["open_price"]) * position_size)
            trades.append({
                "type": "BUY",
                "symbol": candidate["symbol"],
                "signal_date": str(candidate["state"]["pending_signal"]["date"]),
                "date": str(candidate["date"]),
                "price": round(float(fill_price), 2),
                "shares": int(position_size),
                "partial_fill": was_partial_fill,
                "stop_loss": round(float(state["stop_loss"]), 2),
                "trailing_stop": round(float(state["trailing_stop"]), 2),
                "take_profit": round(float(state["take_profit"]), 2),
                "confidence": round_or_none(state["entry_confidence"]),
                "reasons": candidate["signal_data"].get("reasons", []),
            })

        for symbol in symbols:
            row = data_by_symbol.get(symbol, {}).get(date)
            state = states.get(symbol)
            if row is None or state is None or state["shares"] <= 0:
                continue
            state["trailing_stop"] = calculate_trailing_stop(
                close=float(row["close"]),
                atr=float(row["atr_14"]),
                current_trailing_stop=state["trailing_stop"],
                atr_multiple=exit_contract["trailing_stop_atr_multiple"],
            )

        account_value = cash + sum(
            states[symbol]["shares"] * latest_close_by_symbol.get(symbol, 0)
            for symbol in symbols
        )
        invested_capital = sum(
            states[symbol]["shares"] * latest_close_by_symbol.get(symbol, 0)
            for symbol in symbols
        )
        exposure = (invested_capital / account_value * 100) if account_value > 0 else 0
        exposure_curve.append(exposure)
        equity_curve.append(account_value)
        equity_curve_points.append({"date": str(date), "equity": round(float(account_value), 2)})

    if not equity_curve:
        raise ValueError("Backtest produced no equity observations.")

    completed_trades = completed_trade_log
    winning_trades = [trade for trade in completed_trades if get_trade_profit(trade) > 0]
    losing_trades = [trade for trade in completed_trades if get_trade_profit(trade) <= 0]
    total_profit = sum(trade["pnl"] for trade in completed_trades)
    returns = calculate_return_series(equity_curve)
    sharpe_ratio = calculate_sharpe_ratio(returns)
    sortino_ratio = calculate_sortino_ratio(returns)
    profit_factor = calculate_profit_factor(winning_trades, losing_trades)
    expectancy = calculate_expectancy(completed_trades)
    average_holding_period = calculate_average_holding_period(completed_trades)
    final_value = equity_curve[-1]
    total_return_pct = ((final_value - initial_cash) / initial_cash) * 100
    win_rate = (len(winning_trades) / len(completed_trades) * 100) if completed_trades else 0

    peak = equity_curve[0]
    max_drawdown = 0
    for point, value in zip(equity_curve_points, equity_curve):
        peak = max(peak, value)
        drawdown = ((peak - value) / peak) * 100 if peak > 0 else 0
        max_drawdown = max(max_drawdown, drawdown)
        drawdown_curve.append({"date": point["date"], "drawdown": round(float(drawdown), 2)})

    start_date_metric = ordered_dates[0]
    end_date_metric = ordered_dates[-1]
    cagr = calculate_cagr(initial_cash, final_value, start_date_metric, end_date_metric)
    volatility = calculate_annualized_volatility(returns)

    benchmark_return_pct = None
    benchmark_curve = []
    try:
        benchmark_df = get_historical_data(benchmark_symbol, period=period, start=start_date, end=end_date)
        benchmark_valid_rows = get_valid_close_rows(benchmark_df)
        benchmark_start_price = float(benchmark_valid_rows.iloc[0]["close"])
        benchmark_end_price = float(benchmark_valid_rows.iloc[-1]["close"])
        benchmark_return_pct = ((benchmark_end_price - benchmark_start_price) / benchmark_start_price) * 100
        benchmark_shares = int(initial_cash // benchmark_start_price)
        benchmark_cash = initial_cash - (benchmark_shares * benchmark_start_price)
        for _, row in benchmark_valid_rows.iloc[50 if len(benchmark_valid_rows) > 50 else 0 :].iterrows():
            benchmark_value = benchmark_cash + (benchmark_shares * float(row["close"]))
            benchmark_curve.append({"date": str(row["date"]), "benchmark": round(float(benchmark_value), 2)})
    except Exception:
        benchmark_return_pct = None
        benchmark_curve = []

    buy_and_hold_return_pct = 0
    if latest_close_by_symbol:
        equal_allocation = initial_cash / len(latest_close_by_symbol)
        initial_prices = []
        final_prices = []
        for symbol in symbols:
            rows = list(data_by_symbol.get(symbol, {}).values())
            if not rows:
                continue
            initial_prices.append(float(rows[0]["close"]))
            final_prices.append(float(rows[-1]["close"]))
        if initial_prices and final_prices:
            buy_and_hold_return_pct = sum(
                ((end - start) / start) * 100 for start, end in zip(initial_prices, final_prices)
            ) / len(initial_prices)

    result = {
        "symbol": ",".join(symbols),
        "symbols": symbols,
        "is_multi_symbol": True,
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "benchmark_symbol": benchmark_symbol,
        "initial_cash": round(float(initial_cash), 2),
        "final_value": round(float(final_value), 2),
        "total_return_pct": round(float(total_return_pct), 2),
        "buy_and_hold_return_pct": round(float(buy_and_hold_return_pct), 2),
        "benchmark_return_pct": round_or_none(benchmark_return_pct),
        "total_profit": round(float(total_profit), 2),
        "completed_trades": len(completed_trades),
        "win_rate_pct": round(float(win_rate), 2),
        "avg_win": round_or_none(sum(t["pnl"] for t in winning_trades) / len(winning_trades) if winning_trades else None),
        "avg_loss": round_or_none(sum(t["pnl"] for t in losing_trades) / len(losing_trades) if losing_trades else None),
        "average_winner": round_or_none(sum(t["pnl"] for t in winning_trades) / len(winning_trades) if winning_trades else None),
        "average_loser": round_or_none(sum(t["pnl"] for t in losing_trades) / len(losing_trades) if losing_trades else None),
        "largest_winner": round_or_none(max((t["pnl"] for t in winning_trades), default=None)),
        "largest_loser": round_or_none(min((t["pnl"] for t in losing_trades), default=None)),
        "max_drawdown_pct": round(float(max_drawdown), 2),
        "sharpe_ratio": round(float(sharpe_ratio), 2),
        "sortino_ratio": round(float(sortino_ratio), 2),
        "profit_factor": round_or_none(profit_factor),
        "expectancy_per_trade": round(float(expectancy), 2),
        "average_trade_return_pct": round(
            sum(trade.get("return_pct", 0) for trade in completed_trades) / len(completed_trades),
            2,
        ) if completed_trades else 0,
        "average_holding_period_days": round(float(average_holding_period), 2),
        "annualized_return_pct": round(float(cagr), 2),
        "volatility_pct": round(float(volatility), 2),
        "total_fees_paid": round(float(total_fees_paid), 2),
        "estimated_slippage_cost": round(float(total_slippage_cost), 2),
        "execution_assumptions": execution_assumptions,
        "regime_timeline": regime_timeline,
        "regime_breakdown": summarize_trades_by_regime(completed_trade_log),
        "equity_curve": equity_curve_points,
        "drawdown_curve": drawdown_curve,
        "benchmark_curve": benchmark_curve,
        "trades": trades,
        "completed_trade_log": completed_trade_log,
        "open_position": None,
        "open_positions_count": len([symbol for symbol in symbols if states[symbol]["shares"] > 0]),
    }
    result.update(calculate_exposure_stats(exposure_curve))
    result["validation"] = build_backtest_validation(result)
    return result


if __name__ == "__main__":
    symbol = input("Enter stock symbol: ").upper()
    initial_cash = float(input("Initial cash: "))
    period = input("Period e.g. 1y, 2y, 5y: ")
    risk_per_trade = float(input("Risk per trade e.g. 0.01 for 1%: "))

    result = run_backtest(symbol, initial_cash, period, risk_per_trade)

    print("\n--- Backtest Result ---")
    for key, value in result.items():
        if key != "trades":
            print(f"{key}: {value}")

    print("\n--- Trades ---")
    for trade in result["trades"]:
        print(trade)
