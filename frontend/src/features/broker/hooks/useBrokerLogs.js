import { useCallback, useEffect, useState } from "react";
import { getBrokerLogs } from "./brokerApi";

export default function useBrokerLogs({ autoLoad = true, enabled = true } = {}) {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (options = {}) => {
    if (!enabled) return [];
    setLoading(true);
    try {
      const data = await getBrokerLogs(options);
      setLogs(data.logs || []);
      setError("");
      return data.logs || [];
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !autoLoad) return undefined;
    const id = window.setTimeout(() => {
      refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [autoLoad, enabled, refresh]);
  return { logs, error, loading, refresh };
}
