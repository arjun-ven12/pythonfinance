const express = require("express");

function createNotificationsRouter({
  alertDeliveryService,
  alertRepository,
  readAlertsForApi,
}) {
  const router = express.Router();

  router.get("/alerts", async (req, res, next) => {
    try {
      res.json(await readAlertsForApi(req.user.id, req.query || {}));
    } catch (error) {
      next(error);
    }
  });

  router.get("/alerts/health", async (req, res, next) => {
    try {
      res.json(await alertRepository.getHealth(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/notification-channels", async (req, res, next) => {
    try {
      res.json({
        channels: await alertDeliveryService.getNotificationChannels(req.user.id),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/notification-channels/telegram", async (req, res, next) => {
    try {
      res.json(await alertDeliveryService.saveTelegramConfig(req.user.id, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  router.post("/notification-channels/telegram/verify", async (req, res, next) => {
    try {
      res.json(await alertDeliveryService.verifyTelegramConnection(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/notification-channels/telegram/test", async (req, res, next) => {
    try {
      res.json(await alertDeliveryService.sendTestAlert(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.post("/alert-deliveries/process", async (req, res, next) => {
    try {
      res.json(await alertDeliveryService.processDueDeliveries(req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/alert-rules", async (req, res, next) => {
    try {
      res.json({ rules: await alertRepository.listRules(req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/alert-rules", async (req, res, next) => {
    try {
      res.json(await alertRepository.createRule(req.user.id, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  router.post("/alerts/mute-category", async (req, res, next) => {
    try {
      const mutedCategories = await alertRepository.muteCategory(
        req.user.id,
        req.body?.category
      );
      res.json({ mutedCategories });
    } catch (error) {
      next(error);
    }
  });

  router.post("/alerts/unmute-category", async (req, res, next) => {
    try {
      const mutedCategories = await alertRepository.unmuteCategory(
        req.user.id,
        req.body?.category
      );
      res.json({ mutedCategories });
    } catch (error) {
      next(error);
    }
  });

  router.post("/alerts/:id/acknowledge", async (req, res, next) => {
    try {
      res.json(await alertRepository.action(req.user.id, req.params.id, "ACKNOWLEDGED", {
        reason: req.body?.reason,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/alerts/:id/snooze", async (req, res, next) => {
    try {
      const snoozedUntil = req.body?.snoozedUntil
        ? new Date(req.body.snoozedUntil)
        : new Date(Date.now() + 60 * 60 * 1000);
      res.json(await alertRepository.action(req.user.id, req.params.id, "SNOOZED", {
        reason: req.body?.reason,
        snoozedUntil,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/alerts/:id/resolve", async (req, res, next) => {
    try {
      res.json(await alertRepository.action(req.user.id, req.params.id, "RESOLVED", {
        reason: req.body?.reason,
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/alerts/:id/dismiss", async (req, res, next) => {
    try {
      res.json(await alertRepository.action(req.user.id, req.params.id, "RESOLVED", {
        reason: req.body?.reason || "Dismissed",
      }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createNotificationsRouter;
