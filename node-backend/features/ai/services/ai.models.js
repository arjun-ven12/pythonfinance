function toInteger(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback = null) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildModelConfig(overrides = {}) {
  return {
    model: overrides.model || process.env.OPENAI_MODEL || "gpt-5.4",
    temperature:
      overrides.temperature ?? toNumber(process.env.OPENAI_TEMPERATURE, 0.2) ?? 0.2,
    maxOutputTokens:
      overrides.maxOutputTokens ??
      toInteger(process.env.OPENAI_MAX_TOKENS, null),
    timeoutMs:
      overrides.timeoutMs ?? toInteger(process.env.OPENAI_TIMEOUT_MS, 30000) ?? 30000,
  };
}

module.exports = {
  buildModelConfig,
};
