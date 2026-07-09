from collections import defaultdict
from datetime import datetime

from backtest import (
    build_backtest_validation,
    build_execution_assumptions,
    calculate_annualized_volatility,
    calculate_cagr,
    calculate_expectancy,
    calculate_profit_factor,
    calculate_return_series,
    calculate_sharpe_ratio,
    calculate_sortino_ratio,
    determine_position_size,
    generate_research_signal_from_row,
    get_bar_price,
    get_trade_profit,
    get_valid_close_rows,
    round_or_none,
)
from indicators import add_indicators
from market_data import get_historical_data
from metadata import get_symbol_metadata
from matrix_routing import normalize_matrix_key, resolve_allocation_matrix_cell
from regime_engine import classify_regime, summarize_trades_by_regime
from risk import calculate_stop_loss_take_profit
from strategy_conditioning import classify_instrument_type, compute_fit_score
from trade_rules import calculate_trailing_stop, evaluate_long_intraday_exit


def to_number(value, fallback=0):
    try:
        if value is None or value != value:
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def round_value(value, digits=2):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number, digits)


def safe_iso(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def build_monthly_returns(equity_curve):
    if not equity_curve:
        return []

    monthly = {}
    for point in equity_curve:
        date = datetime.fromisoformat(str(point["date"]))
        key = f"{date.year:04d}-{date.month:02d}"
        bucket = monthly.setdefault(key, {"month": key, "start": None, "end": None})
        equity = to_number(point.get("equity"))
        if bucket["start"] is None:
            bucket["start"] = equity
        bucket["end"] = equity

    results = []
    for bucket in monthly.values():
        start = bucket["start"]
        end = bucket["end"]
        results.append({
            "month": bucket["month"],
            "returnPct": round_value(((end - start) / start) * 100 if start else 0),
        })
    return results


def build_annual_returns(equity_curve):
    if not equity_curve:
        return []

    annual = {}
    for point in equity_curve:
        date = datetime.fromisoformat(str(point["date"]))
        key = f"{date.year:04d}"
        bucket = annual.setdefault(key, {"year": key, "start": None, "end": None})
        equity = to_number(point.get("equity"))
        if bucket["start"] is None:
            bucket["start"] = equity
        bucket["end"] = equity

    results = []
    for bucket in annual.values():
        start = bucket["start"]
        end = bucket["end"]
        results.append({
            "year": bucket["year"],
            "returnPct": round_value(((end - start) / start) * 100 if start else 0),
        })
    return results


def calculate_calmar_ratio(cagr, max_drawdown_pct):
    drawdown = abs(to_number(max_drawdown_pct, 0))
    if drawdown <= 0:
        return None
    return to_number(cagr, 0) / drawdown


def normalize_matrix_cells(matrix):
    if isinstance(matrix, dict):
        if isinstance(matrix.get("cells"), list):
            return matrix["cells"]
        if "sector" in matrix and "regime" in matrix:
            return [matrix]
        return [
            {"key": key, **value}
            for key, value in matrix.items()
            if isinstance(value, dict)
        ]
    if isinstance(matrix, list):
        return matrix
    return []


def build_matrix_lookup(matrix):
    lookup = {}
    for cell in normalize_matrix_cells(matrix):
        if not isinstance(cell, dict):
            continue
        key = cell.get("key") or normalize_matrix_key(cell.get("sector"), cell.get("regime"))
        lookup[key] = {
            **cell,
            "key": key,
        }
    return lookup


def strategy_identity(strategy):
    return strategy.get("strategyVersionId") or strategy.get("experimentId") or strategy.get("key")


def build_strategy_lookup(strategies):
    lookup = {}
    for strategy in strategies:
        if not isinstance(strategy, dict):
            continue
        keys = [
            strategy.get("strategyVersionId"),
            strategy.get("experimentId"),
            strategy.get("key"),
        ]
        for key in keys:
            if key:
                lookup[str(key)] = strategy
    return lookup


def build_route_strategy(strategy_lookup, cell):
    if not cell:
        return None
    for key in (
        cell.get("selectedStrategyVersionId"),
        cell.get("selectedExperimentId"),
        cell.get("strategyKey"),
    ):
        if key and str(key) in strategy_lookup:
            return strategy_lookup[str(key)]
    return None


def build_replay_attribution(
    *,
    date,
    symbol,
    sector,
    regime,
    cell,
    strategy,
    allocation_pct,
    deployment_version_id,
):
    return {
        "timestamp": safe_iso(date),
        "symbol": symbol,
        "sector": sector,
        "regime": regime,
        "matrixCell": cell.get("key") if cell else None,
        "selectedStrategy": strategy.get("name") if strategy else None,
        "selectedStrategyVersionId": strategy.get("strategyVersionId") if strategy else None,
        "deploymentVersion": deployment_version_id,
        "allocationWeight": round_value(allocation_pct),
    }


def is_route_active(cell):
    if not cell:
        return False
    if bool(cell.get("active")):
        return True
    return str(cell.get("status") or "").strip().upper() == "ACTIVE"


def run_matrix_replay(config):
    config = config or {}
    deployment = config.get("deployment") or {}
    matrix = deployment.get("matrix") or config.get("matrix") or {}
    matrix_lookup = build_matrix_lookup(matrix)
    strategy_lookup = build_strategy_lookup(config.get("strategies") or [])
    deployment_version_id = (
        deployment.get("deploymentVersionId")
        or deployment.get("deploymentSetId")
        or config.get("deploymentVersionId")
        or config.get("deploymentSetId")
        or "deployment"
    )

    universe = config.get("universe") or {}
    symbol_entries = universe.get("symbols") or config.get("symbols") or []
    symbols = []
    symbol_meta = {}
    for entry in symbol_entries:
        symbol = str(entry.get("symbol") if isinstance(entry, dict) else entry).strip().upper()
        if not symbol or symbol in symbol_meta:
            continue
        symbols.append(symbol)
        symbol_meta[symbol] = {
            "sector": str((entry or {}).get("sector") if isinstance(entry, dict) else "") or None,
            "industry": str((entry or {}).get("industry") if isinstance(entry, dict) else "") or None,
        }

    if not symbols:
        raise ValueError("Matrix replay requires at least one symbol.")

    period = str(config.get("period") or "2y")
    start_date = config.get("startDate") or config.get("start_date")
    end_date = config.get("endDate") or config.get("end_date")
    benchmark_symbol = str(config.get("benchmark") or "SPY")
    initial_cash = float(config.get("initialCash") or config.get("initial_cash") or 100000)
    fee_per_trade = float(config.get("feePerTrade") or config.get("fee_per_trade") or 1)
    execution_assumptions = build_execution_assumptions(
        {"executionAssumptions": config.get("executionAssumptions") or {}},
        fee_per_trade=fee_per_trade,
    )
    default_risk_per_trade = float(config.get("riskPerTrade") or 0.01)
    default_position_sizing = config.get("positionSizing") or {}
    indicator_config = config.get("indicatorConfiguration")

    data_by_symbol = {}
    previous_row_by_symbol = {}
    latest_close_by_symbol = {}
    states = {}
    all_dates = set()
    routing_events = []

    for symbol in symbols:
        df = get_historical_data(symbol, period=period, start=start_date, end=end_date)
        df = add_indicators(df, indicator_config)
        if len(df) <= 50:
            continue
        trimmed = df.iloc[50:].copy()
        trimmed["date"] = trimmed["date"].apply(
            lambda value: value.to_pydatetime() if hasattr(value, "to_pydatetime") else value
        )
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
            "strategy_key": None,
            "matrix_cell_key": None,
            "allocation_pct": 0,
            "deployment_version_id": deployment_version_id,
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
    total_turnover = 0
    strategy_selection_counts = defaultdict(int)
    strategy_trade_counts = defaultdict(int)
    cell_trade_counts = defaultdict(int)
    symbol_attribution = defaultdict(lambda: {
        "symbol": None,
        "trades": 0,
        "notional": 0,
        "pnl": 0,
        "strategies": defaultdict(int),
    })

    ordered_dates = sorted(all_dates)
    if not ordered_dates:
        raise ValueError("Matrix replay produced no equity observations.")

    def active_strategies_attribution():
        rows = []
        for key, bucket in strategy_trade_counts.items():
            rows.append({"strategyKey": key, "trades": bucket})
        return rows

    def close_position(symbol, state, exit_price, exit_date, exit_reason, current_strategy, current_cell, current_sector, current_regime):
        nonlocal cash, total_fees_paid, total_slippage_cost, total_turnover
        market_exit_price = float(exit_price)
        filled_exit_price = market_exit_price
        if execution_assumptions:
            from backtest import apply_fill_price, calculate_execution_fee
            filled_exit_price = apply_fill_price(market_exit_price, "SELL", execution_assumptions)
            shares = int(state["shares"])
            notional = shares * filled_exit_price
            exit_fee = calculate_execution_fee(notional, execution_assumptions)
        else:
            shares = int(state["shares"])
            notional = shares * filled_exit_price
            exit_fee = 0
        cash += notional - exit_fee
        total_fees_paid += exit_fee
        total_turnover += notional
        total_slippage_cost += max(0, (market_exit_price - filled_exit_price) * shares)
        holding_period_days = (
            (exit_date - state["entry_date"]).days if state["entry_date"] is not None else 0
        )
        entry_regime = (
            state["entry_signal_data"].get("market_regime")
            if state["entry_signal_data"]
            else current_regime
        )
        profit = (
            (filled_exit_price - float(state["entry_price"])) * shares
            - float(state["entry_fee_paid"] or 0)
            - exit_fee
        )
        trade = {
            "symbol": symbol,
            "sector": current_sector,
            "regime": entry_regime,
            "exit_regime": current_regime,
            "deploymentVersion": deployment_version_id,
            "deploymentVersionId": deployment_version_id,
            "matrixCell": current_cell.get("key") if current_cell else None,
            "selectedStrategy": current_strategy.get("name") if current_strategy else None,
            "selectedStrategyVersionId": current_strategy.get("strategyVersionId") if current_strategy else None,
            "allocationWeight": round_value(state.get("allocation_pct")),
            "entry_date": safe_iso(state["entry_date"]),
            "exit_date": safe_iso(exit_date),
            "side": "BUY",
            "entry_price": round_value(state["entry_price"]),
            "exit_price": round_value(filled_exit_price),
            "shares": shares,
            "pnl": round_value(profit),
            "profit": round_value(profit),
            "return_pct": round_value(((filled_exit_price - float(state["entry_price"])) / float(state["entry_price"])) * 100),
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
                "matrixCell": current_cell.get("key") if current_cell else None,
                "deploymentVersion": deployment_version_id,
                "exitRegime": current_regime,
            },
        }
        completed_trade_log.append(trade)
        trades.append({
            "type": "SELL",
            "date": safe_iso(exit_date),
            "price": round_value(filled_exit_price),
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
            "strategy_key": None,
            "matrix_cell_key": None,
            "allocation_pct": 0,
        })
        strategy_trade_counts[strategy_identity(current_strategy)] += 1
        cell_trade_counts[current_cell.get("key") if current_cell else "UNKNOWN"] += 1
        symbol_bucket = symbol_attribution[symbol]
        symbol_bucket["symbol"] = symbol
        symbol_bucket["trades"] += 1
        symbol_bucket["notional"] += notional
        symbol_bucket["pnl"] += profit
        if current_strategy:
            symbol_bucket["strategies"][strategy_identity(current_strategy)] += 1

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
            metadata = get_symbol_metadata(symbol)
            sector = (symbol_meta.get(symbol, {}) or {}).get("sector") or metadata.get("sector") or "UNKNOWN"
            industry = (symbol_meta.get(symbol, {}) or {}).get("industry") or metadata.get("industry") or "UNKNOWN"
            row_regime = classify_regime(row)
            regime_timeline.append({"date": safe_iso(date), "symbol": symbol, "regime": row_regime})

            cell = resolve_allocation_matrix_cell(matrix_lookup, sector, row_regime)
            strategy = build_route_strategy(strategy_lookup, cell)
            strategy_key = strategy_identity(strategy) if strategy else None
            strategy_selection_counts[strategy_key or "SIT_OUT"] += 1
            attribution = build_replay_attribution(
                date=date,
                symbol=symbol,
                sector=sector,
                regime=row_regime,
                cell=cell or {},
                strategy=strategy or {},
                allocation_pct=cell.get("allocationPct") if cell else 0,
                deployment_version_id=deployment_version_id,
            )
            routing_events.append({
                **attribution,
                "status": cell.get("status") if cell else "SIT_OUT",
            })

            if state["shares"] > 0:
                active_strategy = strategy or state.get("entry_signal_data", {}).get("strategy") or {}
                signal_data = generate_research_signal_from_row(
                    row,
                    active_strategy,
                    context={
                        "previous_row": previous_row_by_symbol.get(symbol),
                        "regime": row_regime,
                        "symbol": symbol,
                        "sector": sector,
                        "industry": industry,
                        "deploymentVersion": deployment_version_id,
                        "matrixCell": cell,
                        "allocationPct": cell.get("allocationPct") if cell else 0,
                    },
                )
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
                    and state["entry_date"] is not None
                    and signal_data.get("signal") == "SELL"
                ):
                    should_exit = True
                    exit_reason = "STRATEGY_SELL"
                    exit_price = open_price

                if should_exit:
                    close_position(
                        symbol,
                        state,
                        exit_price,
                        date,
                        exit_reason,
                        active_strategy,
                        cell or {},
                        sector,
                        row_regime,
                    )

            if state["shares"] == 0 and is_route_active(cell) and strategy:
                signal_data = generate_research_signal_from_row(
                    row,
                    strategy,
                    context={
                        "previous_row": previous_row_by_symbol.get(symbol),
                        "regime": row_regime,
                        "symbol": symbol,
                        "sector": sector,
                        "industry": industry,
                        "deploymentVersion": deployment_version_id,
                        "matrixCell": cell,
                        "allocationPct": cell.get("allocationPct") or 0,
                    },
                )
                fit = compute_fit_score(
                    {
                        "symbol": symbol,
                        "sector": sector,
                        "regime": row_regime,
                        "volatility": row.get("volatility_20"),
                        "averageVolume": row.get("volume_sma_20") or row.get("volume"),
                        "metadata": metadata,
                    },
                    (strategy.get("strategyJson") or {}).get("executable", {}).get("envelope", {}),
                )
                signal_data["fit"] = fit
                signal_data["market_regime"] = row_regime
                signal_data["instrument_type"] = classify_instrument_type(symbol, metadata)
                signal_data["strategy"] = strategy
                signal_data["allocationWeight"] = cell.get("allocationPct") if cell else 0
                if signal_data.get("signal") == "BUY":
                    entry_candidates.append({
                        "symbol": symbol,
                        "state": state,
                        "row": row,
                        "date": date,
                        "open_price": open_price,
                        "signal_atr": float(row["atr_14"]),
                        "signal_data": signal_data,
                        "strategy": strategy,
                        "cell": cell,
                        "sector": sector,
                        "regime": row_regime,
                        "allocation_pct": cell.get("allocationPct") or 0,
                    })

            previous_row_by_symbol[symbol] = row

        entry_candidates.sort(
            key=lambda item: (
                -float(item["signal_data"].get("confidence", 0)),
                str(item["symbol"]),
            )
        )

        for candidate in entry_candidates:
            state = candidate["state"]
            if state["shares"] > 0:
                continue

            cell = candidate["cell"] or {}
            allocation_pct = float(candidate["allocation_pct"] or 0)
            if allocation_pct <= 0:
                continue

            fill_price = candidate["open_price"]
            if execution_assumptions:
                from backtest import apply_fill_price, calculate_execution_fee
                fill_price = apply_fill_price(candidate["open_price"], "BUY", execution_assumptions)
            account_value = cash + sum(
                states[item_symbol]["shares"] * latest_close_by_symbol.get(item_symbol, 0)
                for item_symbol in symbols
            )
            proposed_stop, proposed_take_profit = calculate_stop_loss_take_profit(
                candidate["open_price"],
                candidate["signal_atr"],
                stop_loss_atr_multiple=((candidate["strategy"].get("strategyJson") or {}).get("executable", {}).get("parameters", {}) or {}).get("atrStopMultiple", 1.5),
                take_profit_atr_multiple=((candidate["strategy"].get("strategyJson") or {}).get("executable", {}).get("parameters", {}) or {}).get("atrTakeProfitMultiple", 8),
            )
            remaining_slots = max(1, len([item for item in entry_candidates if states[item["symbol"]]["shares"] == 0]))
            position_size, was_partial_fill = determine_position_size(
                account_value=account_value,
                cash=cash,
                entry_price=fill_price,
                stop_loss=proposed_stop,
                risk_per_trade=float((candidate["strategy"].get("strategyJson") or {}).get("executable", {}).get("positionSizing", {}).get("riskPerTrade", default_risk_per_trade)),
                position_sizing=(candidate["strategy"].get("strategyJson") or {}).get("executable", {}).get("positionSizing", default_position_sizing),
                row=candidate["row"],
                assumptions=execution_assumptions,
                remaining_slots=remaining_slots,
            )
            allocation_cap_shares = int((account_value * (allocation_pct / 100)) // max(fill_price, 1e-9))
            position_size = min(position_size, allocation_cap_shares)
            if position_size <= 0:
                continue

            entry_fee = 0
            if execution_assumptions:
                from backtest import calculate_execution_fee
                entry_fee = calculate_execution_fee(position_size * fill_price, execution_assumptions)
            if cash < (position_size * fill_price) + entry_fee:
                continue

            state.update({
                "shares": position_size,
                "entry_price": fill_price,
                "entry_date": candidate["date"],
                "entry_fee_paid": entry_fee,
                "entry_confidence": candidate["signal_data"]["confidence"],
                "entry_signal_data": candidate["signal_data"],
                "stop_loss": proposed_stop,
                "trailing_stop": calculate_trailing_stop(
                    close=fill_price,
                    atr=candidate["signal_atr"],
                    atr_multiple=((candidate["strategy"].get("strategyJson") or {}).get("executable", {}).get("parameters", {}) or {}).get("trailingStopAtrMultiple", 2),
                ),
                "take_profit": proposed_take_profit,
                "strategy_key": strategy_identity(candidate["strategy"]),
                "matrix_cell_key": cell.get("key"),
                "allocation_pct": allocation_pct,
                "deployment_version_id": deployment_version_id,
            })
            cash -= (position_size * fill_price) + entry_fee
            total_fees_paid += entry_fee
            total_turnover += position_size * fill_price
            total_slippage_cost += max(0, (fill_price - candidate["open_price"]) * position_size)
            trades.append({
                "type": "BUY",
                "symbol": candidate["symbol"],
                "sector": candidate["sector"],
                "regime": candidate["regime"],
                "matrixCell": cell.get("key"),
                "deploymentVersion": deployment_version_id,
                "selectedStrategy": candidate["strategy"].get("name"),
                "selectedStrategyVersionId": candidate["strategy"].get("strategyVersionId"),
                "allocationWeight": round_value(allocation_pct),
                "signal_date": safe_iso(candidate["state"]["pending_signal"]["date"]) if candidate["state"].get("pending_signal") else safe_iso(candidate["date"]),
                "date": safe_iso(candidate["date"]),
                "price": round_value(fill_price),
                "shares": int(position_size),
                "partial_fill": was_partial_fill,
                "stop_loss": round_value(state["stop_loss"]),
                "trailing_stop": round_value(state["trailing_stop"]),
                "take_profit": round_value(state["take_profit"]),
                "confidence": round_or_none(state["entry_confidence"]),
                "reasons": candidate["signal_data"].get("reasons", []),
                "decision_snapshot": {
                    "entryReason": "; ".join(candidate["signal_data"].get("reasons", [])),
                    "exitReason": None,
                    "indicatorContributions": candidate["signal_data"].get("score_decomposition", []),
                    "ruleTree": candidate["signal_data"].get("rule_tree") or candidate["signal_data"].get("ruleTree"),
                    "confidence": round_or_none(state["entry_confidence"]),
                    "matrixCell": cell.get("key"),
                    "deploymentVersion": deployment_version_id,
                },
            })
            strategy_trade_counts[strategy_identity(candidate["strategy"])] += 1
            cell_trade_counts[cell.get("key")] += 1

        for symbol in symbols:
            row = data_by_symbol.get(symbol, {}).get(date)
            state = states.get(symbol)
            if row is None or state is None or state["shares"] <= 0:
                continue
            state["trailing_stop"] = calculate_trailing_stop(
                close=float(row["close"]),
                atr=float(row["atr_14"]),
                current_trailing_stop=state["trailing_stop"],
                atr_multiple=((state.get("entry_signal_data") or {}).get("strategy", {}).get("strategyJson") or {}).get("executable", {}).get("parameters", {}).get("trailingStopAtrMultiple", 2),
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
        equity_curve_points.append({"date": safe_iso(date), "equity": round_value(account_value)})

    for symbol, state in states.items():
        if state["shares"] <= 0:
            continue
        final_row = next(reversed(data_by_symbol.get(symbol, {}) or {}), None)
        if final_row is None:
            continue
        final_price = float(data_by_symbol[symbol][final_row]["close"])
        current_strategy = state.get("entry_signal_data", {}).get("strategy") or {}
        metadata = get_symbol_metadata(symbol)
        close_position(
            symbol,
            state,
            final_price,
            final_row,
            "END_OF_REPLAY",
            current_strategy,
            matrix_lookup.get(state.get("matrix_cell_key")) or {},
            (symbol_meta.get(symbol, {}) or {}).get("sector")
            or metadata.get("sector")
            or "UNKNOWN",
            classify_regime(data_by_symbol[symbol][final_row]),
        )

    if not equity_curve:
        raise ValueError("Matrix replay produced no equity observations.")

    completed_trades = completed_trade_log
    winning_trades = [trade for trade in completed_trades if get_trade_profit(trade) > 0]
    losing_trades = [trade for trade in completed_trades if get_trade_profit(trade) <= 0]
    total_profit = sum(trade["pnl"] for trade in completed_trades)
    returns = calculate_return_series(equity_curve)
    sharpe_ratio = calculate_sharpe_ratio(returns)
    sortino_ratio = calculate_sortino_ratio(returns)
    profit_factor = calculate_profit_factor(winning_trades, losing_trades)
    expectancy = calculate_expectancy(completed_trades)
    average_holding_period = sum(
        trade.get("holding_period_days", 0) for trade in completed_trades
    ) / max(1, len(completed_trades))
    final_value = equity_curve[-1]
    total_return_pct = ((final_value - initial_cash) / initial_cash) * 100

    peak = equity_curve[0]
    max_drawdown = 0
    for point, value in zip(equity_curve_points, equity_curve):
        peak = max(peak, value)
        drawdown = ((peak - value) / peak) * 100 if peak > 0 else 0
        max_drawdown = max(max_drawdown, drawdown)
        drawdown_curve.append({"date": point["date"], "drawdown": round_value(drawdown)})

    first_symbol_rows = next(iter(data_by_symbol.values()))
    first_symbol_values = list(first_symbol_rows.values())
    start_price = float(first_symbol_values[0]["close"])
    end_price = float(first_symbol_values[-1]["close"])
    buy_and_hold_return_pct = ((end_price - start_price) / start_price) * 100 if start_price else 0
    cagr = calculate_cagr(
        initial_cash=initial_cash,
        final_value=final_value,
        start_date=ordered_dates[0],
        end_date=ordered_dates[-1],
    )
    volatility = calculate_annualized_volatility(returns)
    monthly_returns = build_monthly_returns(equity_curve_points)
    annual_returns = build_annual_returns(equity_curve_points)
    calmar = calculate_calmar_ratio(cagr, max_drawdown)

    benchmark_curve = []
    benchmark_return_pct = None
    try:
        benchmark_df = get_historical_data(benchmark_symbol, period=period, start=start_date, end=end_date)
        benchmark_valid_rows = get_valid_close_rows(benchmark_df)
        if len(benchmark_valid_rows) > 1:
            benchmark_start = float(benchmark_valid_rows.iloc[0]["close"])
            benchmark_end = float(benchmark_valid_rows.iloc[-1]["close"])
            benchmark_return_pct = ((benchmark_end - benchmark_start) / benchmark_start) * 100 if benchmark_start else None
            benchmark_shares = int(initial_cash // benchmark_start)
            benchmark_cash = initial_cash - (benchmark_shares * benchmark_start)
            for _, row in benchmark_valid_rows.iloc[50 if len(benchmark_valid_rows) > 50 else 0 :].iterrows():
                benchmark_value = benchmark_cash + (benchmark_shares * float(row["close"]))
                benchmark_curve.append({
                    "date": safe_iso(row["date"]),
                    "benchmark": round_value(benchmark_value),
                })
    except Exception:
        benchmark_curve = []
        benchmark_return_pct = None

    sector_exposure = defaultdict(float)
    strategy_utilization = defaultdict(lambda: {"strategyKey": None, "bars": 0, "trades": 0})
    allocation_utilization = defaultdict(float)
    for event in routing_events:
        key = event.get("matrixCell") or "UNKNOWN"
        allocation_utilization[key] += float(event.get("allocationWeight") or 0)
        strategy_key = event.get("selectedStrategyVersionId") or event.get("selectedStrategy") or "SIT_OUT"
        strategy_utilization[strategy_key]["strategyKey"] = strategy_key
        strategy_utilization[strategy_key]["bars"] += 1

    for trade in completed_trades:
        sector_exposure[trade.get("sector") or "UNKNOWN"] += float(trade.get("allocationWeight") or 0)
        strategy_key = trade.get("selectedStrategyVersionId") or trade.get("selectedStrategy") or "SIT_OUT"
        strategy_utilization[strategy_key]["strategyKey"] = strategy_key
        strategy_utilization[strategy_key]["trades"] += 1

    result = {
        "deploymentVersionId": deployment_version_id,
        "generatedAt": safe_iso(datetime.now()),
        "symbols": symbols,
        "initial_cash": round_value(initial_cash),
        "final_value": round_value(final_value),
        "total_return_pct": round_value(total_return_pct),
        "buy_and_hold_return_pct": round_value(buy_and_hold_return_pct),
        "cagr": round_value(cagr),
        "sharpe": round_value(sharpe_ratio),
        "sortino": round_value(sortino_ratio),
        "calmar": round_value(calmar),
        "volatility_pct": round_value(volatility),
        "profit_factor": round_or_none(profit_factor),
        "expectancy_per_trade": round_value(expectancy),
        "average_holding_period_days": round_value(average_holding_period),
        "max_drawdown_pct": round_value(max_drawdown),
        "completed_trades": len(completed_trades),
        "win_rate_pct": round_value((len(winning_trades) / len(completed_trades) * 100) if completed_trades else 0),
        "total_profit": round_value(total_profit),
        "total_fees_paid": round_value(total_fees_paid),
        "estimated_slippage_cost": round_value(total_slippage_cost),
        "turnover": round_value(total_turnover),
        "benchmark_return_pct": round_or_none(benchmark_return_pct),
        "benchmark_curve": benchmark_curve,
        "equity_curve": equity_curve_points,
        "drawdown_curve": drawdown_curve,
        "monthly_returns": monthly_returns,
        "annual_returns": annual_returns,
        "exposure_timeline": [
            {"date": point["date"], "exposurePct": round_value(exposure)}
            for point, exposure in zip(equity_curve_points, exposure_curve)
        ],
        "sector_exposure": [
            {"sector": sector, "allocationPct": round_value(value)}
            for sector, value in sector_exposure.items()
        ],
        "strategy_utilization": list(strategy_utilization.values()),
        "allocation_utilization": [
            {"matrixCell": key, "allocationWeight": round_value(value)}
            for key, value in allocation_utilization.items()
        ],
        "trade_attribution": completed_trades,
        "trades": trades,
        "completed_trade_log": completed_trade_log,
        "regime_timeline": regime_timeline,
        "regime_breakdown": summarize_trades_by_regime(completed_trade_log),
        "routing_events": routing_events,
        "symbol_attribution": [
            {
                "symbol": bucket["symbol"],
                "trades": bucket["trades"],
                "notional": round_value(bucket["notional"]),
                "pnl": round_value(bucket["pnl"]),
                "strategies": dict(bucket["strategies"]),
            }
            for bucket in symbol_attribution.values()
        ],
        "validation": build_backtest_validation({
            "completed_trades": len(completed_trades),
            "completed_trade_log": completed_trade_log,
            "buy_and_hold_return_pct": buy_and_hold_return_pct,
            "benchmark_return_pct": benchmark_return_pct,
            "profit_factor": profit_factor,
            "average_winner": round_value(sum(trade["pnl"] for trade in winning_trades) / len(winning_trades) if winning_trades else None),
            "average_loser": round_value(sum(trade["pnl"] for trade in losing_trades) / len(losing_trades) if losing_trades else None),
            "largest_winner": round_value(max((trade["pnl"] for trade in winning_trades), default=None)),
            "largest_loser": round_value(min((trade["pnl"] for trade in losing_trades), default=None)),
            "average_holding_period_days": round_value(average_holding_period),
        }),
    }
    result["portfolio"] = {
        "portfolio_equity_curve": equity_curve_points,
        "portfolio_drawdown_curve": drawdown_curve,
        "portfolio_sharpe": round_value(sharpe_ratio),
        "portfolio_sortino": round_value(sortino_ratio),
    }
    result["attribution"] = {
        "deploymentVersionId": deployment_version_id,
        "matrixCells": list(matrix_lookup.values()),
        "strategyUtilization": list(strategy_utilization.values()),
        "symbolAttribution": result["symbol_attribution"],
    }
    return result
