import argparse
from contextlib import contextmanager

import pandas as pd

import backtest
from market_data import get_historical_data
from overfitting_detector import aggregate_overfitting as summarize_overfitting
from overfitting_detector import detect_overfitting


DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "SPY"]


@contextmanager
def use_window_data(df):
    original_get_historical_data = backtest.get_historical_data

    def get_window_data(symbol, period="5y", interval="1d"):
        return df.copy()

    backtest.get_historical_data = get_window_data

    try:
        yield
    finally:
        backtest.get_historical_data = original_get_historical_data


def slice_window(df, start_date, end_date):
    dated = df.copy()
    dated["date"] = pd.to_datetime(dated["date"]).dt.tz_localize(None)

    return dated[
        (dated["date"] >= start_date)
        & (dated["date"] <= end_date)
    ].reset_index(drop=True)


def run_window_backtest(symbol, df, initial_cash, risk_per_trade):
    with use_window_data(df):
        return backtest.run_backtest(
            symbol=symbol,
            initial_cash=initial_cash,
            period="window",
            risk_per_trade=risk_per_trade,
        )


def summarize_result(result):
    return {
        "strategy_return": result["total_return_pct"],
        "buy_and_hold_return": result["buy_and_hold_return_pct"],
        "win_rate": result["win_rate_pct"],
        "drawdown": result["max_drawdown_pct"],
        "sharpe_ratio": result["sharpe_ratio"],
        "profit_factor": result["profit_factor"],
        "expectancy_per_trade": result["expectancy_per_trade"],
        "average_holding_period_days": result["average_holding_period_days"],
        "annualized_return": result["annualized_return_pct"],
        "volatility": result["volatility_pct"],
        "completed_trades": result["completed_trades"],
    }


def average_results(results):
    if not results:
        return {
            "strategy_return": 0,
            "buy_and_hold_return": 0,
            "win_rate": 0,
            "drawdown": 0,
        }

    return {
        key: round(sum(item[key] for item in results) / len(results), 2)
        for key in results[0]
    }


def run_walk_forward(
    symbols,
    train_start="2020-01-01",
    train_end="2024-12-31",
    test_start="2025-01-01",
    test_end="2026-12-31",
    initial_cash=1000,
    risk_per_trade=0.01,
):
    symbol_results = []
    test_summaries = []

    for symbol in symbols:
        print(f"\n=== {symbol} ===")

        try:
            df = get_historical_data(symbol, period="10y")
            train_df = slice_window(df, train_start, train_end)
            test_df = slice_window(df, test_start, test_end)

            if train_df.empty:
                raise ValueError(f"No train data for {symbol}")

            if test_df.empty:
                raise ValueError(f"No test data for {symbol}")

            train_result = run_window_backtest(
                symbol,
                train_df,
                initial_cash,
                risk_per_trade,
            )
            test_result = run_window_backtest(
                symbol,
                test_df,
                initial_cash,
                risk_per_trade,
            )

            train_summary = summarize_result(train_result)
            test_summary = summarize_result(test_result)
            overfitting = detect_overfitting(train_summary, test_summary)

            symbol_results.append({
                "symbol": symbol,
                "train": train_summary,
                "test": test_summary,
                "overfitting": overfitting,
            })
            test_summaries.append(test_summary)

            print("Train:", f"{train_start} to {train_end}")
            print(
                "  Strategy:",
                f"{train_summary['strategy_return']}%",
                "| Buy & Hold:",
                f"{train_summary['buy_and_hold_return']}%",
                "| Win Rate:",
                f"{train_summary['win_rate']}%",
                "| Drawdown:",
                f"{train_summary['drawdown']}%",
                "| Sharpe:",
                train_summary["sharpe_ratio"],
                "| Profit Factor:",
                train_summary["profit_factor"],
                "| Expectancy:",
                train_summary["expectancy_per_trade"],
                "| Avg Hold:",
                f"{train_summary['average_holding_period_days']} days",
                "| CAGR:",
                f"{train_summary['annualized_return']}%",
                "| Volatility:",
                f"{train_summary['volatility']}%",
            )

            print("Test:", f"{test_start} to {test_end}")
            print(
                "  Strategy:",
                f"{test_summary['strategy_return']}%",
                "| Buy & Hold:",
                f"{test_summary['buy_and_hold_return']}%",
                "| Win Rate:",
                f"{test_summary['win_rate']}%",
                "| Drawdown:",
                f"{test_summary['drawdown']}%",
                "| Sharpe:",
                test_summary["sharpe_ratio"],
                "| Profit Factor:",
                test_summary["profit_factor"],
                "| Expectancy:",
                test_summary["expectancy_per_trade"],
                "| Avg Hold:",
                f"{test_summary['average_holding_period_days']} days",
                "| CAGR:",
                f"{test_summary['annualized_return']}%",
                "| Volatility:",
                f"{test_summary['volatility']}%",
            )
            print(
                "Overfitting Risk:",
                overfitting["overfitting_risk"],
                "| Score:",
                overfitting["risk_score"],
            )
            for check in overfitting["checks"]:
                if check["flagged"]:
                    print("  -", check["message"])

        except Exception as error:
            print(f"Error: {error}")

    aggregate = average_results(test_summaries)
    aggregate_overfitting = summarize_overfitting(symbol_results)

    print("\n=== Aggregate Test Averages ===")
    print("Symbols:", len(symbol_results))
    print("Strategy Return:", f"{aggregate['strategy_return']}%")
    print("Buy & Hold Return:", f"{aggregate['buy_and_hold_return']}%")
    print("Win Rate:", f"{aggregate['win_rate']}%")
    print("Drawdown:", f"{aggregate['drawdown']}%")
    print("Sharpe Ratio:", aggregate["sharpe_ratio"])
    print("Profit Factor:", aggregate["profit_factor"])
    print("Expectancy Per Trade:", aggregate["expectancy_per_trade"])
    print("Average Holding Period:", f"{aggregate['average_holding_period_days']} days")
    print("Annualized Return:", f"{aggregate['annualized_return']}%")
    print("Volatility:", f"{aggregate['volatility']}%")
    print("Overfitting Risk:", aggregate_overfitting["overfitting_risk"])
    print("Average Risk Score:", aggregate_overfitting["average_risk_score"])
    print("High Risk Symbols:", aggregate_overfitting["high_risk_symbols"])
    print("Medium Risk Symbols:", aggregate_overfitting["medium_risk_symbols"])

    return {
        "symbols": symbols,
        "train_window": {"start": train_start, "end": train_end},
        "test_window": {"start": test_start, "end": test_end},
        "results": symbol_results,
        "aggregate": aggregate,
        "aggregate_overfitting": aggregate_overfitting,
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Run walk-forward backtests.")
    parser.add_argument("--symbols", nargs="+", default=DEFAULT_SYMBOLS)
    parser.add_argument("--train-start", default="2020-01-01")
    parser.add_argument("--train-end", default="2024-12-31")
    parser.add_argument("--test-start", default="2025-01-01")
    parser.add_argument("--test-end", default="2026-12-31")
    parser.add_argument("--initial-cash", type=float, default=1000)
    parser.add_argument("--risk-per-trade", type=float, default=0.01)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_walk_forward(
        symbols=args.symbols,
        train_start=args.train_start,
        train_end=args.train_end,
        test_start=args.test_start,
        test_end=args.test_end,
        initial_cash=args.initial_cash,
        risk_per_trade=args.risk_per_trade,
    )
