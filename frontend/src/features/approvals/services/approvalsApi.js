import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";

async function readJson(response) {
  return response.json().catch(() => null);
}

function createApiError(payload, fallbackMessage) {
  const error = new Error(payload?.error || fallbackMessage);
  if (payload && typeof payload === "object") {
    Object.assign(error, payload);
  }
  return error;
}

export async function getApprovalRequests() {
  const response = await fetch(`${API_BASE_URL}/api/approval-requests`);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load approval requests");
  }

  return payload;
}

export async function runApprovalAction(id, action, decisionNote = "", extraBody = {}) {
  const response = await fetch(`${API_BASE_URL}/api/approval-requests/${id}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ decisionNote, ...extraBody }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw createApiError(payload, `Unable to ${action.replace("-", " ")}`);
  }

  return payload;
}

export async function previewBrokerPaperExecution(
  id,
  { manualOverride = false, decisionNote = "" } = {}
) {
  const response = await fetch(`${API_BASE_URL}/api/approval-requests/${id}/execute-broker-paper`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirmSubmit: false, manualOverride, decisionNote }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw createApiError(payload, "Unable to preview broker paper order");
  }

  return payload;
}

export async function executeBrokerPaperApproval(
  id,
  { decisionNote = "", manualOverride = false } = {}
) {
  const response = await fetch(`${API_BASE_URL}/api/approval-requests/${id}/execute-broker-paper`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirmSubmit: true, decisionNote, manualOverride }),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw createApiError(payload, "Unable to submit broker paper order");
  }

  return payload;
}

export async function updateApprovalRequest(id, values) {
  const response = await fetch(`${API_BASE_URL}/api/approval-requests/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(values),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw createApiError(payload, "Unable to update suggested trade");
  }

  return payload;
}

export async function getProposedOrders() {
  const response = await fetch(`${API_BASE_URL}/api/proposed-orders`);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(payload?.error || "Unable to load proposed orders");
  }

  return payload;
}

export async function runPreTradeAnalysis(payload) {
  const response = await fetch(`${API_BASE_URL}/api/pre-trade-analysis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await readJson(response);

  if (!response.ok) {
    throw createApiError(result, "Unable to analyze trade");
  }

  return result;
}
