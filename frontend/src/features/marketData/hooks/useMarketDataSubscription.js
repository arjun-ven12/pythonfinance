import { useEffect, useState } from "react";
import { getMarketDataProvider } from "../services/marketDataService";

export function useLiveQuote(symbol, options = {}) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!symbol) return undefined;
    const provider = getMarketDataProvider();
    const unsubscribe = provider.subscribeQuote(
      symbol,
      (nextPayload) => {
        if (nextPayload?.error) {
          setError(nextPayload.error);
          return;
        }
        setError("");
        setPayload(nextPayload);
      },
      options
    );
    return unsubscribe;
  }, [symbol, options.isDemoMode]);

  return { payload, error };
}

export function useHistoricalBars(symbol, timeframe, options = {}) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!symbol || !timeframe) return undefined;
    const provider = getMarketDataProvider();
    const unsubscribe = provider.subscribeCandles(
      symbol,
      timeframe,
      (nextPayload) => {
        if (nextPayload?.error) {
          setError(nextPayload.error);
          return;
        }
        setError("");
        setPayload(nextPayload);
      },
      options
    );
    return unsubscribe;
  }, [symbol, timeframe, options.isDemoMode]);

  return { payload, error };
}
