function createTradesService() {
  function parseTradeNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function buildTrade(body = {}) {
    const symbol = String(body.symbol || "").trim().toUpperCase();
    const side = String(body.side || "").trim().toUpperCase();
    const status = String(body.status || "OPEN").trim().toUpperCase();
    const entryPrice = parseTradeNumber(body.entryPrice ?? body.entry_price);
    const quantity = parseTradeNumber(body.quantity);
    const stopLoss = parseTradeNumber(body.stopLoss ?? body.stop_loss);
    const takeProfit = parseTradeNumber(body.takeProfit ?? body.take_profit);

    if (!symbol) {
      throw new Error("Symbol is required.");
    }

    if (!["BUY", "SELL"].includes(side)) {
      throw new Error("Side must be BUY or SELL.");
    }

    if (!["OPEN", "CLOSED"].includes(status)) {
      throw new Error("Status must be OPEN or CLOSED.");
    }

    if (entryPrice === null || entryPrice <= 0) {
      throw new Error("Entry price must be greater than 0.");
    }

    if (quantity === null || quantity <= 0) {
      throw new Error("Quantity must be greater than 0.");
    }

    return {
      id: `${Date.now()}-${symbol}`,
      symbol,
      side,
      status,
      entryPrice,
      quantity,
      stopLoss,
      takeProfit,
      notes: String(body.notes || "").trim(),
      createdAt: new Date().toISOString(),
    };
  }

  return {
    buildTrade,
  };
}

module.exports = createTradesService;
