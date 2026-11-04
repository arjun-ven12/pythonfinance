import { Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import { Bell, Settings2, Zap } from "lucide-react-native";
import {
  Card,
  Screen,
  styles,
  Badge,
  Metric,
  Section,
  LinkRow,
  Freshness,
  Skeleton,
  ErrorNotice,
  Empty,
} from "../components/ui";
import { FinancialChart } from "../components/FinancialChart";
import { usePortfolio } from "../hooks/usePortfolio";
import { useResource } from "../api/query";
import { useSession } from "../auth/session";
import { money, rows, text, number } from "../utils/data";
import { colors as c } from "../theme";
export default function Home() {
  const p = usePortfolio();
  const user = useSession((s) => s.user);
  const alerts = useResource("/api/alerts?limit=3", 30000);
  const trades = useResource("/api/paper-trades", 30000, !p.live && !!p.mode);
  const health = useResource("/api/market-data/providers/health", 60000);
  const recent = rows(p.live ? p.execution.data?.fills : trades.data, [
    "trades",
    "fills",
    "items",
  ]);
  const notices = rows(alerts.data, ["alerts", "items"]);
  return (
    <Screen
      title="Your edge, in focus."
      subtitle={`QUANT’S TRADE  /  ${user?.name?.split(" ")[0] || "Workspace"}`}
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={14}
          onPress={() => router.push("/settings")}
        >
          <Settings2 color={c.muted} size={22} />
        </Pressable>
      }
    >
      <View style={styles.row}>
        <Badge
          label={
            p.mode
              ? p.live
                ? "LIVE ACCOUNT"
                : "PAPER ACCOUNT"
              : "ACCOUNT UNVERIFIED"
          }
          tone={p.live ? "warning" : "positive"}
        />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Alerts"
          onPress={() => router.push("/alerts")}
          hitSlop={12}
        >
          <Bell size={20} color={c.muted} />
        </Pressable>
      </View>
      {p.isLoading ? (
        <Skeleton />
      ) : (
        <Card>
          <Text style={styles.label}>Total equity</Text>
          <Text style={styles.metric}>{money(p.equity, p.currency)}</Text>
          <Freshness at={p.at} />
          <FinancialChart data={p.data.equity_history} />
          <View style={styles.row}>
            <Metric
              label="Trading-day P&L"
              value={money(p.daily, p.currency)}
            />
            <Metric
              label="Cumulative P&L"
              value={money(p.cumulative, p.currency)}
            />
          </View>
        </Card>
      )}
      <ErrorNotice error={p.error} retry={() => void p.refetch()} />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/automation")}
      >
        <Card style={{ borderColor: "#2C6455", backgroundColor: "#11231E" }}>
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 7 }}>
              <Text style={[styles.label, { color: c.emerald }]}>
                Automation centre
              </Text>
              <Text style={styles.heading}>
                {text(p.control.status, "Review server automation")}
              </Text>
              <Text style={styles.subtitle}>
                Execution, protection & risk. Always server-side.
              </Text>
            </View>
            <Zap size={26} color={c.emerald} />
          </View>
        </Card>
      </Pressable>
      <View style={styles.row}>
        <Metric label="Available cash" value={money(p.data.cash, p.currency)} />
        <Metric
          label="Positions"
          value={p.mode ? String(p.holdings.length) : "—"}
        />
      </View>
      <Section title="Market pulse" />
      <Card>
        <Text style={styles.subtitle}>
          {health.error
            ? "Market connectivity is unavailable."
            : health.isLoading
              ? "Checking market providers…"
              : text(
                  health.data?.status,
                  `Provider health received · review Markets for timestamped quotes`,
                )}
        </Text>
        <LinkRow
          title="Find your next opportunity"
          detail="Watchlist, quotes & scanner"
          to="/markets"
        />
      </Card>
      <Section title="Recent activity" to="/portfolio" />
      {recent.length ? (
        <Card>
          {recent.slice(0, 3).map((t, i) => (
            <LinkRow
              key={text(t.id, String(i))}
              title={text(t.symbol)}
              detail={`${text(t.side)} · ${text(t.quantity)} shares · ${text(t.status, t.filledAt ? "Filled" : "Recorded")}`}
              to="/portfolio"
            >
              <Text style={styles.body}>
                {money(t.fillPrice ?? t.price, p.currency)}
              </Text>
            </LinkRow>
          ))}
        </Card>
      ) : (
        <Empty
          title="No executions to show"
          detail="Filled orders from your selected environment appear here."
        />
      )}
      <Section title="On your radar" to="/alerts" />
      {notices.slice(0, 3).map((a, i) => (
        <Card key={text(a.id, String(i))}>
          <Badge
            label={text(a.severity, "INFO")}
            tone={
              ["HIGH", "CRITICAL"].includes(text(a.severity))
                ? "negative"
                : "neutral"
            }
          />
          <Text style={styles.heading}>{text(a.title)}</Text>
          <Text style={styles.subtitle}>{text(a.message)}</Text>
        </Card>
      ))}
      <Card>
        <LinkRow
          title="Ask your copilot"
          detail="Research grounded in your platform context"
          to="/ai"
        />
        <Text style={styles.small}>
          AI insights are generated only when requested. Risk decisions remain
          deterministic.
        </Text>
      </Card>
      {number(p.data.fees_paid) !== null && (
        <Text style={styles.small}>
          Ledger fees: {money(p.data.fees_paid, p.currency)} ·{" "}
          {text(p.data.source, "Server account snapshot")}
        </Text>
      )}
    </Screen>
  );
}
