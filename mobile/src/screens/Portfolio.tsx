import { useState } from "react";
import { Text, View, Pressable } from "react-native";
import {
  Screen,
  Card,
  styles,
  Badge,
  Metric,
  Section,
  KeyValue,
  LinkRow,
  Freshness,
  ErrorNotice,
  Empty,
  Skeleton,
} from "../components/ui";
import { usePortfolio } from "../hooks/usePortfolio";
import { useResource } from "../api/query";
import { money, number, rows, text, object, percent } from "../utils/data";
import { colors as c, font } from "../theme";
export default function Portfolio() {
  const p = usePortfolio();
  const [tab, setTab] = useState("Positions");
  const orders = useResource("/api/broker/orders", 30000, p.live);
  const fills = useResource("/api/broker/fills", 30000, p.live);
  const trades = useResource("/api/paper-trades", 30000, !!p.mode && !p.live);
  const reconciliation = useResource(
    p.live ? "/api/broker/reconciliation" : "/api/portfolio-reconciliation",
    30000,
    !!p.mode,
  );
  const activity =
    tab === "Orders"
      ? rows(orders.data, ["orders", "items"])
      : p.live
        ? rows(fills.data, ["fills", "items"])
        : rows(trades.data, ["trades", "items"]);
  return (
    <Screen title="Portfolio" subtitle="A clear view of your capital.">
      <View style={styles.row}>
        <Badge
          label={p.mode ? (p.live ? "LIVE" : "PAPER") : "UNVERIFIED"}
          tone={p.live ? "warning" : "positive"}
        />
        <Freshness at={p.at} />
      </View>
      {p.isLoading ? (
        <Skeleton />
      ) : (
        <Card>
          <Text style={styles.label}>Account equity</Text>
          <Text style={styles.metric}>{money(p.equity, p.currency)}</Text>
          <View style={styles.row}>
            <Metric label="Cash" value={money(p.data.cash, p.currency)} />
            <Metric
              label="Buying power"
              value={money(
                p.data.buyingPower ?? (!p.live ? p.data.cash : null),
                p.currency,
              )}
            />
          </View>
          <View style={styles.divider} />
          <KeyValue
            label="Realized P&L"
            value={money(p.data.realized_pnl, p.currency)}
          />
          <KeyValue
            label="Unrealized P&L"
            value={money(p.data.unrealized_pnl, p.currency)}
          />
          <KeyValue label="Fees" value={money(p.data.fees_paid, p.currency)} />
        </Card>
      )}
      <ErrorNotice error={p.error} retry={() => void p.refetch()} />
      <Section title="Allocation" />
      {p.holdings.length ? (
        <Card>
          {p.holdings.map((position, i) => {
            const qty = number(position.quantity);
            const value =
              number(position.marketValue ?? position.market_value) ??
              (qty !== null && number(position.last_price) !== null
                ? qty * number(position.last_price)!
                : null);
            const allocation =
              p.equity && value !== null ? (value / p.equity) * 100 : null;
            return (
              <View key={text(position.symbol, String(i))} style={{ gap: 8 }}>
                <View style={styles.row}>
                  <Text style={styles.body}>{text(position.symbol)}</Text>
                  <Text style={styles.small}>{percent(allocation)}</Text>
                </View>
                <View
                  style={{
                    height: 4,
                    backgroundColor: c.border,
                    borderRadius: 3,
                  }}
                >
                  <View
                    style={{
                      height: 4,
                      width: `${Math.min(100, Math.max(0, allocation || 0))}%`,
                      backgroundColor: [c.emerald, c.teal, c.amber][i % 3],
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      ) : (
        <Empty
          title="Capital ready, positions clear"
          detail="Positions will appear after a confirmed fill."
        />
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {["Positions", "Orders", "Fills"].map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              backgroundColor: tab === t ? c.raised : c.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: tab === t ? c.text : c.muted,
                fontFamily: font.medium,
              }}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === "Positions" ? (
        p.holdings.map((position, i) => (
          <Card key={text(position.symbol, String(i))}>
            <LinkRow
              title={text(position.symbol)}
              detail={`${text(position.quantity)} shares · avg ${money(position.avg_price ?? position.averageCost, p.currency)}`}
              to={`/symbol/${encodeURIComponent(text(position.symbol))}`}
            />
            <KeyValue
              label="Unrealized P&L"
              value={money(
                position.unrealized_pnl ?? position.unrealizedPnl,
                p.currency,
              )}
            />
            <KeyValue
              label="Stop / take profit"
              value={`${money(position.stop_loss, p.currency)} / ${money(position.take_profit, p.currency)}`}
            />
          </Card>
        ))
      ) : activity.length ? (
        activity.slice(0, 60).map((item, i) => (
          <Card key={text(item.id, String(i))}>
            <View style={styles.row}>
              <Text style={styles.heading}>{text(item.symbol)}</Text>
              <Badge
                label={text(
                  item.status,
                  tab === "Fills" ? "FILLED" : "UNKNOWN",
                )}
              />
            </View>
            <KeyValue
              label={`${text(item.side)} · ${text(item.quantity)} shares`}
              value={money(
                item.price ?? item.fillPrice ?? item.limitPrice,
                p.currency,
              )}
            />
            <Freshness
              at={item.filledAt ?? item.lastUpdatedAt}
              label="Recorded"
              maxAge={Number.MAX_SAFE_INTEGER}
            />
          </Card>
        ))
      ) : (
        <Empty
          title={
            tab === "Orders" && !p.live
              ? "Paper orders execute on the server"
              : "No records available"
          }
          detail={
            tab === "Orders" && !p.live
              ? "Review fills and Automation Centre for paper decisions."
              : "Confirmed records will appear here."
          }
        />
      )}
      <ErrorNotice error={orders.error || fills.error || trades.error} />
      <Section title="Reconciliation" />
      <Card>
        <KeyValue
          label="Status"
          value={text(
            reconciliation.data?.status ??
              object(reconciliation.data?.reconciliation).status,
            "Review server evidence",
          )}
        />
        <Freshness
          at={p.control.lastReconciledAt ?? reconciliation.data?.generated_at}
        />
        <LinkRow
          title="Execution & protection"
          detail="Orders, broker state and risk controls"
          to="/automation"
        />
      </Card>
      <ErrorNotice error={reconciliation.error} />
    </Screen>
  );
}
