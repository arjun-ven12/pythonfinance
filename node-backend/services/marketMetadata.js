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

function normalizeExchange(exchange, opportunity = {}) {
  const rawExchange = String(exchange || "").trim().toUpperCase();
  const symbol = String(
    opportunity.yahoo_symbol ||
      opportunity.yahooSymbol ||
      opportunity.symbol ||
      ""
  ).toUpperCase();
  const market = String(opportunity.market || "").toUpperCase();

  if (
    rawExchange === "SGX" ||
    symbol.endsWith(".SI") ||
    opportunity.is_sgx ||
    opportunity.isSgx ||
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

module.exports = {
  normalizeExchange,
};
