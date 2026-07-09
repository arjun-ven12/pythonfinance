def calculate_trailing_stop(close, atr, current_trailing_stop=None, atr_multiple=2):
    proposed_stop = close - (atr_multiple * atr)

    if current_trailing_stop is None:
        return proposed_stop

    return max(current_trailing_stop, proposed_stop)


def evaluate_long_intraday_exit(
    open_price,
    high_price,
    low_price,
    stop_loss,
    take_profit=None,
    trailing_stop=None,
):
    active_stop = float(stop_loss)
    stop_reason = "STOP_LOSS"

    if trailing_stop is not None and float(trailing_stop) > active_stop:
        active_stop = float(trailing_stop)
        stop_reason = "TRAILING_STOP"

    open_price = float(open_price)
    high_price = float(high_price)
    low_price = float(low_price)

    # Gap-through stops fill at the opening price. Gap-through profit targets
    # use the target price so the simulation does not assume favorable slippage.
    if open_price <= active_stop:
        return True, stop_reason, open_price

    if take_profit is not None and open_price >= float(take_profit):
        return True, "TAKE_PROFIT", float(take_profit)

    stop_hit = low_price <= active_stop
    target_hit = (
        take_profit is not None and high_price >= float(take_profit)
    )

    # Daily bars do not reveal which threshold traded first. Assuming the stop
    # first is the conservative result when both were reachable.
    if stop_hit:
        return True, stop_reason, active_stop

    if target_hit:
        return True, "TAKE_PROFIT", float(take_profit)

    return False, None, None


def should_exit_position(row, close, stop_loss, signal, trailing_stop=None):
    ema_20 = float(row["ema_20"])
    ema_50 = float(row["ema_50"])

    strong_uptrend = close > ema_50 and ema_20 > ema_50

    if close <= stop_loss:
        return True, "STOP_LOSS"

    if trailing_stop is not None and close <= trailing_stop:
        return True, "TRAILING_STOP"

    if signal == "SELL" and not strong_uptrend:
        return True, "STRATEGY_SELL"

    return False, None
