const express = require("express");
const createPlaybookController = require("../controllers/playbook.controller");

function createPlaybookRouter(deps) {
  const router = express.Router();
  const controller = createPlaybookController(deps);

  router.get("/playbook", controller.dashboard);
  router.get("/playbooks", controller.list);
  router.post("/playbooks", controller.create);
  router.get("/playbooks/:id", controller.detail);
  router.post("/playbook/sync", controller.sync);
  router.post("/playbook/snapshots", controller.createSnapshot);
  router.get("/playbook/snapshots/:id/restore", controller.restoreSnapshotPreview);
  router.post("/playbooks/:id/versions", controller.createVersion);
  router.post("/playbooks/:id/versions/compare", controller.compareVersions);
  router.post("/playbooks/:id/versions/:versionId/restore", controller.restoreVersion);
  router.post("/playbooks/:id/versions/:versionId/promote", controller.promoteVersion);
  router.post("/playbooks/:id/evidence/rebuild", controller.rebuildEvidence);
  router.get("/playbook/export", controller.exportLegacy);
  router.get("/playbooks/:id/export", controller.exportById);
  router.post("/playbooks/:id/ai-recommendations", controller.generateAiRecommendation);
  router.post("/playbook-recommendations/:id/accept", controller.acceptRecommendation);
  router.post("/playbook-recommendations/:id/reject", controller.rejectRecommendation);
  router.post(
    "/playbook-recommendations/:id/convert-to-draft",
    controller.convertRecommendationToDraft
  );

  return router;
}

module.exports = createPlaybookRouter;
