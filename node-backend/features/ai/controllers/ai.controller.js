function createAiController(aiService, observabilityService = null) {
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

  function requireObservability() {
    if (!observabilityService) {
      const error = new Error("AI observability service is unavailable.");
      error.statusCode = 503;
      throw error;
    }
    return observabilityService;
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
    diagnostics: wrap((req) => aiService.getDiagnostics(req.query || {})),
    observabilityDashboard: wrap((req) => requireObservability().dashboard(req.query || {})),
    recentRequests: wrap((req) => requireObservability().listRequests(req.query || {})),
    requestDetail: wrap(async (req) => {
      const detail = await requireObservability().requestDetail(req.params.id);
      if (!detail) {
        const error = new Error("AI invocation not found.");
        error.statusCode = 404;
        throw error;
      }
      return detail;
    }),
    dailyUsage: wrap((req) => requireObservability().usageByPeriod({ ...req.query, period: "day" })),
    monthlyUsage: wrap((req) => requireObservability().usageByPeriod({ ...req.query, period: "month" })),
    featureUsage: wrap((req) => requireObservability().featureUsage(req.query || {})),
    userUsage: wrap((req) => requireObservability().userUsage(req.query || {})),
    costSummary: wrap(() => requireObservability().costSummary()),
    largestRequests: wrap((req) => requireObservability().largestRequests(req.query || {})),
    optimizationReport: wrap((req) => requireObservability().optimizationReport(req.query || {})),
  };
}

module.exports = {
  createAiController,
};
