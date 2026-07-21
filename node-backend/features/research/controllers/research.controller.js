function createResearchController({ researchCopilotService, researchWorkspaceService }) {
  const handler = (workflow) => async (req, res) => {
    try { res.json(await researchCopilotService.run(req.user.id, req.body || {}, workflow)); }
    catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); }
  };
  const workspace = (method) => async (req, res) => { try { res.json(await researchWorkspaceService[method](req.user.id, req.params.id, method === "listReports" ? req.query : req.body || {})); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } };
  return {
    overview: handler("MARKET_OVERVIEW"), ask: handler("QUESTION"), symbol: handler("SYMBOL_RESEARCH"),
    sector: handler("SECTOR_RESEARCH"), scanner: handler("SCANNER_EXPLANATION"),
    watchlist: handler("WATCHLIST_SUMMARY"), upcoming: handler("UPCOMING_EVENTS"),
    deep: handler("DEEP_RESEARCH"), marketImpact: handler("MARKET_IMPACT"), portfolioImpact: handler("PORTFOLIO_IMPACT"),
    strategyImpact: handler("STRATEGY_IMPACT"), matrixImpact: handler("MATRIX_IMPACT"), scannerImpact: handler("SCANNER_IMPACT"),
    compare: handler("COMPARISON_RESEARCH"), theme: handler("THEME_RESEARCH"), company: handler("COMPANY_RESEARCH"),
    listProjects: async (req, res) => { try { res.json(await researchWorkspaceService.listProjects(req.user.id, req.query)); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } },
    createProject: async (req, res) => { try { res.status(201).json(await researchWorkspaceService.createProject(req.user.id, req.body || {})); } catch (error) { res.status(error.statusCode || 500).json({ error: error.message }); } },
    getProject: workspace("getProject"), updateProject: workspace("updateProject"), archiveProject: workspace("archive"), restoreProject: workspace("restore"),
    listReports: workspace("listReports"), generateReport: workspace("generateReport"), projectQuestion: workspace("question"), addNote: workspace("addNote"),
    createThesis: workspace("createThesis"), reviewThesis: workspace("reviewThesis"), projectComparison: workspace("compare"), projectChanges: workspace("changes"),
  };
}
module.exports = { createResearchController };
