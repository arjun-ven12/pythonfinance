import argparse
import json
from pathlib import Path

import pandas as pd

from backtest import (
    calculate_annualized_volatility,
    calculate_cagr,
    calculate_return_series,
    calculate_sharpe_ratio,
)
from market_data import get_historical_data


REBALANCE_FREQUENCIES = {
    "weekly": "W",
    "monthly": "M",
    "quarterly": "Q",
    "annual": "Y",
}


def load_scanner_opportunities(filename):
    with open(filename, "r") as file:
        data = json.load(file)

    return data.get("opportunities", [])


def get_top_symbols(opportunities, limit=10, signals=None):
    if signals:
        allowed_signals = {signal.upper() for signal in signals}
        opportunities = [
            item for item in opportunities
            if item.get("signal", "").upper() in allowed_signals
        ]

    ranked = sorted(
        opportunities,
        key=lambda item: item.get("opportunity_score", 0),
        reverse=True,
    )

    return [item["symbol"] for item in ranked[:limit]]


def get_close_series(symbol, period):
    df = get_historical_data(symbol, period=period)
    close = df[["date", "close"]].copy()
    close["date"] = pd.to_datetime(close["date"]).dt.tz_localize(None)
    close = close.set_index("date").sort_index()
    close.columns = [symbol]
    return close[symbol]


def build_price_frame(symbols, period):
    prices = []

    for symbol in symbols:
        try:
            prices.append(get_close_series(symbol, period))
            print(f"Loaded {symbol}")
        except Exception as error:
            print(f"Skipping {symbol}: {error}")

    if not prices:
        raise ValueError("No usable price data found.")

    price_frame = pd.concat(prices, axis=1).ffill().dropna()

    if price_frame.empty:
        raise ValueError("Price history is empty after alignment.")

    return price_frame


def get_rebalance_dates(price_frame, frequency="monthly"):
    period_frequency = REBALANCE_FREQUENCIES.get(frequency)

    if period_frequency is None:
        valid = ", ".join(REBALANCE_FREQUENCIES)
        raise ValueError(f"Invalid rebalance frequency. Use one of: {valid}")

    rebalance_dates = (
        price_frame
        .groupby(price_frame.index.to_period(period_frequency))
        .head(1)
        .index
    )

    return set(rebalance_dates)


def run_equal_weight_portfolio(
    price_frame,
    initial_cash=10000,
    rebalance_frequency="monthly",
):
    cash = initial_cash
    shares = {symbol: 0 for symbol in price_frame.columns}
    equity_curve = []
    rebalance_count = 0
    rebalance_dates = get_rebalance_dates(price_frame, rebalance_frequency)

    for date, prices in price_frame.iterrows():
        portfolio_value = cash + sum(
            shares[symbol] * prices[symbol]
            for symbol in price_frame.columns
        )

        if date in rebalance_dates:
            allocation = portfolio_value / len(price_frame.columns)
            shares = {
                symbol: allocation / prices[symbol]
                for symbol in price_frame.columns
            }
            cash = 0
            portfolio_value = sum(
                shares[symbol] * prices[symbol]
                for symbol in price_frame.columns
            )
            rebalance_count += 1

        equity_curve.append({
            "date": date,
            "equity": float(portfolio_value),
        })

    return pd.DataFrame(equity_curve).set_index("date"), rebalance_count


def run_buy_and_hold_benchmark(price_series, initial_cash=10000):
    first_price = float(price_series.iloc[0])
    shares = initial_cash / first_price
    equity = price_series * shares

    return pd.DataFrame({"equity": equity})


def calculate_max_drawdown(equity_curve):
    peak = equity_curve[0] if equity_curve else 0
    max_drawdown = 0

    for value in equity_curve:
        peak = max(peak, value)

        if peak > 0:
            drawdown = ((peak - value) / peak) * 100
            max_drawdown = max(max_drawdown, drawdown)

    return max_drawdown


def calculate_annual_returns(equity_frame):
    annual_returns = {}
    grouped = equity_frame.groupby(equity_frame.index.year)

    for year, frame in grouped:
        start_value = float(frame["equity"].iloc[0])
        end_value = float(frame["equity"].iloc[-1])

        if start_value > 0:
            annual_returns[str(year)] = round(
                ((end_value - start_value) / start_value) * 100,
                2,
            )

    return annual_returns


