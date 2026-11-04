import { useState } from "react";
import { Text } from "react-native";
import {
  Screen,
  Card,
  Input,
  Button,
  styles,
  Badge,
  ErrorNotice,
  Empty,
} from "../components/ui";
import { useResource, refreshAll } from "../api/query";
import { api, useSession } from "../auth/session";
import { rows, text, object } from "../utils/data";
export default function Memory() {
  const [page, setPage] = useState(1),
    [preference, setPreference] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState<unknown>(null);
  const online = useSession((s) => s.online);
  const memory = useResource(`/api/memory/events?page=${page}&pageSize=20`);
  async function action(id: string, kind: string) {
    setBusy(id);
    try {
      await api.request(`/api/memory/events/${id}/${kind}`, {});
      await refreshAll();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function save() {
    setBusy("preference");
    try {
      await api.request("/api/memory/personalization/preferences", {
        preferenceType: "COMMUNICATION",
        key: "MOBILE_EXPLICIT_PREFERENCE",
        value: preference,
      });
      setPreference("");
      await refreshAll();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  return (
    <Screen
      title="AI memory"
      subtitle="Historical context stays visible and under your control."
    >
      <Card>
        <Text style={styles.subtitle}>
          Memory is historical evidence, not current market data. Excluding a
          memory never changes deterministic trading limits.
        </Text>
        <Input
          accessibilityLabel="AI preference"
          multiline
          placeholder="Add an explicit preference for your copilot…"
          value={preference}
          onChangeText={setPreference}
          maxLength={1000}
        />
        <Button
          secondary
          label="Save preference"
          busy={busy === "preference"}
          disabled={!online || !preference.trim() || !!busy}
          onPress={() => void save()}
        />
      </Card>
      <ErrorNotice error={memory.error || error} />
      {rows(memory.data, ["events", "items"]).map((m, i) => (
        <Card key={text(m.id, String(i))}>
          <Badge label={text(m.eventType ?? m.type, "MEMORY")} />
          <Text style={styles.heading}>{text(m.title)}</Text>
          <Text selectable style={styles.body}>
            {text(m.summary ?? m.content)}
          </Text>
          <Button
            secondary
            label="Exclude from AI context"
            disabled={!online || !!busy}
            busy={busy === m.id}
            onPress={() => void action(text(m.id), "exclude")}
          />
        </Card>
      ))}
      {!rows(memory.data, ["events", "items"]).length && (
        <Empty
          title="No memory to display"
          detail="Research and strategy activity will create historical context when supported by the server."
        />
      )}
      <Button
        secondary
        label="Next memory page"
        disabled={
          page >= Number(object(memory.data?.pagination).totalPages || 1)
        }
        onPress={() => setPage((n) => n + 1)}
      />
      {page > 1 && (
        <Button
          secondary
          label="Previous page"
          onPress={() => setPage((n) => n - 1)}
        />
      )}
    </Screen>
  );
}
