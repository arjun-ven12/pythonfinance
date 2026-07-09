import { useCallback, useEffect, useState } from "react";
import { getBrokerCapabilities } from "./brokerApi";

export default function useBrokerCapabilities({ autoLoad = true, enabled = true } = {}) {
  const [capabilities, setCapabilities] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    setLoading(true);
    try {
      const data = await getBrokerCapabilities();
      setCapabilities(data);
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
  return { capabilities, error, loading, refresh };
}