def summarize_equity_curve(equity_frame):
    equity_curve = equity_frame["equity"].tolist()
    returns = calculate_return_series(equity_curve)
    start_date = equity_frame.index[0]
    end_date = equity_frame.index[-1]

    return {
        "cagr": round(
            float(calculate_cagr(equity_curve[0], equity_curve[-1], start_date, end_date)),
            2,
        ),
        "total_return": round(
            ((equity_curve[-1] - equity_curve[0]) / equity_curve[0]) * 100,
            2,
        ),
        "sharpe_ratio": round(float(calculate_sharpe_ratio(returns)), 2),
        "max_drawdown": round(float(calculate_max_drawdown(equity_curve)), 2),
        "annual_returns": calculate_annual_returns(equity_frame),
        "volatility": round(float(calculate_annualized_volatility(returns)), 2),
    }


def print_summary(title, summary):
    print(f"\n=== {title} ===")
    print("CAGR:", f"{summary['cagr']}%")
    print("Total Return:", f"{summary['total_return']}%")
    print("Sharpe Ratio:", summary["sharpe_ratio"])
    print("Max Drawdown:", f"{summary['max_drawdown']}%")
    print("Volatility:", f"{summary['volatility']}%")
    print("Annual Returns:")

    for year, annual_return in summary["annual_returns"].items():
        print(f"  {year}: {annual_return}%")


def equity_curve_to_records(equity_frame):
    records = []

    for date, row in equity_frame.iterrows():
        records.append({
            "date": date.date().isoformat(),
            "equity": round(float(row["equity"]), 2),
        })

    return records


def run_portfolio_backtest(
    scan_results_file,
    top_n=10,
    period="5y",
    initial_cash=10000,
    rebalance_frequency="monthly",
    signals=None,
):
    opportunities = load_scanner_opportunities(scan_results_file)
    symbols = get_top_symbols(opportunities, top_n, signals)

    if not symbols:
        raise ValueError("No scanner opportunities matched the portfolio criteria.")

    print("Portfolio symbols:", ", ".join(symbols))
    print("Rebalance frequency:", rebalance_frequency)

    portfolio_prices = build_price_frame(symbols, period)
    portfolio_equity, rebalance_count = run_equal_weight_portfolio(
        portfolio_prices,
        initial_cash,
        rebalance_frequency,
    )

    spy_prices = (
        get_close_series("SPY", period)
        .reindex(portfolio_equity.index)
        .ffill()
        .bfill()
    )
    spy_equity = run_buy_and_hold_benchmark(spy_prices, initial_cash)

    portfolio_summary = summarize_equity_curve(portfolio_equity)
    portfolio_summary["number_of_rebalances"] = rebalance_count
    spy_summary = summarize_equity_curve(spy_equity)

    print_summary("Equal-Weight Portfolio", portfolio_summary)
    print("Number of Rebalances:", portfolio_summary["number_of_rebalances"])
    print_summary("SPY Benchmark", spy_summary)

    return {
        "symbols": symbols,
        "period": period,
        "initial_cash": initial_cash,
        "rebalance_frequency": rebalance_frequency,
        "number_of_holdings": len(symbols),
        "summary_stats": portfolio_summary,
        "equity_curve": equity_curve_to_records(portfolio_equity),
        "benchmark_comparison": {
            "portfolio": portfolio_summary,
            "benchmark": {
                "symbol": "SPY",
                **spy_summary,
            },
            "benchmark_equity_curve": equity_curve_to_records(spy_equity),
        },
        "portfolio": portfolio_summary,
        "benchmark": {
            "symbol": "SPY",
            **spy_summary,
        },
    }


def parse_args():
    parser = argparse.ArgumentParser(
        description="Backtest a rebalanced portfolio from scanner results."
    )
    parser.add_argument("--scan-results-file")
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--period", default="5y")
    parser.add_argument("--initial-cash", type=float, default=10000)
    parser.add_argument(
        "--rebalance-frequency",
        choices=sorted(REBALANCE_FREQUENCIES),
        default="monthly",
    )
    parser.add_argument("--signals", nargs="*", default=None)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if not args.scan_results_file:
        raise SystemExit(
            "--scan-results-file is required. Pass a Prisma export or explicit research input."
        )

    run_portfolio_backtest(
        scan_results_file=args.scan_results_file,
        top_n=args.top,
        period=args.period,
        initial_cash=args.initial_cash,
        rebalance_frequency=args.rebalance_frequency,
        signals=args.signals,
    )
