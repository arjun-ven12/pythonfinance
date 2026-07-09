function createPreTradeController({
  runPreTradeAnalysis,
}) {
  return {
    async analyze(req, res) {
      try {
        const result = await runPreTradeAnalysis(req.user.id, req.body || {});
        res.json(result);
      } catch (error) {
        res.status(400).json({
          error: error.message,
          details: error.details,
        });
      }
    },
  };
}

module.exports = createPreTradeController;
