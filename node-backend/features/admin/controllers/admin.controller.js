function createAdminController({ adminService, getMarketDataMetrics }) {
  return {
    async listUsers(_req, res) {
      res.json({ users: await adminService.listUsers() });
    },

    async verifyUser(req, res) {
      res.json({
        user: await adminService.verifyUser(req.user.id, req.params.id),
      });
    },

    async rejectUser(req, res) {
      res.json({
        user: await adminService.rejectUser(
          req.user.id,
          req.params.id,
          req.body?.reason
        ),
      });
    },

    async suspendUser(req, res) {
      res.json({
        user: await adminService.suspendUser(
          req.user.id,
          req.params.id,
          req.body?.reason
        ),
      });
    },

    async updateRole(req, res) {
      res.json({
        user: await adminService.updateRole(
          req.user.id,
          req.params.id,
          req.body?.role
        ),
      });
    },

    async getPageAccess(req, res) {
      res.json(await adminService.getUserPageAccess(req.params.id));
    },

    async updatePageAccess(req, res) {
      res.json(
        await adminService.updateUserPageAccess(
          req.user.id,
          req.params.id,
          req.body?.pageAccess || []
        )
      );
    },

    async listAuditLogs(_req, res) {
      res.json({ logs: await adminService.listAuditLogs() });
    },

    async getMarketDataMetrics(_req, res) {
      res.json({ metrics: typeof getMarketDataMetrics === "function" ? getMarketDataMetrics() : {} });
    },
  };
}

module.exports = {
  createAdminController,
};
