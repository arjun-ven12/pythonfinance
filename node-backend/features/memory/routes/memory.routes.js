const express = require("express");
const { createMemoryController } = require("../controllers/memory.controller");

function createMemoryRouter(deps) {
  const router = express.Router(); const controller = createMemoryController(deps);
  router.get("/memory/events", controller.list);
  router.get("/memory/events/important", controller.important);
  router.get("/memory/events/:id", controller.get);
  router.get("/memory/timeline", controller.timeline);
  router.post("/memory/events/:id/feedback", controller.feedback);
  router.post("/memory/events/:id/exclude", controller.exclude);
  router.post("/memory/events/:id/archive", controller.archive);
  router.get("/memory/diagnostics", controller.diagnostics);
  router.get("/memory/embeddings/:memoryEventId/status", controller.embeddingStatus);
  router.get("/memory/embeddings/diagnostics", deps.requireAdmin, controller.embeddingDiagnostics);
  router.post("/memory/embeddings/:memoryEventId/retry", deps.requireAdmin, controller.retryEmbedding);
  router.post("/memory/embeddings/:memoryEventId/rebuild", deps.requireAdmin, controller.rebuildEmbedding);
  router.post("/memory/embeddings/mark-stale", deps.requireAdmin, controller.markEmbeddingStale);
  router.post("/memory/embeddings/backfill", deps.requireAdmin, controller.backfillEmbeddings);
  router.post("/memory/retrieve", controller.retrieve);
  router.get("/memory/retrieval/diagnostics", deps.requireAdmin, controller.retrievalDiagnostics);
  router.get("/memory/retrieval/audits/:id", controller.retrievalAudit);
  router.get("/memory/personalization/profile", controller.personalizationProfile);
  router.get("/memory/personalization/diagnostics", deps.requireAdmin, controller.personalizationDiagnostics);
  router.post("/memory/personalization/rebuild", controller.personalizationRebuild);
  router.post("/memory/personalization/reset", controller.personalizationReset);
  router.get("/memory/personalization/settings", controller.personalizationSettings);
  router.patch("/memory/personalization/settings", controller.updatePersonalizationSettings);
  router.post("/memory/personalization/preferences", controller.createPreference);
  router.post("/memory/personalization/preferences/:id/:action", controller.preferenceAction);
  router.post("/memory/personalization/patterns/:id/:action", controller.patternAction);
  router.get("/memory/export", controller.exportMemory);
  router.delete("/memory/account", controller.deleteAccountMemory);
  router.delete("/memory/personalization", controller.removePersonalizedContext);
  router.delete("/memory/events/:id", controller.deleteMemory);
  return router;
}
module.exports = { createMemoryRouter };
