import { useCallback, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";

export default function useValidation() {
  const [validationConfidenceData, setValidationConfidenceData] = useState(null);
  const [validationRegimeData, setValidationRegimeData] = useState(null);
  const [validationSectorData, setValidationSectorData] = useState(null);
  const [validationOpenAiData, setValidationOpenAiData] = useState(null);
  const [validationError, setValidationError] = useState("");
  const [isEvaluatingValidation, setIsEvaluatingValidation] = useState(false);

  const fetchValidationData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/validation`);
      if (!response.ok) throw new Error("Unable to load validation dashboard");
      const dashboard = await response.json();
      setValidationConfidenceData(dashboard);
      setValidationRegimeData({
        generated_at: dashboard.generated_at,
        regime: dashboard.regime || [],
      });
      setValidationSectorData({
        generated_at: dashboard.generated_at,
        sector: dashboard.sector || [],
      });
      setValidationOpenAiData({
        generated_at: dashboard.generated_at,
        openai_impact: dashboard.openai_impact || [],
        news_impact: dashboard.news_impact || [],
      });
      setValidationError("");
    } catch (err) {
      setValidationError(err.message);
    }
  }, []);

  const handleEvaluateValidationSignals = useCallback(async () => {
    setIsEvaluatingValidation(true);
    setValidationError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/validation/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to evaluate validation signals");
      await fetchValidationData();
    } catch (err) {
      setValidationError(err.message);
    } finally {
      setIsEvaluatingValidation(false);
    }
  }, [fetchValidationData]);

  return {
    fetchValidationData,
    handleEvaluateValidationSignals,
    isEvaluatingValidation,
    validationConfidenceData,
    validationError,
    validationOpenAiData,
    validationRegimeData,
    validationSectorData,
  };
}
