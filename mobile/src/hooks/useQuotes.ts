import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { useIsFocused } from "expo-router";
import { rows } from "../utils/data";
import { connectQuotes, StreamSocket } from "../api/realtime";
import { api, apiOrigin, tokenStorage, useSession } from "../auth/session";
import { queryClient } from "../api/query";
export function useQuotes(symbols: string[], batchPath?: string) {
  const { online, user, locked } = useSession();
  const focused = useIsFocused();
  const [state, setState] = useState("paused");
  const key = [...new Set(symbols)].sort().join(",");
  useEffect(() => {
    if (!user || !online || locked || !focused || !key || Platform.OS === "web")
      return;
    let stop: undefined | (() => void);
    const start = () => {
      stop?.();
      stop = connectQuotes({
        url:
          apiOrigin.replace(/^https:/, "wss:").replace(/^http:/, "ws:") +
          "/ws/market-data",
        symbols: key.split(","),
        socketFactory: async (url) => {
          const session = await tokenStorage.read();
          if (!session) throw Error("Session required");
          const NativeWebSocket = WebSocket as unknown as new (
            url: string,
            protocols: string[] | undefined,
            options: { headers: Record<string, string> },
          ) => StreamSocket;
          return new NativeWebSocket(url, undefined, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          });
        },
        onQuote: (symbol, payload) => {
          queryClient.setQueryData(
            [user.id, `/api/market-data/${encodeURIComponent(symbol)}/quote`],
            payload,
          );
          if (batchPath)
            queryClient.setQueryData([user.id, batchPath], (old: unknown) => ({
              quotes: [
                ...rows(old, ["quotes"]).filter((q) => q.symbol !== symbol),
                payload,
              ],
            }));
        },
        onReconcile: () => {
          void queryClient.invalidateQueries();
        },
        onUnauthorized: async () => {
          await api.renew();
        },
        onState: setState,
      });
    };
    if (AppState.currentState === "active") start();
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") start();
      else stop?.();
    });
    return () => {
      listener.remove();
      stop?.();
    };
  }, [key, online, user, locked, focused, batchPath]);
  return state;
}
