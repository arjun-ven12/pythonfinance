function createInputError(message, details = null) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "AI_INPUT_VALIDATION_ERROR";
  error.details = details;
  return error;
}

function assertString(value, field, { maxLength = 2000, required = true } = {}) {
  if (value == null || value === "") {
    if (required) throw createInputError(`${field} is required.`);
    return;
  }
  if (typeof value !== "string") {
    throw createInputError(`${field} must be a string.`);
  }
  if (value.length > maxLength) {
    throw createInputError(`${field} exceeds ${maxLength} characters.`);
  }
}

function assertSymbol(value, field = "symbol") {
  assertString(value, field, { maxLength: 12 });
  if (!/^[A-Z0-9.\-]{1,12}$/i.test(value)) {
    throw createInputError(`${field} must be a valid market symbol.`);
  }
}

function assertArray(value, field, { maxItems = 20 } = {}) {
  if (value == null) return;
  if (!Array.isArray(value)) {
    throw createInputError(`${field} must be an array.`);
  }
  if (value.length > maxItems) {
    throw createInputError(`${field} cannot contain more than ${maxItems} items.`);
  }
}

function assertBoolean(value, field) {
  if (value == null) return;
  if (typeof value !== "boolean") {
    throw createInputError(`${field} must be a boolean.`);
  }
}

function assertObject(value, field) {
  if (value == null) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createInputError(`${field} must be an object.`);
  }
}

function assertContextSize(payload, maxBytes = 64_000) {
  const bytes = Buffer.byteLength(JSON.stringify(payload || {}), "utf8");
  if (bytes > maxBytes) {
    throw createInputError("AI context is too large.", { maxBytes, bytes });
  }
}

function validateStockPayload(payload = {}) {
  assertSymbol(payload.symbol);
  assertContextSize(payload);
}

function validatePortfolioPayload(payload = {}) {
  assertArray(payload.positions, "positions", { maxItems: 100 });
  assertContextSize(payload);
}

function validateScannerPayload(payload = {}) {
  if (payload.symbol) assertSymbol(payload.symbol);
  assertContextSize(payload);
}

function validateTradePayload(payload = {}) {
  if (payload.symbol) assertSymbol(payload.symbol);
  assertContextSize(payload);
}

function validateNewsPayload(payload = {}) {
  if (payload.symbol) assertSymbol(payload.symbol);
  assertArray(payload.headlines || payload.news || payload.newsEvents, "news", { maxItems: 25 });
  assertContextSize(payload);
}

function validateChatPayload(payload = {}) {
  assertArray(payload.messages, "messages", { maxItems: 20 });
  for (const [index, message] of (payload.messages || []).entries()) {
    assertString(message?.content, `messages[${index}].content`, { maxLength: 4000 });
  }
  assertContextSize(payload);
}

function validatePlaybookPayload(payload = {}) {
  assertArray(payload.validatedInsights, "validatedInsights", { maxItems: 50 });
  assertContextSize(payload, 96_000);
}

function validateNewsReasoningPayload(payload = {}) {
  assertSymbol(payload.symbol);
  assertString(payload.current_technical_signal || payload.technical_signal, "technical_signal", {
    maxLength: 20,
  });
  assertArray(payload.news_events || payload.newsEvents, "news_events", { maxItems: 12 });
  assertContextSize(payload, 48_000);
}

function validateStrategyDraftPayload(payload = {}) {
  assertString(payload.prompt, "prompt", { maxLength: 4000 });
  assertBoolean(payload.advancedMode, "advancedMode");
  assertObject(payload.preferences, "preferences");
  assertString(payload.preferences?.tradingStyle, "preferences.tradingStyle", {
    maxLength: 80,
    required: false,
  });
  assertString(payload.preferences?.market, "preferences.market", {
    maxLength: 80,
    required: false,
  });
  assertString(payload.preferences?.riskLevel, "preferences.riskLevel", {
    maxLength: 80,
    required: false,
  });
  assertString(payload.preferences?.holdingPeriod, "preferences.holdingPeriod", {
    maxLength: 80,
    required: false,
  });
  assertArray(payload.preferences?.objectives, "preferences.objectives", { maxItems: 8 });
  assertArray(payload.preferences?.sectors, "preferences.sectors", { maxItems: 8 });
  for (const [index, objective] of (payload.preferences?.objectives || []).entries()) {
    assertString(objective, `preferences.objectives[${index}]`, {
      maxLength: 120,
      required: true,
    });
  }
  for (const [index, sector] of (payload.preferences?.sectors || []).entries()) {
    assertString(sector, `preferences.sectors[${index}]`, {
      maxLength: 120,
      required: true,
    });
  }
  assertObject(payload.preferences?.constraints, "preferences.constraints");
  if (payload.preferences?.constraints?.maxDrawdownTarget !== undefined) {
    const value = Number(payload.preferences.constraints.maxDrawdownTarget);
    if (!Number.isFinite(value) || value < 1 || value > 95) {
      throw createInputError("preferences.constraints.maxDrawdownTarget must be between 1 and 95.");
    }
  }
  if (payload.preferences?.constraints?.minimumLiquidity !== undefined) {
    const value = Number(payload.preferences.constraints.minimumLiquidity);
    if (!Number.isFinite(value) || value < 0 || value > 1000000000) {
      throw createInputError("preferences.constraints.minimumLiquidity must be between 0 and 1000000000.");
    }
  }
  assertBoolean(
    payload.preferences?.constraints?.avoidEarningsPeriods,
    "preferences.constraints.avoidEarningsPeriods"
  );
  assertContextSize(payload, 24_000);
}

