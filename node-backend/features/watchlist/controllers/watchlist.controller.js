function createWatchlistController(deps) {
  const { validateSymbol, watchlistRepository } = deps;

  return {
    async listWatchlist(req, res) {
      try {
        const items = await watchlistRepository.list(req.user.id);
        res.json({
          watchlist: items,
          symbols: items.map((item) => item.symbol),
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async upsertWatchlist(req, res) {
      try {
        const symbol = validateSymbol(req.body?.symbol);
        const item = await watchlistRepository.upsert(
          symbol,
          req.body?.notes || null,
          req.user.id
        );
        res.status(201).json(item);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    async removeWatchlist(req, res) {
      try {
        const symbol = validateSymbol(req.params.symbol);
        const deleted = await watchlistRepository.remove(symbol, req.user.id);

        if (!deleted) {
          res.status(404).json({ error: "Symbol is not in the watchlist." });
          return;
        }

        res.json({ removed: symbol });
      } catch (error) {
        if (error.message.includes("Symbol")) {
          res.status(404).json({ error: "Symbol is not in the watchlist." });
          return;
        }

        res.status(400).json({ error: error.message });
      }
    },
  };
}

module.exports = { createWatchlistController };
