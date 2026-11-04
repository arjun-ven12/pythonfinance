import { Text } from "react-native";
import { Card, Screen, Section, styles, ErrorNotice } from "../components/ui";
import { useResource } from "../api/query";
import { reportText } from "../utils/data";
export default function StrategyResults() {
  const allocation = useResource("/api/strategy-deployment-allocation");
  const lifecycle = useResource("/api/strategy-lifecycle");
  return (
    <Screen
      title="Strategy evidence"
      subtitle="Complete server allocation and lifecycle results."
    >
      <ErrorNotice error={allocation.error || lifecycle.error} />
      <Section title="Allocation" />
      <Card>
        <Text selectable style={styles.body}>
          {allocation.data
            ? reportText(allocation.data)
            : "Loading allocation evidence…"}
        </Text>
      </Card>
      <Section title="Validation & lifecycle" />
      <Card>
        <Text selectable style={styles.body}>
          {lifecycle.data
            ? reportText(lifecycle.data)
            : "Loading lifecycle evidence…"}
        </Text>
      </Card>
    </Screen>
  );
}
