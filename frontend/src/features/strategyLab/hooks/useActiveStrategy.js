import { useCallback, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";

export default function useActiveStrategy({
  activeStrategyStorageKey,
  getUserStorageKey,
}) {
  const [activeStrategyExperimentId, setActiveStrategyExperimentId] = useState(
    () => localStorage.getItem(getUserStorageKey(activeStrategyStorageKey)) || ""
  );
  const [activeStrategyConfig, setActiveStrategyConfig] = useState(null);
  const [activeStrategyError, setActiveStrategyError] = useState("");

  const fetchActiveStrategy = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/active-strategy`);
      if (!response.ok) throw new Error("Unable to load active strategy");
      const nextActiveStrategy = await response.json();
      setActiveStrategyConfig(nextActiveStrategy);
      setActiveStrategyError("");
      if (nextActiveStrategy.experimentId) {
        localStorage.setItem(
          getUserStorageKey(activeStrategyStorageKey),
          nextActiveStrategy.experimentId
        );
        setActiveStrategyExperimentId(nextActiveStrategy.experimentId);
      }
      return nextActiveStrategy;
    } catch (err) {
      setActiveStrategyError(err.message);
      return null;
    }
  }, [activeStrategyStorageKey, getUserStorageKey]);

  const applyActiveStrategy = useCallback(
    (nextActiveStrategy) => {
      setActiveStrategyConfig(nextActiveStrategy);
      const experimentId = nextActiveStrategy?.experimentId || "";
      setActiveStrategyExperimentId(experimentId);
      if (experimentId) {
        localStorage.setItem(
          getUserStorageKey(activeStrategyStorageKey),
          experimentId
        );
      } else {
        localStorage.removeItem(getUserStorageKey(activeStrategyStorageKey));
      }
    },
    [activeStrategyStorageKey, getUserStorageKey]
  );

  return {
    activeStrategyConfig,
    activeStrategyError,
    activeStrategyExperimentId,
    applyActiveStrategy,
    fetchActiveStrategy,
    setActiveStrategyConfig,
  };
}
