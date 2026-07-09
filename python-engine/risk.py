import math


def _finite_number(value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None

    return parsed if math.isfinite(parsed) else None


def calculate_position_size(account_value, risk_per_trade, entry_price, stop_loss):
    account_value = _finite_number(account_value)
    risk_per_trade = _finite_number(risk_per_trade)
    entry_price = _finite_number(entry_price)
    stop_loss = _finite_number(stop_loss)

    if (
        account_value is None
        or risk_per_trade is None
        or entry_price is None
        or stop_loss is None
        or account_value <= 0
        or risk_per_trade <= 0
        or entry_price <= 0
    ):
        return 0

    risk_amount = account_value * risk_per_trade
    risk_per_share = abs(entry_price - stop_loss)

    if not math.isfinite(risk_per_share) or risk_per_share <= 0:
        return 0

    return int(risk_amount // risk_per_share)


def calculate_stop_loss_take_profit(
    entry_price,
    atr,
    stop_loss_atr_multiple=1.5,
    take_profit_atr_multiple=8,
):
    entry_price = _finite_number(entry_price)
    atr = _finite_number(atr)
    stop_loss_atr_multiple = _finite_number(stop_loss_atr_multiple)
    take_profit_atr_multiple = _finite_number(take_profit_atr_multiple)

    if (
        entry_price is None
        or atr is None
        or stop_loss_atr_multiple is None
        or take_profit_atr_multiple is None
        or entry_price <= 0
        or atr <= 0
    ):
        return None, None

    stop_loss = entry_price - (stop_loss_atr_multiple * atr)
    take_profit = entry_price + (take_profit_atr_multiple * atr)

    return stop_loss, take_profit
