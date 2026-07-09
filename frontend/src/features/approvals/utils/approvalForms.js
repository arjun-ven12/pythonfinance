export const EMPTY_PRE_TRADE_FORM = {
  entryPrice: "",
  quantity: "",
  side: "BUY",
  stopLoss: "",
  symbol: "",
  takeProfit: "",
};

export function buildPreTradeFormFromApproval(request = {}) {
  return {
    symbol: String(request.symbol || "").toUpperCase(),
    side: request.side || "BUY",
    quantity: request.quantity ?? "",
    entryPrice: request.entryPrice ?? request.entry_price ?? "",
    stopLoss: request.stopLoss ?? request.stop_loss ?? "",
    takeProfit: request.takeProfit ?? request.take_profit ?? "",
  };
}

export function buildApprovalEditForm(request = {}) {
  return {
    quantity: request.quantity ?? "",
    entryPrice: request.entryPrice ?? "",
    stopLoss: request.stopLoss ?? "",
    takeProfit: request.takeProfit ?? "",
  };
}

export function normalizePreTradePayload(form, tradingHorizon) {
  return {
    symbol: form.symbol.trim().toUpperCase(),
    side: form.side,
    quantity: Number(form.quantity),
    entryPrice: Number(form.entryPrice),
    stopLoss: Number(form.stopLoss),
    takeProfit: Number(form.takeProfit),
    tradingHorizon,
    simulationMode: true,
  };
}
