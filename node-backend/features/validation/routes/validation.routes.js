const express = require("express");
const {
  evaluateValidationSignals,
  getConfidenceValidation,
  getOpenAiImpactValidation,
  getRegimeValidation,
  getSectorValidation,
  getValidationDashboard,
} = require("../../../services/validationService");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    res.json(await getValidationDashboard(req.user.id, {
      evaluate: req.query.evaluate === "true",
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/evaluate", async (req, res, next) => {
  try {
    const limit = Math.min(Number.parseInt(req.body?.limit, 10) || 25, 100);
    res.json(await evaluateValidationSignals(req.user.id, { limit }));
  } catch (error) {
    next(error);
  }
});

router.get("/confidence", async (req, res, next) => {
  try {
    res.json(await getConfidenceValidation(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.get("/regime", async (req, res, next) => {
  try {
    res.json(await getRegimeValidation(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.get("/sector", async (req, res, next) => {
  try {
    res.json(await getSectorValidation(req.user.id));
  } catch (error) {
    next(error);
  }
});

router.get("/openai-impact", async (req, res, next) => {
  try {
    res.json(await getOpenAiImpactValidation(req.user.id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
