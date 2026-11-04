import { useState } from "react";
import { Alert, Text, View } from "react-native";
import {
  Screen,
  Card,
  Input,
  Button,
  Badge,
  ErrorNotice,
  styles,
} from "../components/ui";
import { api, useSession } from "../auth/session";
import { useResource, refreshAll } from "../api/query";
import { rows, list, text, type Data } from "../utils/data";
import { assertPaperControl } from "../utils/automation";
const labels: Record<string, string> = {
  maxOrderNotional: "Maximum order value (USD)",
  maxPositionNotional: "Maximum position value (USD)",
  maxDailyNotional: "Daily order value limit (USD)",
  maxDailyOrders: "Maximum daily orders",
  maxOpenPositions: "Maximum concurrent positions",
  maxDailyLossPct: "Daily loss limit (%)",
  maxDrawdownPct: "Maximum drawdown (%)",
  maxGrossExposurePct: "Gross exposure limit (%)",
};
export default function PaperSetup() {
  const library = useResource("/api/strategy-experiments");
  const [selected, setSelected] = useState<string[]>([]),
    [symbols, setSymbols] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const [limits, setLimits] = useState<Record<string, string>>({
    maxOrderNotional: "500",
    maxPositionNotional: "2000",
    maxDailyNotional: "2000",
    maxDailyOrders: "5",
    maxOpenPositions: "3",
    maxDailyLossPct: "1",
    maxDrawdownPct: "3",
    maxGrossExposurePct: "25",
  });
  const { user, online } = useSession();
  const versions: Data[] = rows(library.data, ["experiments"]).flatMap((s) =>
    list(s.versions).map((v) => ({
      ...v,
      label: `${text(s.name)} · v${text(v.version)}`,
    })),
  );
  async function save() {
    setBusy(true);
    try {
      const status = await api.request("/api/execution/status");
      if (status.control) {
        const current = assertPaperControl(status.control);
        if (current.status === "ACTIVE")
          throw Error(
            "Pause the current paper controller before reconfiguration.",
          );
      }
      if (!selected.length)
        throw Error("Select at least one owned strategy version.");
      const policy = {
        ...Object.fromEntries(
          Object.entries(limits).map(([k, v]) => [k, Number(v)]),
        ),
        accountId: "INTERNAL_PAPER",
        currency: "USD",
        symbols: symbols
          .toUpperCase()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        markets: ["US"],
        strategyVersionIds: selected,
        maxQuoteAgeMs: 15000,
        maxSpreadBps: 30,
        maxSlippageBps: 20,
        maxRiskPerTradePct: 1,
        minConfidence: 85,
      };
      await api.request("/api/execution/configure", {
        mode: "PAPER_AUTONOMOUS",
        policy,
      });
      await refreshAll();
      Alert.alert(
        "Paper policy saved",
        "Automation is still disabled. Validate and activate the selected strategy versions, then explicitly resume paper automation in the Automation Centre.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="Paper automation policy"
      subtitle="Configure Internal Paper. No live activation."
    >
      <Card>
        <Badge label="PAPER ONLY" tone="positive" />
        <Text style={styles.subtitle}>
          Dollar amounts below are editable limits, not account balances. This
          workflow configures US/USD long securities. Existing exchange-calendar
          and server risk checks remain mandatory.
        </Text>
        <Input
          accessibilityLabel="Permitted paper symbols"
          placeholder="Permitted symbols, comma separated"
          autoCapitalize="characters"
          value={symbols}
          onChangeText={setSymbols}
        />
        {Object.entries(limits).map(([key, value]) => (
          <View key={key} style={{ gap: 8 }}>
            <Text style={styles.subtitle}>{labels[key]}</Text>
            <Input
              accessibilityLabel={labels[key]}
              keyboardType="decimal-pad"
              value={value}
              onChangeText={(v) => setLimits((old) => ({ ...old, [key]: v }))}
            />
          </View>
        ))}
      </Card>
      <Card>
        <Text style={styles.heading}>Owned strategy versions</Text>
        <Text style={styles.small}>
          Draft versions can be allowlisted, but cannot execute until backend
          deployment validation passes and they are active.
        </Text>
        {versions.map((v, i) => (
          <Button
            key={text(v.id, String(i))}
            secondary={!selected.includes(text(v.id))}
            label={`${selected.includes(text(v.id)) ? "✓ " : ""}${text(v.label)}`}
            onPress={() =>
              setSelected((old) =>
                old.includes(text(v.id))
                  ? old.filter((x) => x !== v.id)
                  : [...old, text(v.id)],
              )
            }
          />
        ))}
        {!versions.length && (
          <Text style={styles.subtitle}>
            Create and backtest a strategy draft first.
          </Text>
        )}
      </Card>
      <ErrorNotice error={error || library.error} />
      <Button
        label="Save disabled paper configuration"
        busy={busy}
        disabled={
          !online ||
          user?.role !== "LEVEL_3_OWNER_ADMIN" ||
          !symbols.trim() ||
          !selected.length
        }
        onPress={() => void save()}
      />
    </Screen>
  );
}
