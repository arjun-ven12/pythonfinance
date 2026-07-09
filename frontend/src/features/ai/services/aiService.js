import { apiFetch, readJson, API_BASE_URL } from "../../../services/apiClient";

async function postAi(path, payload) {
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  });

  return readJson(response);
}

export async function analyzeStock(payload) {
  return postAi("/api/ai/analyze-stock", payload);
}

export async function analyzePortfolio(payload) {
  return postAi("/api/ai/analyze-portfolio", payload);
}

export async function explainScannerResult(payload) {
  return postAi("/api/ai/explain-scanner-result", payload);
}

export async function reviewTrade(payload) {
  return postAi("/api/ai/review-trade", payload);
}

export async function summarizeNews(payload) {
  return postAi("/api/ai/summarize-news", payload);
}

export async function chat(payload) {
  return postAi("/api/ai/chat", payload);
}
