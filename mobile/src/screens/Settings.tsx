import { useState } from "react";
import { Alert, Platform, Switch, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import {
  Screen,
  Card,
  Button,
  Badge,
  Section,
  LinkRow,
  styles,
  ErrorNotice,
  KeyValue,
} from "../components/ui";
import { api, useSession } from "../auth/session";
import { useResource, queryClient } from "../api/query";
import {
  categories,
  registerPush,
  unregisterPush,
} from "../hooks/notifications";
import { rows, text, object } from "../utils/data";
import { colors as c } from "../theme";
export default function Settings() {
  const { user, biometric, online, setBiometric } = useSession();
  const sessions = useResource("/api/auth/mobile/sessions");
  const devices = useResource("/api/mobile/devices");
  const deliveries = useResource("/api/mobile/deliveries", 30000);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState<unknown>(null),
    [preferences, setPreferences] = useState<Record<string, boolean>>({});
  async function toggleBiometric(value: boolean) {
    try {
      if (Platform.OS === "web")
        throw Error("Device unlock is supported in the native app.");
      if (value) {
        if (
          !(await LocalAuthentication.hasHardwareAsync()) ||
          !(await LocalAuthentication.isEnrolledAsync())
        )
          throw Error("Set up device biometrics first.");
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Protect your workspace",
        });
        if (!result.success) return;
      }
      await SecureStore.setItemAsync("quant.biometric", String(value));
      setBiometric(value);
    } catch (e) {
      setError(e);
    }
  }
  async function push() {
    setBusy("push");
    try {
      const result = await registerPush(preferences);
      await devices.refetch();
      Alert.alert(
        "Device registered",
        result.pushConfigured === true
          ? "Server push is enabled. Delivery still requires valid Expo/FCM credentials."
          : "Server push delivery is disabled. Your device registration is saved.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function revoke(id: string) {
    setBusy(id);
    try {
      await api.request(`/api/auth/mobile/sessions/${id}`, undefined, "DELETE");
      if (sessions.data?.currentSessionId === id) {
        await api.forgetLocally();
        queryClient.clear();
      } else await sessions.refetch();
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }
  async function logout() {
    setBusy("logout");
    try {
      await unregisterPush();
      await api.logout();
      queryClient.clear();
    } catch (e) {
      setError(e);
      Alert.alert(
        "Server revocation not confirmed",
        "Retry when online, or clear this phone and revoke its session later from another device.",
        [
          { text: "Keep session", style: "cancel" },
          {
            text: "Clear this device only",
            style: "destructive",
            onPress: () => {
              void api.forgetLocally();
              queryClient.clear();
            },
          },
        ],
      );
    } finally {
      setBusy("");
    }
  }
  const savedPreferences = object(
    rows(devices.data, ["devices"])[0]?.preferences,
  );
  return (
    <Screen
      title="Your workspace"
      subtitle="Account, device security and notifications."
    >
      <Card>
        <Text style={styles.heading}>{user?.name}</Text>
        <Text style={styles.subtitle}>{user?.email}</Text>
        <Badge label={user?.role || "USER"} />
        <KeyValue label="Verification" value={user?.verificationStatus} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.body}>Biometric app unlock</Text>
            <Text style={styles.small}>
              Lock when the app leaves the foreground.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Biometric app unlock"
            value={biometric}
            onValueChange={(value) => void toggleBiometric(value)}
            trackColor={{ true: c.emerald }}
          />
        </View>
      </Card>
      <ErrorNotice error={error} />
      <Section title="Push notifications" />
      <Card>
        <Badge
          label={
            devices.data?.pushConfigured === true
              ? "SERVER PUSH ENABLED"
              : "SERVER PUSH UNVERIFIED / DISABLED"
          }
        />
        {categories.map((category) => (
          <View style={styles.row} key={category}>
            <Text style={styles.body}>
              {category.charAt(0) + category.slice(1).toLowerCase()}
            </Text>
            <Switch
              accessibilityLabel={`${category} notifications`}
              value={
                preferences[category] ?? savedPreferences[category] !== false
              }
              onValueChange={(value) =>
                setPreferences((old) => ({ ...old, [category]: value }))
              }
              trackColor={{ true: c.emerald }}
            />
          </View>
        ))}
        <Button
          label="Enable / save device notifications"
          busy={busy === "push"}
          disabled={!online || !!busy}
          onPress={() => void push()}
        />
        <Text style={styles.small}>
          Messages contain generic notices. Open the authenticated app for
          financial details.
        </Text>
      </Card>
      <Section title="Push delivery status" />
      {rows(deliveries.data, ["deliveries"])
        .slice(0, 10)
        .map((delivery, i) => (
          <Card key={text(delivery.id, String(i))}>
            <KeyValue label={text(delivery.category)} value={delivery.status} />
            <Text style={styles.small}>
              A provider receipt does not prove that the phone displayed a
              message.
            </Text>
          </Card>
        ))}
      <Section title="Device sessions" />
      {rows(sessions.data, ["sessions"]).map((session, i) => (
        <Card key={text(session.id, String(i))}>
          <Badge
            label={
              session.id === sessions.data?.currentSessionId
                ? "THIS DEVICE"
                : "ACTIVE SESSION"
            }
          />
          <Text style={styles.subtitle}>
            {text(session.userAgent, "Device session")}
          </Text>
          <KeyValue label="Expires" value={session.expiresAt} />
          <Button
            secondary
            label="Revoke session"
            disabled={!online || !!busy}
            busy={busy === session.id}
            onPress={() =>
              Alert.alert(
                "Revoke this session?",
                "The server invalidates its native credentials.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Revoke",
                    style: "destructive",
                    onPress: () => void revoke(text(session.id)),
                  },
                ],
              )
            }
          />
        </Card>
      ))}
      <ErrorNotice error={sessions.error || devices.error} />
      <Card>
        <LinkRow
          title="AI memory"
          detail="Historical context and preferences"
          to="/memory"
        />
        <LinkRow
          title="Automation & live readiness"
          detail="Authoritative gates and reconciliation"
          to="/automation"
        />
      </Card>
      <Button
        label="Sign out & revoke session"
        danger
        busy={busy === "logout"}
        onPress={() => void logout()}
      />
    </Screen>
  );
}
