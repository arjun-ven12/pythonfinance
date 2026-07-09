function normalizeArtifactPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Scanner artifacts must be a JSON object.");
  }

  const scanResults = payload.scanResults || payload.scan_results;
  const proposedOrders = payload.proposedOrders || payload.proposed_orders || { orders: [] };
  const alerts = payload.alerts || [];

  if (!scanResults || typeof scanResults !== "object" || Array.isArray(scanResults)) {
    throw new Error("Scanner artifacts missing scanResults.");
  }

  if (!scanResults.generated_at || !Array.isArray(scanResults.opportunities)) {
    throw new Error("Scanner artifacts contain an invalid scanResults payload.");
  }

  if (!Array.isArray(alerts)) {
    throw new Error("Scanner artifacts alerts must be an array.");
  }

  if (!proposedOrders || typeof proposedOrders !== "object" || Array.isArray(proposedOrders)) {
    throw new Error("Scanner artifacts proposedOrders must be an object.");
  }

  if (!Array.isArray(proposedOrders.orders)) {
    throw new Error("Scanner artifacts proposedOrders.orders must be an array.");
  }

  return {
    ...payload,
    scanResults,
    scan_results: scanResults,
    alerts,
    proposedOrders,
    proposed_orders: proposedOrders,
    metadata: payload.metadata || {},
    diagnostics: payload.diagnostics || {},
  };
}

module.exports = {
  normalizeArtifactPayload,
};
