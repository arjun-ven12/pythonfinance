import { useState } from "react";
import { Alert, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  Card,
  Screen,
  Badge,
  KeyValue,
  Section,
  styles,
  Button,
  Input,
  ErrorNotice,
  Empty,
} from "../components/ui";
import { useResource, refreshAll } from "../api/query";
import { api, useSession } from "../auth/session";
import { rows, text, reportText } from "../utils/data";
import { assertPaperControl } from "../utils/automation";
export default function StrategyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const library = useResource(
    `/api/strategy-experiments?experimentId=${encodeURIComponent(id || "")}`,
  );
  const item = rows(library.data, ["experiments"]).find((s) => s.id === id);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState<unknown>(null),
    [period, setPeriod] = useState("2y"),
    [symbol, setSymbol] = useState("AAPL");
  const online = useSession((s) => s.online);
  async function run(kind: string) {
    setBusy(kind);
    try {
      await api.request(
        `/api/strategy-experiments/${encodeURIComponent(id || "")}/${kind}`,
        kind === "walk-forward"
          ? { symbol, period, trainWindowDays: 180, testWindowDays: 30 }
          : { symbol, period },
      );
      await refreshAll();
      Alert.alert(
        "Analysis completed",
        "Updated results are available in the strategy workspace.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function activate(version: unknown) {
    setBusy("activate");
    try {
      const status = await api.request("/api/execution/status");
      assertPaperControl(status.control);
      await api.request("/api/active-strategy", {
        experimentId: id,
        strategyVersionId: version,
      });
      await refreshAll();
      Alert.alert(
        "Paper strategy activated",
        "The backend validated deployment evidence. Your autonomous policy allowlist is still enforced separately.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  return (
    <Screen
      title={text(item?.name, "Strategy")}
      subtitle="Versioned research & deterministic deployment"
    >
      <ErrorNotice error={library.error || error} />
      {!item ? (
        <Empty
          title="Strategy unavailable"
          detail="Pull to refresh or check access to this workspace."
        />
      ) : (
        <>
          <Card>
            <Badge label={text(item.status, "RESEARCH")} />
            <Text style={styles.subtitle}>
              {text(
                item.description,
                "Inspect the saved strategy and its full evidence below.",
              )}
            </Text>
            <Text selectable style={styles.body}>
              {reportText(item.strategyJson ?? item.settingsJson)}
            </Text>
          </Card>
          <Section title="Versions & safe paper activation" />
          {rows(item.versions).map((v, i) => (
            <Card key={text(v.id, String(i))}>
              <Badge label={text(v.deploymentStatus, "DRAFT")} />
              <KeyValue label="Version" value={v.version} />
              <Text selectable style={styles.subtitle}>
                {reportText(v.validation ?? v.readiness)}
              </Text>
              <Button
                secondary
                label={`Review & activate v${text(v.version)} for paper`}
                busy={busy === "activate"}
                disabled={!online || !!busy}
                onPress={() =>
                  Alert.alert(
                    "Activate paper strategy?",
                    "The server will check lifecycle evidence and validation. This action cannot activate live execution.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Validate & activate paper",
                        onPress: () => void activate(v.id),
                      },
                    ],
                  )
                }
              />
            </Card>
          ))}
          <Section title="Backtest & walk-forward" />
          <Card>
            <Input
              accessibilityLabel="Backtest symbol"
              autoCapitalize="characters"
              value={symbol}
              onChangeText={setSymbol}
            />
            <Input
              accessibilityLabel="Backtest period"
              placeholder="Period, such as 2y"
              value={period}
              onChangeText={setPeriod}
            />
            <Button
              secondary
              label="Run server backtest"
              disabled={!online || !!busy || !period.trim() || !symbol.trim()}
              busy={busy === "run"}
              onPress={() => void run("run")}
            />
            <Button
              secondary
              label="Run walk-forward analysis"
              disabled={!online || !!busy}
              busy={busy === "walk-forward"}
              onPress={() => void run("walk-forward")}
            />
            <Text style={styles.small}>
              Compute continues on the server; mobile reports errors and never
              substitutes simulated results.
            </Text>
          </Card>
          {rows(item.runs).map((r, i) => (
            <Card key={text(r.id, String(i))}>
              <Badge label={text(r.status, "RESULT")} />
              <Text selectable style={styles.body}>
                {reportText(r.metrics ?? r.summary ?? r.resultJson ?? r)}
              </Text>
            </Card>
          ))}
          {rows(item.walkForwardRuns).map((r, i) => (
            <Card key={text(r.id, String(i))}>
              <Text style={styles.heading}>Walk-forward result</Text>
              <Text selectable style={styles.body}>
                {reportText(r.metrics ?? r.summary ?? r)}
              </Text>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
