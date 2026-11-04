import { useState } from "react";
import { Text } from "react-native";
import {
  Screen,
  Card,
  Badge,
  Button,
  Freshness,
  ErrorNotice,
  Empty,
  styles,
} from "../components/ui";
import { useResource } from "../api/query";
import { object, rows, text } from "../utils/data";
export default function Alerts() {
  const [page, setPage] = useState(1);
  const data = useResource(`/api/alerts?page=${page}&pageSize=25`, 30000);
  const items = rows(data.data, ["alerts", "items"]);
  return (
    <Screen
      title="Activity & alerts"
      subtitle="Important events, directly from your platform."
    >
      <ErrorNotice error={data.error} retry={() => void data.refetch()} />
      {items.length ? (
        items.map((a, i) => (
          <Card key={text(a.id, String(i))}>
            <Badge
              label={text(a.severity, "INFO")}
              tone={
                ["HIGH", "CRITICAL"].includes(text(a.severity))
                  ? "negative"
                  : a.severity === "MEDIUM"
                    ? "warning"
                    : "neutral"
              }
            />
            <Text style={styles.heading}>{text(a.title)}</Text>
            <Text style={styles.body}>{text(a.message)}</Text>
            <Freshness
              at={a.createdAt ?? a.created_at}
              label="Recorded"
              maxAge={Number.MAX_SAFE_INTEGER}
            />
          </Card>
        ))
      ) : (
        <Empty
          title="All clear in this view"
          detail="No alerts were returned. Check connection errors before relying on an empty view."
        />
      )}
      <Button
        secondary
        label="Next alert page"
        disabled={page >= Number(object(data.data?.pagination).totalPages || 1)}
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
