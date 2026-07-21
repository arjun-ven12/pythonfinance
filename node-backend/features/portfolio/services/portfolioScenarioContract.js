const PORTFOLIO_PROPOSAL_TYPES = Object.freeze([
  "RISK_REDUCTION", "DIVERSIFICATION", "CASH_MANAGEMENT", "POSITION_REALLOCATION",
  "SECTOR_REALLOCATION", "STRATEGY_REALLOCATION", "MATRIX_REALLOCATION", "CUSTOM",
]);

const PORTFOLIO_ACTION_TYPES = Object.freeze([
  "REDUCE_POSITION", "INCREASE_POSITION", "REMOVE_POSITION", "ADD_POSITION",
  "SET_CASH_TARGET", "SET_SYMBOL_WEIGHT", "SET_SECTOR_CAP", "SET_STRATEGY_WEIGHT",
  "SET_INDUSTRY_CAP", "ADD_STRATEGY_WEIGHT", "REMOVE_STRATEGY_WEIGHT",
  "SET_MATRIX_WEIGHT", "REMOVE_MATRIX_WEIGHT", "ENABLE_MATRIX_CELL", "DISABLE_MATRIX_CELL",
  "EQUAL_WEIGHT", "CUSTOM_TARGET_WEIGHTS",
]);

const PORTFOLIO_ACTION_UNITS = Object.freeze(["PERCENT", "USD"]);

function proposalError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "INVALID_PORTFOLIO_PROPOSAL";
  return error;
}

function validatePortfolioProposal(proposal = {}, context = {}, { allowUnresolvedAdds = false } = {}) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) throw proposalError("A structured portfolio proposal is required.");
  if (!PORTFOLIO_PROPOSAL_TYPES.includes(proposal.proposalType)) throw proposalError("Unsupported portfolio proposal type.");
  if (!String(proposal.title || "").trim() || !String(proposal.objective || "").trim()) throw proposalError("Proposal title and objective are required.");
  if (!Array.isArray(proposal.actions) || !proposal.actions.length || proposal.actions.length > 20) throw proposalError("Proposal actions must contain between 1 and 20 actions.");

  const positions = new Map((context.positions || []).map((position) => [position.symbol, position]));
  const strategies = new Set([
    ...(context.tradingState?.strategyAllocations || []).map((item) => item.strategyId),
    ...(context.tradingState?.availableStrategies || []).map((item) => item.id),
  ]);
  const matrixIds = new Set((context.tradingState?.matrixAllocations || []).map((item) => item.id));

  proposal.actions.forEach((action, index) => {
    if (!PORTFOLIO_ACTION_TYPES.includes(action.actionType)) throw proposalError(`Unsupported action type at actions[${index}].`);
    if (!PORTFOLIO_ACTION_UNITS.includes(action.unit)) throw proposalError(`Unsupported action unit at actions[${index}].`);
    const value = Number(action.proposedValue);
    if (!Number.isFinite(value) || value < 0) throw proposalError(`Invalid proposed value at actions[${index}].`);
    if (action.unit === "PERCENT" && value > 100) throw proposalError(`Percentage at actions[${index}] must be between 0 and 100.`);

    if (["REDUCE_POSITION", "INCREASE_POSITION", "REMOVE_POSITION", "SET_SYMBOL_WEIGHT"].includes(action.actionType)) {
      const symbol = String(action.symbol || "").toUpperCase();
      if (!positions.has(symbol)) throw proposalError(`Position ${symbol || "symbol"} is not in the selected provider portfolio.`);
      const currentWeight = Number(positions.get(symbol).portfolioWeightPct) || 0;
      const proposedWeight = action.unit === "PERCENT" ? value : null;
      if (action.actionType === "REDUCE_POSITION" && proposedWeight !== null && proposedWeight > currentWeight) throw proposalError("REDUCE_POSITION cannot increase the current position weight.");
      if (action.actionType === "INCREASE_POSITION" && proposedWeight !== null && proposedWeight < currentWeight) throw proposalError("INCREASE_POSITION cannot reduce the current position weight.");
    }
    if (action.actionType === "ADD_POSITION" && !positions.has(String(action.symbol || "").toUpperCase()) && !allowUnresolvedAdds) {
      throw proposalError("ADD_POSITION requires a platform-resolved current price; no candidate market data was supplied.");
    }
    if (action.actionType === "ADD_POSITION" && !String(action.symbol || "").trim()) throw proposalError("ADD_POSITION requires a symbol.");
    if (action.actionType === "SET_SECTOR_CAP" && !String(action.sector || "").trim()) throw proposalError("SET_SECTOR_CAP requires a sector.");
    if (action.actionType === "SET_INDUSTRY_CAP" && !String(action.industry || "").trim()) throw proposalError("SET_INDUSTRY_CAP requires an industry.");
    if (["SET_STRATEGY_WEIGHT", "ADD_STRATEGY_WEIGHT", "REMOVE_STRATEGY_WEIGHT"].includes(action.actionType) && !strategies.has(String(action.strategyId || ""))) throw proposalError("Strategy allocation does not belong to the selected user context.");
    if (["SET_MATRIX_WEIGHT", "REMOVE_MATRIX_WEIGHT", "ENABLE_MATRIX_CELL", "DISABLE_MATRIX_CELL"].includes(action.actionType) && !matrixIds.has(String(action.matrixCell?.id || ""))) throw proposalError("Matrix allocation does not belong to the selected user context.");
    if (action.actionType === "CUSTOM_TARGET_WEIGHTS") {
      if (!Array.isArray(action.targetWeights) || !action.targetWeights.length) throw proposalError("CUSTOM_TARGET_WEIGHTS requires targetWeights.");
      const total = action.targetWeights.reduce((sum, target) => sum + Number(target.weightPct || 0), 0);
      if (action.targetWeights.some((target) => !positions.has(String(target.symbol || "").toUpperCase()))) throw proposalError("Custom target weights may reference only current positions.");
      if (total > 100.0001) throw proposalError("Custom target weights cannot exceed 100%.");
    }
  });

  return proposal;
}

module.exports = {
  PORTFOLIO_ACTION_TYPES,
  PORTFOLIO_ACTION_UNITS,
  PORTFOLIO_PROPOSAL_TYPES,
  validatePortfolioProposal,
};
