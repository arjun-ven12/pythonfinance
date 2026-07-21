import { useCallback, useState } from "react";
import { API_BASE_URL } from "../../../services/apiClient";
import { apiRequest, REQUEST_PRIORITY } from "../../../services/apiRequestManager";

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
      const nextActiveStrategy = await apiRequest(`${API_BASE_URL}/api/active-strategy`, {
        cacheTtl: 5_000,
        priority: REQUEST_PRIORITY.MEDIUM,
        staleTtl: 15_000,
      });
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
