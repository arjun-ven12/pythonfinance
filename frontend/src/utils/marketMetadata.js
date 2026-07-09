const EXCHANGE_ALIASES = {
  NMS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NAS: "NASDAQ",
  NASDAQ: "NASDAQ",
  NYQ: "NYSE",
  NYS: "NYSE",
  NYSE: "NYSE",
  ASE: "AMEX",
  AMEX: "AMEX",
  PCX: "NYSEARCA",
  BTS: "BATS",
  SGX: "SGX",
  SES: "SGX",
};

export function normalizeExchange(exchange, item = {}) {
  const rawExchange = String(exchange || "").trim().toUpperCase();
  const symbol = String(item.yahoo_symbol || item.yahooSymbol || item.symbol || "").toUpperCase();
  const market = String(item.market || "").toUpperCase();

  if (
    rawExchange === "SGX" ||
    symbol.endsWith(".SI") ||
    item.is_sgx ||
    item.isSgx ||
    market === "SG" ||
    market === "SINGAPORE"
  ) {
    return "SGX";
  }

  if (!rawExchange || ["UNKNOWN", "NONE", "N/A"].includes(rawExchange)) {
    return "UNKNOWN";
  }

  return EXCHANGE_ALIASES[rawExchange] || rawExchange;
}

export function formatExchange(exchange, item = {}) {
  const normalized = normalizeExchange(exchange, item);

  if (normalized !== "UNKNOWN") {
    return normalized;
  }

  return item.is_sgx || String(item.market || "").toUpperCase() === "SINGAPORE"
    ? "SGX"
    : "US";
}
