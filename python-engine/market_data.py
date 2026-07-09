import yfinance as yf


def get_historical_data(
    symbol: str,
    period: str = "6mo",
    interval: str = "1d",
    start=None,
    end=None,
):
    download_kwargs = {
        "tickers": symbol,
        "interval": interval,
        "auto_adjust": True,
        "progress": False,
    }

    if start or end:
        if start:
            download_kwargs["start"] = start
        if end:
            download_kwargs["end"] = end
    else:
        download_kwargs["period"] = period

    data = yf.download(**download_kwargs)

    if data.empty:
        raise ValueError(f"No data found for symbol: {symbol}")

    data = data.reset_index()
    data.columns = [col.lower() if isinstance(col, str) else col[0].lower() for col in data.columns]

    return data
