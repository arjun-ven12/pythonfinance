import { useCallback, useEffect, useState } from "react";
import { getBrokerReconciliation } from "./brokerApi";

export default function useBrokerReconciliation({ autoLoad = true, enabled = true } = {}) {
  const [reconciliation, setReconciliation] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (options = {}) => {
    if (!enabled) return null;
    setLoading(true);
    try {
      const data = await getBrokerReconciliation(options);
      setReconciliation(data);
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
  return { reconciliation, error, loading, refresh };
}
