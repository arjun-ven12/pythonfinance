function createAiController(aiService) {
  function wrap(handler) {
    return async (req, res) => {
      try {
        const result = await handler(req, res);
        res.json(result);
      } catch (error) {
        res.status(error.statusCode || error.status || 500).json({
          error: error.message,
          details: error.details || null,
        });
      }
    };
  }

  return {
    analyzeStock: wrap((req) => aiService.analyzeStock(req.user.id, req.body || {})),
    analyzePortfolio: wrap((req) => aiService.analyzePortfolio(req.user.id, req.body || {})),
    explainScannerResult: wrap((req) =>
      aiService.explainScannerResult(req.user.id, req.body || {})
    ),
    reviewTrade: wrap((req) => aiService.reviewTrade(req.user.id, req.body || {})),
    summarizeNews: wrap((req) => aiService.summarizeNews(req.user.id, req.body || {})),
    chat: wrap((req) => aiService.chat(req.user.id, req.body || {})),
  };
}

module.exports = {
  createAiController,
};
