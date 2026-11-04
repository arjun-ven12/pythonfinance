import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { Sparkles, ArrowUpRight } from "lucide-react-native";
import {
  Screen,
  Card,
  Input,
  Button,
  Badge,
  Section,
  LinkRow,
  styles,
  ErrorNotice,
  Empty,
} from "../components/ui";
import { api, useSession } from "../auth/session";
import { object, rows, text, reportText } from "../utils/data";
import { useResource } from "../api/query";
import { ResearchReport } from "../components/ResearchReport";
import { colors as c, font } from "../theme";
type Turn = {
  question: string;
  response: Record<string, unknown>;
  mode: string;
};
export default function AI() {
  const [mode, setMode] = useState("General");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const online = useSession((s) => s.online);
  const projects = useResource("/api/research/projects?pageSize=10");
  async function ask(value = question) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    const endpoint =
      mode === "Portfolio"
        ? "/api/portfolio/copilot/ask"
        : mode === "Research"
          ? "/api/research/copilot/ask"
          : "/api/ai/chat";
    try {
      const response = await api.request(endpoint, {
        message: value,
        question: value,
        conversation: turns.slice(-5).map((t) => ({
          question: t.question,
          answer: reportText(t.response),
        })),
      });
      setTurns((old) => [...old, { question: value, response, mode }]);
      setQuestion("");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(turn: Turn) {
    try {
      if (reportText(turn.response).length > 4000)
        throw Error(
          "This response exceeds the note limit. Create a research project and generate a full structured report to retain it.",
        );
      const project = await api.request("/api/research/projects", {
        title: turn.question.slice(0, 120),
        topic: turn.question,
        researchType: "THEME_RESEARCH",
        scope: { topic: turn.question },
      });
      await api.request(`/api/research/projects/${project.id}/notes`, {
        content: reportText(turn.response),
      });
      await projects.refetch();
      Alert.alert(
        "Analysis saved",
        "Your response is saved as a note in Research.",
      );
    } catch (e) {
      setError(e);
    }
  }
  const suggestions =
    mode === "Portfolio"
      ? [
          "Where is my portfolio concentrated?",
          "Explain my current risk exposure.",
        ]
      : mode === "Research"
        ? [
            "What risks should I research this week?",
            "Explain the evidence behind my scanner signals.",
          ]
        : [
            "Summarize what needs my attention.",
            "How are my strategies performing?",
          ];
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Screen
        title="Your research partner"
        subtitle="Clear thinking. Grounded in your workspace."
      >
        <View style={{ flexDirection: "row", gap: 7 }}>
          {["General", "Research", "Portfolio"].map((m) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: m === mode }}
              onPress={() => setMode(m)}
              style={{
                flex: 1,
                minHeight: 44,
                backgroundColor: m === mode ? c.raised : c.bg,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: m === mode ? c.emerald : c.muted,
                  fontFamily: font.medium,
                }}
              >
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
        {!turns.length && (
          <Card>
            <Sparkles size={28} color={c.emerald} />
            <Text style={styles.heading}>Start with a better question.</Text>
            <Text style={styles.subtitle}>
              Explore evidence, test a thesis or understand your portfolio.
              Responses never authorize trades.
            </Text>
            {suggestions.map((q) => (
              <Pressable
                key={q}
                accessibilityRole="button"
                disabled={!online || busy}
                onPress={() => void ask(q)}
                style={[styles.row, { minHeight: 48 }]}
              >
                <Text style={[styles.body, { flex: 1 }]}>{q}</Text>
                <ArrowUpRight color={c.emerald} size={17} />
              </Pressable>
            ))}
          </Card>
        )}
        {turns.map((turn, i) => {
          const output = object(turn.response.response ?? turn.response);
          return (
            <View key={i} style={{ gap: 12 }}>
              <Text style={[styles.body, { color: c.muted }]}>
                {turn.question}
              </Text>
              <Card>
                <Badge label={`${turn.mode} copilot`} tone="positive" />
                <ResearchReport value={turn.response} />
                <Button
                  secondary
                  label="Save analysis to Research"
                  onPress={() => void save(turn)}
                  disabled={!online}
                />
                {Array.isArray(output.followUps) &&
                  output.followUps
                    .slice(0, 3)
                    .map((q, j) => (
                      <Button
                        key={j}
                        secondary
                        label={text(q)}
                        onPress={() => void ask(text(q))}
                        disabled={!online || busy}
                      />
                    ))}
              </Card>
            </View>
          );
        })}
        <ErrorNotice error={error} />
        <Input
          accessibilityLabel="Ask your copilot"
          multiline
          maxLength={2000}
          placeholder="Ask a question about your workspace…"
          value={question}
          onChangeText={setQuestion}
          style={{ minHeight: 98, textAlignVertical: "top" }}
        />
        <Button
          label={busy ? "Thinking with your context…" : "Ask copilot"}
          onPress={() => void ask()}
          busy={busy}
          disabled={!online || !question.trim()}
        />
        <Section title="Research workspace" to="/research" />
        {rows(projects.data, ["projects", "items"])
          .slice(0, 3)
          .map((p, i) => (
            <Card key={text(p.id, String(i))}>
              <LinkRow
                title={text(p.title)}
                detail={text(p.status)}
                to={`/research?id=${encodeURIComponent(text(p.id))}`}
              />
            </Card>
          ))}
        {!rows(projects.data, ["projects", "items"]).length && (
          <Empty
            title="Your research, collected"
            detail="Saved analyses and project reports stay in the existing backend research workspace."
          />
        )}
        <Card>
          <LinkRow
            title="AI memory & preferences"
            detail="Inspect and manage your historical context"
            to="/memory"
          />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
