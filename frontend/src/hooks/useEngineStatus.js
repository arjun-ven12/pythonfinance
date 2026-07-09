import { useCallback, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../services/apiClient";

export default function useEngineStatus({
  buildExecutionSettingsPayload,
  buildMarketUniverseSettingsPayload,
  engineInterval,
  marketHoursOnly,
  onIntervalFromStatus,
  riskMultiplier,
  scanLimit,
  tradingHorizon,
} = {}) {
  const [engineStatus, setEngineStatus] = useState(null);
  const [isEngineChanging, setIsEngineChanging] = useState(false);
  const [engineError, setEngineError] = useState("");

  const fetchEngineStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/engine-status`);
      if (!response.ok) throw new Error("Unable to load engine status");
      const nextStatus = await response.json();
      setEngineStatus(nextStatus);
      if (nextStatus.is_running) onIntervalFromStatus?.(nextStatus.interval || "15min");
      setEngineError("");
    } catch (err) {
      setEngineError(err.message);
    }
  }, [onIntervalFromStatus]);

  const handleStartEngine = useCallback(async () => {
    setIsEngineChanging(true);
    setEngineError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/start-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interval: engineInterval,
          limit: Number(scanLimit),
          riskMultiplier: Number(riskMultiplier),
          tradingHorizon,
          executionSettings: buildExecutionSettingsPayload?.(),
          marketUniverseSettings: buildMarketUniverseSettingsPayload?.(),
          marketHoursOnly,
        }),
      });
      const nextStatus = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextStatus?.error || "Unable to start engine");
      setEngineStatus(nextStatus);
    } catch (err) {
      setEngineError(err.message);
    } finally {
      setIsEngineChanging(false);
    }
  }, [
    buildExecutionSettingsPayload,
    buildMarketUniverseSettingsPayload,
    engineInterval,
    marketHoursOnly,
    riskMultiplier,
    scanLimit,
    tradingHorizon,
  ]);

  const handleStopEngine = useCallback(async () => {
    setIsEngineChanging(true);
    setEngineError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/stop-engine`, { method: "POST" });
      const nextStatus = await response.json().catch(() => null);
      if (!response.ok) throw new Error(nextStatus?.error || "Unable to stop engine");
      setEngineStatus(nextStatus);
    } catch (err) {
      setEngineError(err.message);
    } finally {
      setIsEngineChanging(false);
    }
  }, []);

  return {
    engineError,
    engineStatus,
    fetchEngineStatus,
    handleStartEngine,
    handleStopEngine,
    isEngineChanging,
  };
}
