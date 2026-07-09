import { useEffect, useMemo, useRef, useState } from "react";
import { getMarketDataProvider } from "../../marketData/services/marketDataService";

function resolveLiveSymbol(entry) {
  return (
    entry?.item?.yahoo_symbol ||
    entry?.item?.yahooSymbol ||
    entry?.item?.display_symbol ||
    entry?.item?.symbol ||
    entry?.symbol
  );
}

export default function useWatchlistQuotes(watchlistItems = []) {
  const [quotesBySymbol, setQuotesBySymbol] = useState({});
  const [flashBySymbol, setFlashBySymbol] = useState({});
  const previousLastBySymbol = useRef({});

  const liveSymbols = useMemo(
    () =>
      watchlistItems
        .map((entry) => resolveLiveSymbol(entry))
        .filter(Boolean),
    [watchlistItems]
  );

  useEffect(() => {
    const provider = getMarketDataProvider();
    provider.primeQuotes(liveSymbols).catch(() => {});
    const unsubscribers = liveSymbols.map((liveSymbol) =>
      provider.subscribeQuote(liveSymbol, (payload) => {
        if (!payload?.quote) return;
        setQuotesBySymbol((current) => ({
          ...current,
          [liveSymbol]: payload,
        }));
        const nextLast = Number(payload.quote.last);
        const previousLast = previousLastBySymbol.current[liveSymbol];
        previousLastBySymbol.current[liveSymbol] = nextLast;
        if (!Number.isFinite(nextLast) || !Number.isFinite(previousLast) || nextLast === previousLast) {
          return;
        }
        setFlashBySymbol((current) => ({
          ...current,
          [liveSymbol]: nextLast > previousLast ? "up" : "down",
        }));
        window.setTimeout(() => {
          setFlashBySymbol((current) => ({
            ...current,
            [liveSymbol]: "",
          }));
        }, 720);
      }, { skipInitialLoad: true })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [liveSymbols]);

  return {
    flashBySymbol,
    getQuoteForEntry(entry) {
      return quotesBySymbol[resolveLiveSymbol(entry)] || null;
    },
  };
}
