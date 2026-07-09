function createTradesController(deps) {
  const {
    buildTrade,
    recordManualTrade,
    tradeRepository,
    withPrismaSource,
  } = deps;

  return {
    async listTrades(req, res) {
      try {
        const trades = await tradeRepository.list(req.user.id);
        res.json(withPrismaSource({ trades }));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async createTrade(req, res) {
      try {
        const input = buildTrade(req.body);
        const { trade } = await recordManualTrade(req.user.id, {
          symbol: input.symbol,
          side: input.side,
          status: input.status,
          orderType: "MARKET",
          entryPrice: input.entryPrice,
          quantity: input.quantity,
          stopLoss: input.stopLoss,
          takeProfit: input.takeProfit,
          notes: input.notes || null,
        });
        res.status(201).json(withPrismaSource(trade));
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },
  };
}

module.exports = { createTradesController };
