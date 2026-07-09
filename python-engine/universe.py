import certifi
import pandas as pd
import urllib.request


LARGE_CAP_CANDIDATES = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "LLY",
    "JPM", "V", "UNH", "XOM", "MA", "COST", "HD", "PG", "NFLX", "BAC", "AMD",
]
MID_CAP_CANDIDATES = [
    "CELH", "DUOL", "FIVE", "WING", "CAVA", "ALAB", "APPF", "INSP", "BILL",
    "ESTC", "ONON", "RIVN", "CHWY", "W", "DOCN", "TOST", "PATH", "U", "GTLB",
]
SMALL_CAP_CANDIDATES = [
    "SOFI", "PLTR", "IONQ", "RKLB", "OPEN", "ASTS", "SOUN", "HIMS", "RXRX",
    "UPST", "LMND", "BBAI", "AI", "JOBY", "ACHR", "DNA", "ENVX", "CRSP",
]
HIGH_GROWTH_HIGH_RISK_CANDIDATES = [
    "IONQ", "RKLB", "ASTS", "SOUN", "ACHR", "JOBY", "BBAI", "RXRX", "OPEN",
    "UPST", "LMND", "DNA", "ENVX", "CRSP", "RGTI", "QBTS", "SERV", "LUNR",
]
SGX_CANDIDATES = [
    "D05.SI",   # DBS Group
    "O39.SI",   # OCBC
    "U11.SI",   # UOB
    "Z74.SI",   # Singtel
    "C38U.SI",  # CapitaLand Integrated Commercial Trust
    "C09.SI",   # City Developments
    "S68.SI",   # Singapore Exchange
    "A17U.SI",  # CapitaLand Ascendas REIT
    "J36.SI",   # Jardine Matheson
    "BN4.SI",   # Keppel
    "C6L.SI",   # Singapore Airlines
    "G13.SI",   # Genting Singapore
    "N2IU.SI",  # Mapletree Pan Asia Commercial Trust
    "M44U.SI",  # Mapletree Logistics Trust
    "ME8U.SI",  # Mapletree Industrial Trust
    "F9D.SI",   # Boustead Singapore
    "U96.SI",   # Sembcorp Industries
    "Y92.SI",   # Thai Beverage
    "V03.SI",   # Venture
    "S58.SI",   # SATS
]


def get_sp500_symbols(limit=100):
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"}
    )

    context = urllib.request.ssl.create_default_context(
        cafile=certifi.where()
    )

    with urllib.request.urlopen(request, context=context) as response:
        tables = pd.read_html(response)

    sp500 = tables[0]
    symbols = sp500["Symbol"].tolist()
    symbols = [symbol.replace(".", "-") for symbol in symbols]

    return symbols[:limit]


def get_sgx_symbols(limit=100):
    return SGX_CANDIDATES[:limit]


def get_candidate_symbols(universe="S_AND_P_500", limit=100, market="US", include_sgx=False):
    normalized = str(universe or "S_AND_P_500").upper()
    normalized_market = str(market or "US").upper()

    if normalized_market == "SG":
        return get_sgx_symbols(limit)

    if normalized_market == "BOTH":
        us_limit = max(1, limit - min(limit, len(SGX_CANDIDATES)))
        combined = get_candidate_symbols(normalized, us_limit, market="US")
        combined.extend(get_sgx_symbols(limit - len(combined)))
        return list(dict.fromkeys(combined))[:limit]

    if normalized == "S_AND_P_500":
        symbols = get_sp500_symbols(limit)
        if include_sgx:
            symbols.extend(get_sgx_symbols(max(0, limit - len(symbols))))
        return list(dict.fromkeys(symbols))[:limit]

    pools = {
        "LARGE_CAP": LARGE_CAP_CANDIDATES,
        "MID_CAP": MID_CAP_CANDIDATES,
        "SMALL_CAP": SMALL_CAP_CANDIDATES,
        "HIGH_GROWTH_HIGH_RISK": HIGH_GROWTH_HIGH_RISK_CANDIDATES,
        "CUSTOM": list(dict.fromkeys(
            LARGE_CAP_CANDIDATES
            + MID_CAP_CANDIDATES
            + SMALL_CAP_CANDIDATES
            + HIGH_GROWTH_HIGH_RISK_CANDIDATES
        )),
    }

    symbols = pools.get(normalized, get_sp500_symbols(limit))[:limit]
    if include_sgx:
        symbols.extend(get_sgx_symbols(max(0, limit - len(symbols))))

    return list(dict.fromkeys(symbols))[:limit]
