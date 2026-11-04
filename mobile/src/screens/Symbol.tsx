import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  Screen,
  Card,
  styles,
  Badge,
  Button,
  Freshness,
  KeyValue,
  Section,
  ErrorNotice,
  Skeleton,
  LinkRow,
} from "../components/ui";
import { ResearchReport } from "../components/ResearchReport";
import { FinancialChart } from "../components/FinancialChart";
import { useResource, refreshAll } from "../api/query";
import { api, useSession } from "../auth/session";
import { useQuotes } from "../hooks/useQuotes";
import {
  object,
  text,
  quotePrice,
  percent,
  rows,
  reportText,
} from "../utils/data";
export default function SymbolScreen() {
  const params = useLocalSearchParams<{ symbol: string }>();
  const symbol = String(params.symbol || "").toUpperCase();
  const valid = /^[A-Z0-9.^=_-]{1,32}$/.test(symbol);
  const [range, setRange] = useState("1mo"),
    [busy, setBusy] = useState(""),
    [analysis, setAnalysis] = useState<unknown>(null),
    [error, setError] = useState<unknown>(null);
  const online = useSession((s) => s.online);
  const quote = useResource(
    `/api/market-data/${encodeURIComponent(symbol)}/quote`,
    15000,
    valid,
  );
  const history = useResource(
    `/api/market-data/${encodeURIComponent(symbol)}/price-history?range=${range}&timeframe=1d`,
    60000,
    valid,
  );
  const scan = useResource("/api/scan-results", 30000);
  const stream = useQuotes(valid ? [symbol] : []);
  const q = object(quote.data?.quote ?? quote.data?.marketData);
  const signal = rows(scan.data, [
    "opportunities",
    "results",
    "scan_results",
    "stocks",
  ]).find((s) => s.symbol === symbol);
  async function watch() {
    setBusy("watch");
    try {
      await api.request("/api/watchlist", { symbol });
      await refreshAll();
      Alert.alert("Added to watchlist", symbol);
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function analyze() {
    setBusy("analysis");
    try {
      setAnalysis(
        await api.request("/api/research/copilot/symbol", {
          symbol,
          question: `Summarize recent company news, catalysts and technical context for ${symbol}. Cite only available platform evidence.`,
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  return (
    <Screen
      title={symbol || "Symbol"}
      subtitle="Market detail / research workspace"
    >
      {!valid && <ErrorNotice error={new Error("Invalid symbol.")} />}
      {quote.isLoading ? (
        <Skeleton />
      ) : (
        <Card>
          <View style={styles.row}>
            <Badge
              label={text(
                quote.data?.provider ?? quote.data?.source,
                "SOURCE UNVERIFIED",
              )}
            />
            <Badge
              label={
                quote.data?.isStale || q.halted
                  ? "STALE / HALTED"
                  : text(quote.data?.status, "QUOTE")
              }
            />
          </View>
          <Text style={styles.metric}>
            {quotePrice(q.last ?? q.price, symbol, quote.data)}
          </Text>
          <Text style={styles.subtitle}>
            {percent(q.changePercent ?? q.change_percent)} · price change
          </Text>
          <Freshness at={quote.data?.lastUpdated ?? q.timestamp} />
          <FinancialChart
            data={history.data?.points ?? history.data?.candles}
            field="close"
          />
          <View style={{ flexDirection: "row", gap: 7 }}>
            {["5d", "1mo", "3mo", "1y"].map((r) => (
              <View key={r} style={{ flex: 1 }}>
                <Button
                  secondary={r !== range}
                  label={r.toUpperCase()}
                  onPress={() => setRange(r)}
                />
              </View>
            ))}
          </View>
          <KeyValue
            label="Bid / ask"
            value={`${quotePrice(q.bid, symbol, quote.data)} / ${quotePrice(q.ask, symbol, quote.data)}`}
          />
          <KeyValue
            label="Market session"
            value={q.marketState ?? quote.data?.marketStatus}
          />
          <KeyValue
            label="Realtime channel"
            value={stream === "paused" ? "Foreground HTTPS refresh" : stream}
          />
        </Card>
      )}
      <ErrorNotice error={quote.error || history.error || error} />
      <Button
        label="Add to watchlist"
        secondary
        busy={busy === "watch"}
        disabled={!online || !valid || !!busy}
        onPress={() => void watch()}
      />
      <Section title="Signal & indicators" />
      {signal ? (
        <Card>
          {Object.entries(signal)
            .filter(([key]) =>
              [
                "signal",
                "action",
                "confidence",
                "reason",
                "explanation",
                "strategy",
                "rsi",
                "macd",
                "atr",
                "regime",
                "trend",
              ].includes(key),
            )
            .map(([key, value]) => (
              <KeyValue
                key={key}
                label={key.replace(/_/g, " ")}
                value={typeof value === "object" ? reportText(value) : value}
              />
            ))}
        </Card>
      ) : (
        <Card>
          <Text style={styles.subtitle}>
            No current scanner signal for this symbol. A quote is not a trade
            recommendation.
          </Text>
        </Card>
      )}
      <Section title="Company research & news" />
      <Button
        label="Research news, catalysts & context"
        secondary
        busy={busy === "analysis"}
        disabled={!online || !valid || !!busy}
        onPress={() => void analyze()}
      />
      {analysis !== null && (
        <Card>
          <ResearchReport value={analysis} />
        </Card>
      )}
      <Card>
        <LinkRow
          title="Research company news & catalysts"
          detail="Ask the Research copilot to retrieve relevant platform evidence"
          to="/ai"
        />
      </Card>
    </Screen>
  );
}
