import { useCallback, useEffect, useState } from "react";
import { getTradingSession } from "./brokerApi";

export default function useBrokerAccount({ autoLoad = true, enabled = true } = {}) {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (options = {}) => {
    if (!enabled) return null;
    setLoading(true);
    try {
      const data = (await getTradingSession(options)).session?.account || null;
      setAccount(data);
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
  return { account, error, loading, refresh };
}
