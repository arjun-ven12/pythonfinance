import { useResource } from "../api/query";
import { useSession } from "../auth/session";
import { object, positions, number } from "../utils/data";
export function useExecution() {
  const allowed = useSession((s) => s.user?.pageAccess?.BROKER === true);
  return useResource("/api/execution/status", 15000, allowed);
}
export function usePortfolio() {
  const allowed = useSession((s) => s.user?.pageAccess?.BROKER === true);
  const execution = useExecution();
  const sessionQuery = useResource(
    "/api/trading/session",
    30000,
    !allowed || (execution.isSuccess && !execution.data?.control),
  );
  const control = object(execution.data?.control),
    session = object(sessionQuery.data?.session);
  const mode = String(
    control.mode ||
      (session.tradeEnv === "REAL"
        ? "LIVE_VIEW"
        : session.source === "INTERNAL_PAPER"
          ? "PAPER_VIEW"
          : ""),
  );
  const live = mode.startsWith("LIVE_");
  const paper = useResource(
    "/api/paper-portfolio",
    30000,
    mode === "PAPER_AUTONOMOUS" || mode === "PAPER_VIEW",
  );
  const data = live
    ? allowed
      ? object(control.snapshot)
      : { ...object(session.portfolio), ...object(session.balances) }
    : paper.data || {};
  const holdings = positions(data);
  const equity = number(data.equity),
    dayStart = number(data.dayStartEquity ?? control.dayStartEquity),
    baseline = number(data.starting_cash ?? control.baselineEquity);
  return {
    execution,
    control,
    mode,
    live,
    data,
    holdings,
    equity,
    daily: equity !== null && dayStart !== null ? equity - dayStart : null,
    cumulative: equity !== null && baseline !== null ? equity - baseline : null,
    currency: String(
      control.currency || object(session.balances).currency || "USD",
    ),
    error: execution.error || paper.error || sessionQuery.error,
    isLoading: execution.isLoading || paper.isLoading || sessionQuery.isLoading,
    at: data.timestamp || data.generated_at,
    refetch: async () => {
      await execution.refetch();
      if (!live) await paper.refetch();
    },
  };
}
