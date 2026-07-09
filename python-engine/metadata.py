import json
from datetime import datetime, timedelta
from pathlib import Path

from json_utils import dump_json_strict


PYTHON_ENGINE_DIR = Path(__file__).resolve().parent
METADATA_CACHE_FILE = PYTHON_ENGINE_DIR / "metadata_cache.json"
DEFAULT_METADATA = {
    "display_symbol": None,
    "yahoo_symbol": None,
    "company_name": None,
    "market": "US",
    "exchange": "UNKNOWN",
    "currency": "USD",
    "country": "United States",
    "is_sgx": False,
    "is_us": True,
    "sector": "UNKNOWN",
    "industry": "UNKNOWN",
    "market_cap": None,
    "average_volume": None,
}
EXCHANGE_ALIASES = {
    "NMS": "NASDAQ",
    "NGM": "NASDAQ",
    "NCM": "NASDAQ",
    "NAS": "NASDAQ",
    "NASDAQ": "NASDAQ",
    "NYQ": "NYSE",
    "NYS": "NYSE",
    "NYSE": "NYSE",
    "ASE": "AMEX",
    "AMEX": "AMEX",
    "PCX": "NYSEARCA",
    "BTS": "BATS",
    "SGX": "SGX",
    "SES": "SGX",
}
MAX_CACHE_AGE_DAYS = 30
SGX_METADATA = {
    "D05.SI": ("D05", "DBS Group Holdings", "Financial Services", "Banks"),
    "O39.SI": ("O39", "Oversea-Chinese Banking Corp", "Financial Services", "Banks"),
    "U11.SI": ("U11", "United Overseas Bank", "Financial Services", "Banks"),
    "Z74.SI": ("Z74", "Singapore Telecommunications", "Communication Services", "Telecom"),
    "C38U.SI": ("C38U", "CapitaLand Integrated Commercial Trust", "Real Estate", "REIT"),
    "C09.SI": ("C09", "City Developments", "Real Estate", "Property"),
    "S68.SI": ("S68", "Singapore Exchange", "Financial Services", "Exchange"),
    "A17U.SI": ("A17U", "CapitaLand Ascendas REIT", "Real Estate", "Industrial REIT"),
    "J36.SI": ("J36", "Jardine Matheson Holdings", "Industrials", "Conglomerate"),
    "BN4.SI": ("BN4", "Keppel", "Industrials", "Infrastructure"),
    "C6L.SI": ("C6L", "Singapore Airlines", "Industrials", "Airlines"),
    "G13.SI": ("G13", "Genting Singapore", "Consumer Cyclical", "Gaming"),
    "N2IU.SI": ("N2IU", "Mapletree Pan Asia Commercial Trust", "Real Estate", "REIT"),
    "M44U.SI": ("M44U", "Mapletree Logistics Trust", "Real Estate", "Logistics REIT"),
    "ME8U.SI": ("ME8U", "Mapletree Industrial Trust", "Real Estate", "Industrial REIT"),
    "F9D.SI": ("F9D", "Boustead Singapore", "Industrials", "Engineering"),
    "U96.SI": ("U96", "Sembcorp Industries", "Utilities", "Utilities"),
    "Y92.SI": ("Y92", "Thai Beverage", "Consumer Defensive", "Beverages"),
    "V03.SI": ("V03", "Venture Corporation", "Technology", "Electronics"),
    "S58.SI": ("S58", "SATS", "Industrials", "Airport Services"),
}


def normalize_exchange(exchange, symbol=None, market=None):
    raw_exchange = str(exchange or "").strip().upper()
    normalized_symbol = str(symbol or "").strip().upper()

    if normalized_symbol.endswith(".SI") or str(market or "").upper() in {"SG", "SINGAPORE"}:
        return "SGX"

    if raw_exchange in {"", "UNKNOWN", "NONE", "N/A"}:
        return "UNKNOWN"

    return EXCHANGE_ALIASES.get(raw_exchange, raw_exchange)


def load_metadata_cache(cache_file=METADATA_CACHE_FILE):
    if not Path(cache_file).exists():
        return {}

    try:
        with open(cache_file) as file:
            data = json.load(file)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_metadata_cache(cache, cache_file=METADATA_CACHE_FILE):
    try:
        with open(cache_file, "w") as file:
            dump_json_strict(cache, file, indent=4)
    except Exception as error:
        print(f"Metadata cache save skipped: {error}")