function validateStrategyCopilotPayload(payload = {}) {
  if (payload.prompt !== undefined) {
    assertString(payload.prompt, "prompt", { maxLength: 4000 });
  }
  if (payload.question !== undefined) {
    assertString(payload.question, "question", { maxLength: 4000 });
  }
  assertContextSize(payload, 96_000);
}

function validatePortfolioCopilotPayload(payload = {}) {
  assertObject(payload, "portfolio copilot payload");
  if (!['OVERVIEW', 'QUESTION'].includes(payload.workflow)) {
    throw createInputError("workflow must be OVERVIEW or QUESTION.");
  }
  assertString(payload.question, "question", { maxLength: 2000 });
  if (!payload.provider || !payload.account || !Array.isArray(payload.positions)) {
    throw createInputError("Resolved provider, account, and positions context are required.");
  }
  if (!Array.isArray(payload.availableEvidence)) {
    throw createInputError("availableEvidence must be an array.");
  }
  assertContextSize(payload, 96_000);
}

function validatePortfolioAdvisorPayload(payload = {}) {
  assertObject(payload, "portfolio advisor payload");
  if (!["RECOMMEND", "PROPOSE_SCENARIO", "INTERPRET_SCENARIO", "COMPARE_PROPOSALS"].includes(payload.workflow)) {
    throw createInputError("Unsupported portfolio advisor workflow.");
  }
  if (payload.question !== undefined) assertString(payload.question, "question", { maxLength: 2000 });
  if (!payload.provider || !payload.account) throw createInputError("Resolved provider and account context are required.");
  assertContextSize(payload, 128_000);
}

function validateResearchCopilotPayload(payload = {}) {
  assertObject(payload, "research copilot payload");
  if (!["MARKET_OVERVIEW", "QUESTION", "SYMBOL_RESEARCH", "SECTOR_RESEARCH", "SCANNER_EXPLANATION", "WATCHLIST_SUMMARY", "UPCOMING_EVENTS", "DEEP_RESEARCH", "MARKET_IMPACT", "PORTFOLIO_IMPACT", "STRATEGY_IMPACT", "MATRIX_IMPACT", "SCANNER_IMPACT", "COMPARISON_RESEARCH", "THEME_RESEARCH", "COMPANY_RESEARCH", "PROJECT_REPORT", "PROJECT_QUESTION", "THESIS_REVIEW", "CHANGE_ANALYSIS", "PROJECT_COMPARISON"].includes(payload.workflow)) {
    throw createInputError("Unsupported research workflow.");
  }
  if (payload.question !== undefined) assertString(payload.question, "question", { maxLength: 2000 });
  if (!Array.isArray(payload.availableEvidence)) throw createInputError("availableEvidence must be an array.");
  assertContextSize(payload, 128_000);
}

function validateMatrixCopilotPayload(payload = {}) {
  assertObject(payload, "matrix copilot payload");
  if (!["MATRIX_AUDIT", "MATRIX_EXPLANATION", "MATRIX_REPLAY_ANALYSIS", "MATRIX_DEPLOYMENT_ANALYSIS", "MATRIX_ALLOCATION_ANALYSIS", "MATRIX_COVERAGE_ANALYSIS", "MATRIX_RISK_ANALYSIS", "MATRIX_QUESTION"].includes(payload.workflow)) throw createInputError("Unsupported Matrix Copilot workflow.");
  if (payload.question !== undefined) assertString(payload.question, "question", { maxLength: 2000, required: false });
  if (!payload.dashboard || !payload.audit || !Array.isArray(payload.availableEvidence)) throw createInputError("Resolved matrix dashboard, audit, and evidence are required.");
  assertContextSize(payload, 128_000);
}

function validateMatrixAdvisorPayload(payload = {}) {
  assertObject(payload, "matrix advisor payload");
  if (!["MATRIX_RECOMMENDATION", "MATRIX_SCENARIO_PROPOSAL", "MATRIX_SCENARIO_INTERPRETATION", "MATRIX_ALTERNATIVE_COMPARISON"].includes(payload.workflow)) throw createInputError("Unsupported Matrix Advisor workflow.");
  if (payload.question !== undefined) assertString(payload.question, "question", { maxLength: 2000, required: false });
  if (!payload.dashboard || !payload.audit || !Array.isArray(payload.availableEvidence)) throw createInputError("Resolved matrix dashboard, audit, and evidence are required.");
  assertContextSize(payload, 160_000);
}

module.exports = {
  createInputError,
  validateChatPayload,
  validateNewsPayload,
  validateNewsReasoningPayload,
  validatePlaybookPayload,
  validatePortfolioPayload,
  validatePortfolioCopilotPayload,
  validatePortfolioAdvisorPayload,
  validateResearchCopilotPayload,
  validateMatrixCopilotPayload,
  validateMatrixAdvisorPayload,
  validateScannerPayload,
  validateStrategyCopilotPayload,
  validateStockPayload,
  validateStrategyDraftPayload,
  validateTradePayload,
};
