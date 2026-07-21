import { useEffect } from "react";
import { subscribePollingChannel } from "../services/pollingCoordinator";

export default function useRuntimeRefresh({
  enabled,
  isScanning,
  onAutoRefresh,
  onEngineRefresh,
  onPortfolioRefresh,
  onSafetyRefresh,
  user,
}) {
  useEffect(() => {
    if (!user || !enabled) return undefined;
    return subscribePollingChannel("cockpit-auto-refresh", () => {
      if (!isScanning) onAutoRefresh?.();
    }, {
      immediate: false,
      intervalMs: 60000,
      poll: () => null,
    });
  }, [enabled, isScanning, onAutoRefresh, user]);

  useEffect(() => {
    if (!user) return undefined;
    return subscribePollingChannel("engine-status", () => onEngineRefresh?.(), {
      immediate: false,
      intervalMs: 30000,
      poll: () => null,
    });
  }, [onEngineRefresh, user]);

  useEffect(() => {
    if (!user) return undefined;
    return subscribePollingChannel("safety-status", () => onSafetyRefresh?.(), {
      immediate: false,
      intervalMs: 30000,
      poll: () => null,
    });
  }, [onSafetyRefresh, user]);

  useEffect(() => {
    if (!user) return undefined;
    return subscribePollingChannel("portfolio-status", () => onPortfolioRefresh?.(), {
      immediate: false,
      intervalMs: 30000,
      poll: () => null,
    });
  }, [onPortfolioRefresh, user]);
}
