import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Shield, OctagonAlert } from "lucide-react-native";
import {
  Screen,
  Card,
  Badge,
  Button,
  Section,
  KeyValue,
  RiskBar,
  LinkRow,
  ErrorNotice,
  Freshness,
  Input,
  styles,
  Empty,
} from "../components/ui";
import { api, useSession } from "../auth/session";
import { useExecution } from "../hooks/usePortfolio";
import { useResource, refreshAll } from "../api/query";
import { object, rows, list, text, money, number } from "../utils/data";
import {
  assertPaperControl,
  assertStopAcknowledged,
} from "../utils/automation";
import { colors as c } from "../theme";
export default function Automation() {
  const execution = useExecution();
  const engine = useResource("/api/engine-status", 30000);
  const approvals = useResource("/api/approval-requests", 30000);
  const strategies = useResource(
    "/api/execution/strategies",
    60000,
    useSession((s) => s.user?.pageAccess?.BROKER === true),
  );
  const user = useSession((s) => s.user),
    online = useSession((s) => s.online);
  const owner = user?.role === "LEVEL_3_OWNER_ADMIN";
  const control = object(execution.data?.control),
    snapshot = object(control.snapshot),
    policy = object(control.policy);
  const live = text(control.mode, "").startsWith("LIVE_");
  const intents = list(execution.data?.intents);
  const events = list(execution.data?.events);
  const pending = rows(approvals.data, [
    "requests",
    "approvals",
    "items",
  ]).filter((a) => ["PENDING", "APPROVED"].includes(text(a.status)));
  const [busy, setBusy] = useState(""),
    [error, setError] = useState<unknown>(null),
    [stopUnknown, setStopUnknown] = useState(false),
    [stopAck, setStopAck] = useState(""),
    [limit, setLimit] = useState("");
  const equity = number(snapshot.equity),
    day = number(snapshot.dayStartEquity),
    high = number(snapshot.highWaterEquity);
  const loss =
    equity !== null && day && day > 0
      ? Math.max(0, ((day - equity) / day) * 100)
      : null;
  const dd =
    equity !== null && high && high > 0
      ? Math.max(0, ((high - equity) / high) * 100)
      : null;
  async function stop() {
    setBusy("stop");
    setError(null);
    setStopAck("");
    try {
      const result = assertStopAcknowledged(
        await api.request("/api/execution/stop", {}),
      );
      setStopUnknown(false);
      setStopAck(
        `Server acknowledged SUSPENDED · generation ${result.generation}`,
      );
      await refreshAll();
    } catch (e) {
      setStopUnknown(true);
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function resume() {
    setBusy("resume");
    setError(null);
    try {
      const fresh = await api.request("/api/execution/status");
      assertPaperControl(fresh.control);
      await api.request("/api/execution/activate", {});
      await refreshAll();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function settings() {
    setBusy("settings");
    setError(null);
    try {
      const fresh = await api.request("/api/execution/status");
      const paper = assertPaperControl(fresh.control);
      const cap = Number(limit);
      if (!(cap > 0)) throw Error("Enter a positive order limit.");
      if (paper.status === "ACTIVE")
        throw Error("Pause paper automation before changing its risk policy.");
      await api.request("/api/execution/configure", {
        mode: "PAPER_AUTONOMOUS",
        policy: { ...object(paper.policy), maxOrderNotional: cap },
      });
      setLimit("");
      await refreshAll();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function reject(id: string) {
    setBusy(id);
    try {
      await api.request(
        `/api/approval-requests/${encodeURIComponent(id)}/reject`,
        { decisionNote: "Rejected from Android operator review." },
      );
      await refreshAll();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  return (
    <Screen
      title="Automation centre"
      subtitle="Your phone observes. Your server executes."
    >
      <View style={styles.row}>
        <Badge
          label={control.mode ? (live ? "LIVE" : "PAPER") : "MODE UNVERIFIED"}
          tone={live ? "warning" : "positive"}
        />
        <Badge
          label={text(control.mode).replace("PAPER_", "").replace("LIVE_", "")}
        />
      </View>
      {!user?.pageAccess?.BROKER && (
        <Empty
          title="Operator workspace access required"
          detail="Your account can view its permitted portfolio pages. Ask the owner for Broker page access to inspect execution controls."
        />
      )}
      <Card>
        <View style={styles.row}>
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Server execution state</Text>
            <Text style={styles.heading}>
              {stopUnknown
                ? "UNKNOWN — STOP UNCONFIRMED"
                : text(control.status, "Awaiting authoritative state")}
            </Text>
          </View>
          <Shield color={stopUnknown ? c.amber : c.emerald} size={28} />
        </View>
        <Freshness at={control.lastReconciledAt} />
        <KeyValue
          label="Broker authenticated"
          value={
            snapshot.authenticated === true
              ? "Confirmed"
              : snapshot.authenticated === false
                ? "Not authenticated"
                : "Unverified"
          }
        />
        <KeyValue
          label="Scheduler"
          value={
            engine.data?.is_running === true
              ? "Running"
              : engine.data?.is_running === false
                ? "Stopped"
                : "Unknown"
          }
        />
        <KeyValue label="Latest scan" value={engine.data?.last_run_at} />
        <KeyValue label="Next scan" value={engine.data?.next_run_at} />
        <KeyValue label="Account" value={control.accountId} />
      </Card>
      {stopUnknown && (
        <Card style={{ borderColor: c.amber }}>
          <OctagonAlert size={24} color={c.amber} />
          <Text style={[styles.heading, { color: c.amber }]}>
            Stop request not confirmed
          </Text>
          <Text style={styles.subtitle}>
            The connection failed or the response was incomplete. Automation may
            still be running. Reconnect and verify the server state; use the web
            operator console if needed.
          </Text>
          <Button
            label="Retry emergency stop"
            danger
            onPress={() => void stop()}
            disabled={!online || !owner}
            busy={busy === "stop"}
          />
        </Card>
      )}
      {!!stopAck && (
        <Text accessibilityLiveRegion="polite" style={{ color: c.emerald }}>
          {stopAck}
        </Text>
      )}
      <Button
        label="Emergency stop — server confirmation required"
        danger
        disabled={!owner || !online || busy === "stop"}
        busy={busy === "stop"}
        onPress={() =>
          Alert.alert(
            "Stop new execution?",
            "The server will suspend entries and preserve confirmed native protection. This does not liquidate positions.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Emergency stop",
                style: "destructive",
                onPress: () => void stop(),
              },
            ],
          )
        }
      />
      {!live && control.mode === "PAPER_AUTONOMOUS" && (
        <Button
          label="Resume configured paper automation"
          secondary
          disabled={!owner || !online || control.status === "ACTIVE" || !!busy}
          busy={busy === "resume"}
          onPress={() =>
            Alert.alert(
              "Resume Internal Paper?",
              "The server will reconcile and enforce the saved strategy and risk policy before resuming.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Resume paper", onPress: () => void resume() },
              ],
            )
          }
        />
      )}
      <ErrorNotice error={error || execution.error || engine.error} />
      <Card>
        <LinkRow
          title="Configure autonomous paper"
          detail="Approved strategies, symbols and deterministic limits"
          to="/paper-setup"
        />
      </Card>
      <Section title="Risk budget" />
      <Card>
        <RiskBar
          label="Daily loss"
          value={loss}
          limit={policy.maxDailyLossPct}
        />
        <RiskBar label="Drawdown" value={dd} limit={policy.maxDrawdownPct} />
        <KeyValue
          label="Max order value"
          value={money(policy.maxOrderNotional, text(control.currency, "USD"))}
        />
        <KeyValue
          label="Max concurrent positions"
          value={policy.maxOpenPositions}
        />
        <KeyValue
          label="Portfolio exposure cap"
          value={`${text(policy.maxGrossExposurePct)}%`}
        />
        <KeyValue
          label="Protection"
          value={
            snapshot.positionsProtected === true
              ? "Broker-confirmed coverage"
              : live
                ? "Unverified / missing"
                : "Server-managed paper exits"
          }
        />
        <KeyValue label="Last failure" value={control.lastError} />
      </Card>
      <Section title="Active strategies" />
      <Card>
        {rows(strategies.data, ["strategies"]).length ? (
          rows(strategies.data, ["strategies"]).map((s, i) => (
            <KeyValue
              key={text(s.id, String(i))}
              label={text(object(s.experiment).name, "Strategy")}
              value={`v${text(s.version)}`}
            />
          ))
        ) : (
          <Text style={styles.subtitle}>
            {Array.isArray(policy.strategyVersionIds)
              ? `${policy.strategyVersionIds.length} configured approved versions`
              : "No approved strategy configuration reported."}
          </Text>
        )}
        <LinkRow
          title="Review configurations"
          detail="Library, allocation and validation"
          to="/strategies"
        />
      </Card>
      <Section title="Pending review" />
      {pending.slice(0, 30).map((a, i) => (
        <Card key={text(a.id, String(i))}>
          <View style={styles.row}>
            <Text style={styles.heading}>
              {text(a.symbol)} · {text(a.side)}
            </Text>
            <Badge label={text(a.status)} />
          </View>
          <KeyValue
            label="Quantity / price"
            value={`${text(a.quantity)} / ${money(a.entryPrice, text(control.currency, "USD"))}`}
          />
          <Text style={styles.subtitle}>
            {text(
              a.reason ?? a.reasoning,
              "Review the complete proposal in the platform before any execution.",
            )}
          </Text>
          <Button
            label="Reject proposal"
            secondary
            disabled={!online || !!busy}
            busy={busy === a.id}
            onPress={() => void reject(text(a.id))}
          />
        </Card>
      ))}
      <Section title="Open orders & protection" />
      {intents
        .filter((o) =>
          [
            "PREPARED",
            "SUBMITTED",
            "PARTIAL",
            "UNKNOWN",
            "CANCEL_PENDING",
            "SUBMITTING",
          ].includes(text(o.state)),
        )
        .slice(0, 20)
        .map((o, i) => (
          <Card key={text(o.id, String(i))}>
            <View style={styles.row}>
              <Text style={styles.heading}>
                {text(o.symbol)} · {text(o.purpose)}
              </Text>
              <Badge
                label={text(o.state)}
                tone={o.state === "UNKNOWN" ? "warning" : "neutral"}
              />
            </View>
            <KeyValue
              label="Quantity / filled"
              value={`${text(o.quantity)} / ${text(o.filledQuantity)}`}
            />
            <KeyValue label="Protection state" value={o.protectionState} />
          </Card>
        ))}
      {!live && control.mode === "PAPER_AUTONOMOUS" && (
        <Card>
          <Text style={styles.heading}>Paper order limit</Text>
          <Text style={styles.subtitle}>
            Pause first. Saving revalidates the full policy on the server and
            requires deliberate resumption.
          </Text>
          <Input
            accessibilityLabel="Paper maximum order value"
            keyboardType="decimal-pad"
            placeholder={text(policy.maxOrderNotional, "Maximum order value")}
            value={limit}
            onChangeText={setLimit}
          />
          <Button
            label="Save paper limit"
            secondary
            busy={busy === "settings"}
            disabled={
              !owner ||
              !online ||
              !limit ||
              !!busy ||
              control.status === "ACTIVE"
            }
            onPress={() => void settings()}
          />
        </Card>
      )}
      <Section title="Execution history" />
      {events.slice(0, 25).map((e, i) => (
        <Card key={text(e.id, String(i))}>
          <Badge
            label={text(e.eventType)}
            tone={
              ["CRITICAL", "HIGH"].includes(text(e.severity))
                ? "negative"
                : "neutral"
            }
          />
          <Text style={styles.body}>{text(e.message)}</Text>
          <Freshness
            at={e.createdAt}
            maxAge={Number.MAX_SAFE_INTEGER}
            label="Recorded"
          />
        </Card>
      ))}
      <Section title="Live readiness" />
      <Card>
        <Badge
          label={
            execution.data?.deploymentLiveEnabled === true
              ? "DEPLOYMENT LIVE GATE ENABLED"
              : execution.data?.deploymentLiveEnabled === false
                ? "DEPLOYMENT LIVE GATE DISABLED"
                : "DEPLOYMENT GATE UNVERIFIED"
          }
          tone="warning"
        />
        <Text style={styles.subtitle}>
          Live execution requires exact account acceptance, fresh
          reconciliation, approved risk policy and signed operator activation.
          Android cannot replace those checks. No live activation is exposed
          here.
        </Text>
        <KeyValue
          label="Activation required"
          value={
            execution.data?.activationRequired === true
              ? "Yes"
              : "Review authoritative server state"
          }
        />
      </Card>
    </Screen>
  );
}
