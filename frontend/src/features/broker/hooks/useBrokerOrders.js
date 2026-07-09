import { useCallback, useEffect, useState } from "react";
import { getBrokerOrders } from "./brokerApi";

export default function useBrokerOrders({ autoLoad = true, enabled = true } = {}) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (options = {}) => {
    if (!enabled) return [];
    setLoading(true);
    try {
      const data = await getBrokerOrders(options);
      const nextOrders = data?.orders || [];
      setOrders(nextOrders);
      setError("");
      return nextOrders;
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

  return { error, loading, orders, refresh };
}
