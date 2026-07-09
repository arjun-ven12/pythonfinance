function createSystemController({ runtimeDiagnosticsService }) {
  return {
    async getRuntime(req, res, next) {
      try {
        res.json(await runtimeDiagnosticsService.getRuntimeDiagnostics(req.user.id));
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = createSystemController;
