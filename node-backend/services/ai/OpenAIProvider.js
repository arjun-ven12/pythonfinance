const { createOpenAIClient } = require("../../features/ai/services/ai.client");

module.exports = {
  createOpenAIProvider: createOpenAIClient,
};
