from ib_insync import IB, Stock
from config import IB_HOST, IB_PORT, IB_CLIENT_ID

ib = IB()


def connect_ib():
    if not ib.isConnected():
        ib.connect(IB_HOST, IB_PORT, clientId=IB_CLIENT_ID)

    return ib


def get_stock_price(symbol: str):
    connect_ib()

    contract = Stock(symbol, "SMART", "USD")
    ib.qualifyContracts(contract)

    ticker = ib.reqMktData(contract)
    ib.sleep(2)

    return {
        "symbol": symbol,
        "last": ticker.last,
        "bid": ticker.bid,
        "ask": ticker.ask,
        "close": ticker.close,
    }