import { useState } from "react";
import { Text, View, Alert } from "react-native";
import { router, type Href } from "expo-router";
import {
  Screen,
  Card,
  Input,
  Button,
  styles,
  Badge,
  Section,
  LinkRow,
  Empty,
  ErrorNotice,
  Skeleton,
  Freshness,
} from "../components/ui";
import { useResource, refreshAll } from "../api/query";
import { api, useSession } from "../auth/session";
import { object, rows, text, number, percent, quotePrice } from "../utils/data";
import { colors as c } from "../theme";
import { useQuotes } from "../hooks/useQuotes";
export default function Markets() {
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [watchPage, setWatchPage] = useState(0);
  const online = useSession((s) => s.online);
  const watch = useResource("/api/watchlist", 60000);
  const scanner = useResource("/api/scan-results", 30000);
  const watched = rows(watch.data, ["watchlist"]);
  const visibleWatch = watched.slice(watchPage * 20, (watchPage + 1) * 20);
  const watchSymbols = visibleWatch.map((w) => text(w.symbol));
  const batchPath = `/api/market-data/quotes?symbols=${encodeURIComponent(watchSymbols.join(","))}`;
  const quotes = useResource(batchPath, 30000, !!watchSymbols.length);
  useQuotes(watchSymbols, batchPath);
  const opportunities = rows(scanner.data, [
    "opportunities",
    "results",
    "scan_results",
    "stocks",
  ]);
  const open = () => {
    const s = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9.^=_-]{1,32}$/.test(s))
      return Alert.alert(
        "Check the symbol",
        "Use a supported exchange symbol, such as AAPL or D05.SI.",
      );
    router.push(`/symbol/${encodeURIComponent(s)}` as Href);
  };
  async function runScan() {
    setBusy(true);
    try {
      await api.request("/api/scans/start", {});
      await refreshAll();
      Alert.alert(
        "Scan queued",
        "The server will continue scanning independently of your phone.",
      );
    } catch (e) {
      Alert.alert(
        "Scan unavailable",
        e instanceof Error ? e.message : "Request failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Markets" subtitle="Signal over noise.">
      <View style={{ gap: 10 }}>
        <Input
          accessibilityLabel="Stock symbol"
          placeholder="Search by symbol · AAPL, D05.SI"
          autoCapitalize="characters"
          autoCorrect={false}
          value={symbol}
          onChangeText={setSymbol}
          onSubmitEditing={open}
        />
        <Button
          label="Explore symbol"
          secondary
          onPress={open}
          disabled={!symbol.trim()}
        />
      </View>
      <Section title="Your watchlist" />
      {watch.isLoading ? (
        <Skeleton />
      ) : watched.length ? (
        <Card>
          {visibleWatch.map((w, i) => {
            const price = rows(quotes.data, ["quotes"]).find(
              (q) => q.symbol === w.symbol,
            );
            return (
              <View key={text(w.id, String(i))}>
                <LinkRow
                  title={text(w.symbol)}
                  detail={text(w.notes, "Quote, chart & research")}
                  to={`/symbol/${encodeURIComponent(text(w.symbol))}`}
                >
                  <Text style={styles.body}>
                    {quotePrice(
                      object(price?.quote).last,
                      text(w.symbol),
                      price,
                    )}
                  </Text>
                </LinkRow>
                <Freshness at={price?.lastUpdated} />
                <Button
                  secondary
                  label={`Remove ${text(w.symbol)}`}
                  disabled={!online || busy}
                  onPress={() =>
                    Alert.alert("Remove watchlist symbol?", text(w.symbol), [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => {
                          void api
                            .request(
                              `/api/watchlist/${encodeURIComponent(text(w.symbol))}`,
                              undefined,
                              "DELETE",
                            )
                            .then(() => refreshAll())
                            .catch((e) =>
                              Alert.alert(
                                "Removal not confirmed",
                                e instanceof Error
                                  ? e.message
                                  : "Request failed.",
                              ),
                            );
                        },
                      },
                    ])
                  }
                />
              </View>
            );
          })}
        </Card>
      ) : (
        <Empty
          title="Build your market lens"
          detail="Look up a symbol and add it to your watchlist."
        />
      )}
      <ErrorNotice
        error={watch.error || quotes.error}
        retry={() => void watch.refetch()}
      />
      {watched.length > 20 && (
        <View style={styles.row}>
          <Button
            secondary
            label="Previous watchlist page"
            disabled={!watchPage}
            onPress={() => setWatchPage((n) => n - 1)}
          />
          <Button
            secondary
            label="Next watchlist page"
            disabled={(watchPage + 1) * 20 >= watched.length}
            onPress={() => setWatchPage((n) => n + 1)}
          />
        </View>
      )}
      <Section title="Scanner opportunities" />
      <Freshness
        at={
          scanner.data?.generated_at ??
          scanner.data?.generatedAt ??
          scanner.data?.lastUpdated
        }
        maxAge={300000}
        label="Last scan"
      />
      <Button
        label="Run a server scan"
        secondary
        onPress={() => void runScan()}
        busy={busy}
        disabled={!online}
      />
      <ErrorNotice error={scanner.error} retry={() => void scanner.refetch()} />
      {opportunities.length ? (
        opportunities.slice(0, 40).map((s, i) => (
          <Card key={text(s.id, String(i))}>
            <View style={styles.row}>
              <Badge
                label={text(s.signal ?? s.action, "Signal")}
                tone={
                  text(s.signal ?? s.action).includes("BUY")
                    ? "positive"
                    : "neutral"
                }
              />
              {number(s.confidence) !== null && (
                <Text style={[styles.small, { color: c.emerald }]}>
                  {percent(s.confidence)} confidence
                </Text>
              )}
            </View>
            <LinkRow
              title={text(s.symbol)}
              detail={text(
                s.reason ?? s.explanation ?? s.strategy,
                "Open signal details",
              )}
              to={`/symbol/${encodeURIComponent(text(s.symbol))}`}
            />
          </Card>
        ))
      ) : (
        <Empty
          title="No current opportunities"
          detail="The scanner may be waiting for a trading session or a qualifying signal."
        />
      )}
      <Card>
        <LinkRow
          title="Research the market"
          detail="Sector, macro and company evidence"
          to="/ai"
        />
      </Card>
    </Screen>
  );
}
