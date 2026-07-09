import { useCallback, useEffect, useState } from "react";
import { getBrokerPreflight } from "./brokerApi";

export default function useBrokerPreflight({ autoLoad = true, enabled = true } = {}) {
  const [preflight, setPreflight] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (options = {}) => {
    if (!enabled) return null;
    setLoading(true);
    try {
      const data = await getBrokerPreflight(options);
      setPreflight(data);
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
    const id = window.setTimeout(() => {
      refresh();
    }, 0);
    return () => window.clearTimeout(id);
  }, [autoLoad, enabled, refresh]);
  return { preflight, error, loading, refresh };
}
