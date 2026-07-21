const MATRIX_ACTION_TYPES = Object.freeze(["ASSIGN_STRATEGY", "REPLACE_STRATEGY", "CHANGE_STRATEGY_VERSION", "SET_CELL_ALLOCATION", "SET_CELL_TO_SIT_OUT", "ENABLE_CELL", "DISABLE_CELL", "SET_SECTOR_CAP", "SET_STRATEGY_CAP", "REDISTRIBUTE_IDLE_CAPITAL", "NORMALIZE_ALLOCATIONS"]);
const MATRIX_PROPOSAL_TYPES = Object.freeze(["CELL_CHANGE", "ALLOCATION", "COVERAGE", "DIVERSIFICATION", "DEFENSIVE", "CAPITAL_EFFICIENCY", "SIMPLIFICATION"]);
function proposalError(message, actionIndex = null) { const error = new Error(message); error.statusCode = 400; error.code = "MATRIX_SCENARIO_VALIDATION_ERROR"; error.details = actionIndex === null ? null : { actionIndex }; return error; }
function validateMatrixProposalShape(proposal = {}) {
  if (!MATRIX_PROPOSAL_TYPES.includes(proposal.proposalType)) throw proposalError("Unsupported matrix proposal type.");
  if (!String(proposal.title || "").trim() || !String(proposal.objective || "").trim()) throw proposalError("Matrix proposal title and objective are required.");
  if (!String(proposal.deploymentSetId || "").trim()) throw proposalError("Matrix proposal deploymentSetId is required.");
  if (!Array.isArray(proposal.actions) || !proposal.actions.length || proposal.actions.length > 30) throw proposalError("Matrix proposal must contain between 1 and 30 actions.");
  proposal.actions.forEach((action, index) => { if (!MATRIX_ACTION_TYPES.includes(action.actionType)) throw proposalError(`Unsupported matrix action type: ${action.actionType || "missing"}.`, index); for (const field of ["currentAllocation", "proposedAllocation"]) { const value = Number(action[field]); if (!Number.isFinite(value) || value < 0 || value > 100) throw proposalError(`${field} must be between 0 and 100.`, index); } if (!String(action.reason || "").trim()) throw proposalError("Every matrix action requires a reason.", index); });
  const confidence = Number(proposal.confidence); if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw proposalError("Matrix proposal confidence must be between 0 and 100.");
  return proposal;
}
module.exports = { MATRIX_ACTION_TYPES, MATRIX_PROPOSAL_TYPES, proposalError, validateMatrixProposalShape };
