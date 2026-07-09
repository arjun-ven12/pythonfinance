import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const readJson = vi.fn();

vi.mock("../../../services/apiClient", () => ({
  API_BASE_URL: "http://localhost:3000",
  apiFetch,
  readJson,
}));

describe("frontend aiService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts stock analysis requests through the shared api client", async () => {
    const response = { ok: true };
    apiFetch.mockResolvedValue(response);
    readJson.mockResolvedValue({ rating: 85 });

    const { analyzeStock } = await import("./aiService");
    const result = await analyzeStock({ symbol: "AMD" });

    expect(apiFetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/ai/analyze-stock",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(readJson).toHaveBeenCalledWith(response);
    expect(result).toEqual({ rating: 85 });
  });
});
