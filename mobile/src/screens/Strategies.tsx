import { useState } from "react";
import { Text, View } from "react-native";
import {
  Card,
  Screen,
  styles,
  Badge,
  Section,
  LinkRow,
  Empty,
  ErrorNotice,
  Skeleton,
  Button,
} from "../components/ui";
import { useResource } from "../api/query";
import { object, rows, text } from "../utils/data";
export default function Strategies() {
  const [page, setPage] = useState(1);
  const library = useResource(
    `/api/strategy-experiments?view=mobile&page=${page}&pageSize=20`,
    60000,
  );
  const active = useResource("/api/active-strategy", 30000);
  const allocation = useResource("/api/strategy-deployment-allocation", 60000);
  const experiments = rows(library.data, ["experiments"]);
  const strategy = object(
    active.data?.activeStrategy ?? active.data?.strategy ?? active.data,
  );
  return (
    <Screen
      title="Strategies"
      subtitle="Research with discipline. Deploy with evidence."
    >
      <Card>
        <Badge
          label={strategy.active ? "ACTIVE STRATEGY" : "STRATEGY WORKSPACE"}
          tone={strategy.active ? "positive" : "neutral"}
        />
        <Text style={styles.heading}>
          {text(strategy.name, "Review your strategy set")}
        </Text>
        <Text style={styles.subtitle}>
          Activation eligibility, capital allocation and validation are enforced
          by the platform.
        </Text>
        <LinkRow
          title="Automation centre"
          detail="Server runtime, risk & execution"
          to="/automation"
        />
      </Card>
      <Section title="Your strategy library" />
      {library.isLoading ? (
        <Skeleton />
      ) : experiments.length ? (
        experiments.map((s, i) => {
          const versions = rows(s.versions);
          const deployed = versions.find(
            (v) => v.deploymentStatus === "ACTIVE",
          );
          const run = rows(s.runs)[0];
          return (
            <Card key={text(s.id, String(i))}>
              <View style={styles.row}>
                <Badge
                  label={deployed ? "ACTIVE" : text(s.status, "DRAFT")}
                  tone={deployed ? "positive" : "neutral"}
                />
                <Text style={styles.small}>{versions.length} versions</Text>
              </View>
              <LinkRow
                title={text(s.name)}
                detail={text(
                  s.description,
                  "Backtests, validation and walk-forward results",
                )}
                to={`/strategy/${encodeURIComponent(text(s.id))}`}
              />
              {run && (
                <Text style={styles.subtitle}>
                  Latest run: {text(run.status)} ·{" "}
                  {text(run.createdAt).slice(0, 10)}
                </Text>
              )}
            </Card>
          );
        })
      ) : (
        <Empty
          title="Your next edge starts with research"
          detail="Create a strategy draft below, or open a strategy authored on the web."
        />
      )}
      <ErrorNotice error={library.error} retry={() => void library.refetch()} />
      <Button
        secondary
        label="Next strategy page"
        disabled={
          page >= Number(object(library.data?.pagination).totalPages || 1)
        }
        onPress={() => setPage((n) => n + 1)}
      />
      {page > 1 && (
        <Button
          secondary
          label="Previous strategy page"
          onPress={() => setPage((n) => n - 1)}
        />
      )}
      <Card>
        <LinkRow
          title="Create a strategy draft"
          detail="A simplified mobile authoring workflow"
          to="/strategy-new"
        />
      </Card>
      <Section title="Allocation overview" />
      <Card>
        <Text style={styles.subtitle}>
          {text(
            allocation.data?.summary ??
              object(allocation.data?.allocation).summary,
            "Inspect strategy allocation and complete evidence in the workspace below.",
          )}
        </Text>
        <LinkRow
          title="Allocation & full results"
          detail="Portfolio simulation, walk-forward & risk evidence"
          to="/strategy-results"
        />
      </Card>
      <ErrorNotice error={active.error || allocation.error} />
    </Screen>
  );
}
