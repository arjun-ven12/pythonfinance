import { useCallback, useEffect, useState } from "react";
import { getBrokerHealth } from "./brokerApi";
import { subscribeBrokerRefreshChannel } from "./brokerRefreshCoordinator";

export default function useBrokerHealth({ autoLoad = true, autoRefresh = true, enabled = true } = {}) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (options = {}) => {
    if (!enabled) return null;
    setLoading(true);
    try {
      const data = await getBrokerHealth(options);
      setHealth(data);
      setError("");
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !autoLoad) return undefined;
    return subscribeBrokerRefreshChannel(
      "broker-health",
      () => {
        refresh();
      },
      {
        enabled,
        immediate: true,
        intervalMs: autoRefresh ? 30000 : 0,
        refreshOnSessionChange: true,
      }
    );
  }, [autoLoad, autoRefresh, enabled, refresh]);

  return { health, error, loading, refresh };
}