def is_cache_entry_fresh(entry):
    fetched_at = entry.get("fetched_at")

    if not fetched_at:
        return False

    try:
        fetched_time = datetime.fromisoformat(fetched_at)
    except ValueError:
        return False

    return datetime.now() - fetched_time <= timedelta(days=MAX_CACHE_AGE_DAYS)


def normalize_metadata(raw_metadata):
    sector = raw_metadata.get("sector") or DEFAULT_METADATA["sector"]
    industry = raw_metadata.get("industry") or DEFAULT_METADATA["industry"]
    yahoo_symbol = raw_metadata.get("yahoo_symbol") or raw_metadata.get("symbol")
    display_symbol = raw_metadata.get("display_symbol") or yahoo_symbol
    market = raw_metadata.get("market") or DEFAULT_METADATA["market"]
    exchange = normalize_exchange(
        raw_metadata.get("exchange") or raw_metadata.get("fullExchangeName"),
        symbol=yahoo_symbol,
        market=market,
    )
    currency = raw_metadata.get("currency") or DEFAULT_METADATA["currency"]
    country = raw_metadata.get("country") or DEFAULT_METADATA["country"]

    return {
        "display_symbol": display_symbol,
        "yahoo_symbol": yahoo_symbol,
        "company_name": raw_metadata.get("company_name") or raw_metadata.get("shortName") or raw_metadata.get("longName"),
        "market": market,
        "exchange": exchange,
        "currency": currency,
        "country": country,
        "is_sgx": bool(raw_metadata.get("is_sgx") or exchange == "SGX" or str(yahoo_symbol or "").endswith(".SI")),
        "is_us": bool(raw_metadata.get("is_us", market == "US")),
        "sector": str(sector),
        "industry": str(industry),
        "market_cap": raw_metadata.get("market_cap") or raw_metadata.get("marketCap"),
        "average_volume": raw_metadata.get("average_volume") or raw_metadata.get("averageVolume"),
    }


def get_static_market_metadata(symbol):
    normalized_symbol = str(symbol).upper()

    if normalized_symbol in SGX_METADATA or normalized_symbol.endswith(".SI"):
        display_symbol, company_name, sector, industry = SGX_METADATA.get(
            normalized_symbol,
            (normalized_symbol.replace(".SI", ""), None, "UNKNOWN", "UNKNOWN"),
        )

        return {
            **DEFAULT_METADATA,
            "display_symbol": display_symbol,
            "yahoo_symbol": normalized_symbol,
            "company_name": company_name,
            "market": "Singapore",
            "exchange": "SGX",
            "currency": "SGD",
            "country": "Singapore",
            "is_sgx": True,
            "is_us": False,
            "sector": sector,
            "industry": industry,
        }

    return {
        **DEFAULT_METADATA,
        "display_symbol": normalized_symbol,
        "yahoo_symbol": normalized_symbol,
    }


def fetch_symbol_metadata(symbol):
    static_metadata = get_static_market_metadata(symbol)

    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol)
        info = ticker.get_info()

        if not isinstance(info, dict):
            return static_metadata.copy()

        exchange = info.get("exchange") or info.get("fullExchangeName")
        normalized_exchange = normalize_exchange(exchange, symbol=symbol)
        market = "Singapore" if str(symbol).upper().endswith(".SI") else "US"
        currency = "SGD" if str(symbol).upper().endswith(".SI") else info.get("currency", "USD")

        return normalize_metadata({
            **static_metadata,
            **info,
            "display_symbol": static_metadata.get("display_symbol") or symbol,
            "yahoo_symbol": symbol,
            "company_name": info.get("shortName") or info.get("longName") or static_metadata.get("company_name"),
            "market": market,
            "exchange": normalized_exchange or static_metadata.get("exchange"),
            "currency": currency,
            "country": static_metadata.get("country"),
            "is_sgx": static_metadata.get("is_sgx"),
            "is_us": static_metadata.get("is_us"),
        })
    except Exception as error:
        print(f"Metadata unavailable for {symbol}: {error}")
        return static_metadata.copy()


def get_symbol_metadata(symbol, cache=None):
    normalized_symbol = str(symbol).upper()
    active_cache = cache if cache is not None else load_metadata_cache()
    cached_entry = active_cache.get(normalized_symbol)

    if cached_entry and is_cache_entry_fresh(cached_entry):
        return normalize_metadata(cached_entry)

    metadata = fetch_symbol_metadata(normalized_symbol)
    active_cache[normalized_symbol] = {
        **metadata,
        "fetched_at": datetime.now().isoformat(),
    }

    if cache is None:
        save_metadata_cache(active_cache)

    return metadata
