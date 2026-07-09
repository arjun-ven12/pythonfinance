import { useCallback, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";

function getWatchlistStorageKey(userId) {
  return "tradingDashboardWatchlist";
}

function loadLocalWatchlist(userId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getWatchlistStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((symbol) => String(symbol).toUpperCase()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function saveLocalWatchlist(userId, symbols) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    getWatchlistStorageKey(userId),
    JSON.stringify([...new Set(symbols.map((symbol) => String(symbol).toUpperCase()).filter(Boolean))])
  );
}

export default function useWatchlist({ userId } = {}) {
  const [watchlist, setWatchlist] = useState(new Set());
  const [watchlistError, setWatchlistError] = useState("");
  const [watchlistSource, setWatchlistSource] = useState("database");

  const fetchWatchlist = useCallback(async ({ migrateLocal = false } = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/watchlist`);
      if (!response.ok) throw new Error("Unable to load watchlist");

      const nextWatchlist = await response.json();
      const symbols = nextWatchlist.symbols || [];

      if (migrateLocal) {
        const localSymbols = loadLocalWatchlist(userId);
        const missingSymbols = localSymbols.filter(
          (symbol) => symbol && !symbols.includes(String(symbol).toUpperCase())
        );

        if (missingSymbols.length > 0) {
          const migrationResponses = await Promise.all(
            missingSymbols.map((symbol) =>
              fetch(`${API_BASE_URL}/api/watchlist`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol }),
              })
            )
          );

          if (migrationResponses.some((migrationResponse) => !migrationResponse.ok)) {
            throw new Error("Unable to migrate local watchlist to database");
          }

          const mergedSymbols = [...new Set([...symbols, ...missingSymbols])];
          setWatchlist(new Set(mergedSymbols));
          saveLocalWatchlist(userId, mergedSymbols);
          setWatchlistSource("database");
          setWatchlistError("");
          return;
        }
      }

      setWatchlist(new Set(symbols));
      saveLocalWatchlist(userId, symbols);
      setWatchlistSource("database");
      setWatchlistError("");
    } catch (err) {
      const localSymbols = loadLocalWatchlist(userId);
      setWatchlist(new Set(localSymbols));
      setWatchlistSource("localStorage");
      setWatchlistError(`${err.message}. Using local watchlist fallback.`);
    }
  }, [userId]);

  const toggleWatchlist = useCallback(async (symbol) => {
    const normalizedSymbol = String(symbol || "").toUpperCase();
    const isWatched = watchlist.has(normalizedSymbol);
    setWatchlistError("");

    try {
      if (isWatched) {
        const response = await fetch(
          `${API_BASE_URL}/api/watchlist/${encodeURIComponent(normalizedSymbol)}`,
          { method: "DELETE" }
        );

        if (!response.ok && response.status !== 404) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || "Unable to remove from watchlist");
        }

        setWatchlist((current) => {
          const next = new Set(current);
          next.delete(normalizedSymbol);
          saveLocalWatchlist(userId, [...next]);
          return next;
        });
        setWatchlistSource("database");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: normalizedSymbol }),
      });
      const item = await response.json().catch(() => null);
      if (!response.ok) throw new Error(item?.error || "Unable to add to watchlist");

      setWatchlist((current) => {
        const next = new Set([...current, item.symbol]);
        saveLocalWatchlist(userId, [...next]);
        return next;
      });
      setWatchlistSource("database");
    } catch (err) {
      setWatchlist((current) => {
        const next = new Set(current);
        if (isWatched) next.delete(normalizedSymbol);
        else next.add(normalizedSymbol);
        saveLocalWatchlist(userId, [...next]);
        return next;
      });
      setWatchlistSource("localStorage");
      setWatchlistError(`${err.message}. Saved to local fallback.`);
    }
  }, [userId, watchlist]);

  return {
    fetchWatchlist,
    toggleWatchlist,
    watchlist,
    watchlistError,
    watchlistSource,
  };
}
