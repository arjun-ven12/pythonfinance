import { useState } from "react";
import { Text, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  Screen,
  Card,
  Input,
  Button,
  Section,
  LinkRow,
  styles,
  Badge,
  ErrorNotice,
  Empty,
} from "../components/ui";
import { ResearchReport } from "../components/ResearchReport";
import { api, useSession } from "../auth/session";
import { useResource, refreshAll } from "../api/query";
import { object, rows, text, list } from "../utils/data";
export default function Research() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState(params.id || ""),
    [title, setTitle] = useState(""),
    [entry, setEntry] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(""),
    [error, setError] = useState<unknown>(null);
  const online = useSession((s) => s.online);
  const projects = useResource(
    `/api/research/projects?pageSize=20&page=${page}`,
  );
  const project = useResource(
    `/api/research/projects/${encodeURIComponent(id)}`,
    undefined,
    !!id,
  );
  const items = rows(projects.data, ["items", "projects"]);
  async function create() {
    setBusy("create");
    try {
      const p = await api.request("/api/research/projects", {
        title,
        topic: title,
        researchType: "THEME_RESEARCH",
        scope: { topic: title },
      });
      setId(text(p.id));
      setTitle("");
      await refreshAll();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function action(kind: string) {
    setBusy(kind);
    try {
      await api.request(
        `/api/research/projects/${encodeURIComponent(id)}/${kind}`,
        kind === "notes"
          ? { content: entry }
          : kind === "ask"
            ? { question: entry }
            : { title: project.data?.title },
      );
      setEntry("");
      await refreshAll();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  return (
    <Screen
      title="Research workspace"
      subtitle="Persistent theses, notes and structured reports."
    >
      <Card>
        <Input
          accessibilityLabel="Research topic"
          placeholder="A company, sector or investment question"
          value={title}
          onChangeText={setTitle}
          maxLength={160}
        />
        <Button
          secondary
          label="Create research project"
          busy={busy === "create"}
          disabled={!online || !title.trim() || !!busy}
          onPress={() => void create()}
        />
      </Card>
      <ErrorNotice error={projects.error || project.error || error} />
      <Section title="Your projects" />
      {items.map((p, i) => (
        <Card key={text(p.id, String(i))}>
          <Badge label={text(p.status)} />
          <Button
            secondary
            label={text(p.title)}
            onPress={() => setId(text(p.id))}
          />
        </Card>
      ))}
      {!items.length && (
        <Empty
          title="Start a research trail"
          detail="Create a project to collect notes, questions, evidence and versioned reports."
        />
      )}
      <Button
        secondary
        label="Next project page"
        disabled={
          page >= Number(object(projects.data?.pagination).totalPages || 1)
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
      {!!id && (
        <>
          <Section title={text(project.data?.title, "Selected project")} />
          <Card>
            <Input
              accessibilityLabel="Research note or question"
              multiline
              maxLength={2000}
              placeholder="Add a note or ask a contextual follow-up…"
              value={entry}
              onChangeText={setEntry}
            />
            <Button
              secondary
              label="Save note"
              busy={busy === "notes"}
              disabled={!online || !entry.trim() || !!busy}
              onPress={() => void action("notes")}
            />
            <Button
              secondary
              label="Ask project copilot"
              busy={busy === "ask"}
              disabled={!online || !entry.trim() || !!busy}
              onPress={() => void action("ask")}
            />
            <Button
              label="Generate structured report"
              busy={busy === "reports"}
              disabled={!online || !!busy}
              onPress={() => void action("reports")}
            />
            <Button
              secondary
              label="Archive project"
              disabled={!online || !!busy}
              onPress={() =>
                Alert.alert(
                  "Archive research?",
                  "The project remains on the server and can be restored on the platform.",
                  [
                    { text: "Cancel" },
                    { text: "Archive", onPress: () => void action("archive") },
                  ],
                )
              }
            />
          </Card>
          {list(project.data?.reports).map((r, i) => (
            <Card key={text(r.id, String(i))}>
              <Badge label={text(r.reportType, "REPORT")} />
              <Text style={styles.heading}>{text(r.title)}</Text>
              <ResearchReport
                value={r.outputJson ?? r.contentJson ?? r.reportJson ?? r}
              />
            </Card>
          ))}
          {list(project.data?.notes).map((n, i) => (
            <Card key={text(n.id, String(i))}>
              <Text selectable style={styles.body}>
                {text(n.content)}
              </Text>
            </Card>
          ))}
          <Card>
            <LinkRow
              title="Full research & AI workspace"
              detail="Context-aware portfolio, scanner and strategy questions"
              to="/ai"
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
