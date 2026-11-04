import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Screen,
  Card,
  Input,
  Button,
  ErrorNotice,
  styles,
} from "../components/ui";
import { api, useSession } from "../auth/session";
import { refreshAll } from "../api/query";
const labels: Record<string, string> = {
  emaFast: "Fast EMA periods",
  emaSlow: "Slow EMA periods",
  rsiThreshold: "RSI threshold",
  atrStopMultiple: "Stop distance (ATR multiple)",
  atrTakeProfitMultiple: "Target distance (ATR multiple)",
  newsWeight: "News weight",
  openaiWeight: "AI weight",
  regimeWeight: "Regime weight",
  riskPerTrade: "Risk per trade (fraction; 0.01 = 1%)",
  signalThreshold: "Signal threshold (0–100)",
};
export default function StrategyNew() {
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const online = useSession((s) => s.online);
  const [settings, setSettings] = useState<Record<string, string>>({
    emaFast: "20",
    emaSlow: "50",
    rsiThreshold: "55",
    atrStopMultiple: "1.5",
    atrTakeProfitMultiple: "8",
    newsWeight: "0.15",
    openaiWeight: "0.15",
    regimeWeight: "0.25",
    riskPerTrade: "0.01",
    signalThreshold: "60",
  });
  async function save() {
    setBusy(true);
    try {
      await api.request("/api/strategy-experiments", {
        name,
        description,
        status: "DRAFT",
        settingsJson: {
          ...Object.fromEntries(
            Object.entries(settings).map(([k, v]) => [k, Number(v)]),
          ),
          technicalWeight: 0.45,
          regimeFilter: true,
          newsFilter: true,
          marketHoursOnly: true,
          earningsFilter: true,
          trailingStopAtrMultiple: 2,
        },
      });
      await refreshAll();
      Alert.alert(
        "Draft saved",
        "The server stores your draft. Add validated entry and exit rules and run evidence before activation.",
      );
      router.back();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="New strategy draft"
      subtitle="Keep the hypothesis simple and testable."
    >
      <Card>
        <Text style={styles.subtitle}>
          This creates a research draft. It does not configure or activate
          trading.
        </Text>
        <Input
          accessibilityLabel="Strategy name"
          placeholder="Strategy name"
          value={name}
          onChangeText={setName}
          maxLength={120}
        />
        <Input
          accessibilityLabel="Strategy hypothesis"
          placeholder="Hypothesis, market, horizon and risk assumptions"
          multiline
          value={description}
          onChangeText={setDescription}
          maxLength={3000}
          style={{ minHeight: 140, textAlignVertical: "top" }}
        />
        <Text style={styles.subtitle}>
          Draft parameters below match the web’s starting template. These are
          editable research inputs, not approved trading settings.
        </Text>
        {Object.entries(settings).map(([key, value]) => (
          <View key={key} style={{ gap: 8 }}>
            <Text style={styles.subtitle}>{labels[key]}</Text>
            <Input
              accessibilityLabel={labels[key]}
              keyboardType="decimal-pad"
              value={value}
              onChangeText={(v) => setSettings((old) => ({ ...old, [key]: v }))}
            />
          </View>
        ))}
        <Button
          label="Save draft"
          busy={busy}
          disabled={!online || !name.trim()}
          onPress={() => void save()}
        />
      </Card>
      <ErrorNotice error={error} />
    </Screen>
  );
}
