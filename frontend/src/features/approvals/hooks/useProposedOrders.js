import { useCallback, useState } from "react";
import { getProposedOrders } from "../services/approvalsApi";

export default function useProposedOrders() {
  const [data, setData] = useState({ orders: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextData = await getProposedOrders();
      setData(nextData);
      setError("");
      return nextData;
    } catch (err) {
      const fallback = { orders: [], error: err.message };
      setData(fallback);
      setError(err.message);
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    data,
    error,
    loading,
    proposedOrders: data.orders || [],
    refresh,
  };
}
