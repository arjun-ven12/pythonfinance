import { Linking, Pressable, Text, View } from "react-native";
import { Badge, styles } from "./ui";
import { object, list, text, reportText } from "../utils/data";
import { colors as c } from "../theme";
export function ResearchReport({ value }: { value: unknown }) {
  const outer = object(value),
    report = object(
      outer.response ?? outer.outputJson ?? outer.contentJson ?? value,
    );
  const summary = report.executiveSummary ?? report.answer ?? report.summary;
  const sections = object(report.report);
  const sectionsList = Object.entries(sections).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : !!v,
  );
  return (
    <View style={{ gap: 16 }}>
      {summary ? (
        <Text selectable style={styles.body}>
          {text(summary, reportText(summary))}
        </Text>
      ) : !sectionsList.length ? (
        <Text selectable style={styles.body}>
          {reportText(value)}
        </Text>
      ) : null}
      {Array.isArray(report.keyFindings) && report.keyFindings.length > 0 && (
        <>
          <Text style={styles.heading}>Key findings</Text>
          <Text selectable style={styles.body}>
            {reportText(report.keyFindings)}
          </Text>
        </>
      )}
      {sectionsList.map(([key, entry]) => (
        <View key={key} style={{ gap: 7 }}>
          <Text style={[styles.label, { color: c.emerald }]}>
            {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
          </Text>
          <Text selectable style={styles.body}>
            {reportText(entry)}
          </Text>
        </View>
      ))}
      {list(report.evidence).map((e, i) => {
        const url = text(e.url, "");
        let allowed = false;
        try {
          const u = new URL(url);
          allowed = u.protocol === "https:" && !u.username && !u.password;
        } catch {}
        return (
          <View key={i} style={{ gap: 5 }}>
            <Badge label="EVIDENCE" />
            <Text style={styles.subtitle}>
              {text(
                e.title ?? e.label ?? e.source,
                "Server evidence reference",
              )}
            </Text>
            {allowed && (
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  void Linking.openURL(url).catch(() => {});
                }}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ color: c.teal, fontSize: 13 }}>
                  Open source ↗
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {!!outer.freshness && (
        <Text style={styles.small}>
          Evidence freshness: {reportText(outer.freshness)}
        </Text>
      )}
    </View>
  );
}
