import { QueryClient, useQuery } from "@tanstack/react-query";
import { api, useSession } from "../auth/session";
import { ApiError } from "./client";
import { useIsFocused } from "expo-router";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      gcTime: 10 * 60000,
      retry: (count, error) =>
        count < 1 &&
        !(error instanceof ApiError && [401, 403, 404].includes(error.status)),
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
});
export function useResource<T = Record<string, unknown>>(
  path: string,
  interval?: number,
  enabled = true,
) {
  const { user, online, locked } = useSession();
  const focused = useIsFocused();
  return useQuery<T>({
    queryKey: [user?.id, path],
    queryFn: () => api.request<T>(path),
    enabled: !!user && online && !locked && focused && enabled,
    refetchInterval: online && !locked && focused ? interval || false : false,
    refetchIntervalInBackground: false,
  });
}
export const refreshAll = () => queryClient.invalidateQueries();
