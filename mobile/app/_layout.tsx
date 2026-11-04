import "react-native-gesture-handler";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
  Text,
  View,
} from "react-native";
import { Stack, router, type Href } from "expo-router";
import {
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import * as LocalAuthentication from "expo-local-authentication";
import * as Notifications from "expo-notifications";
import { api, restoreSession, useSession } from "../src/auth/session";
import { queryClient } from "../src/api/query";
import { safeNotificationPath } from "../src/utils/data";
import { colors as c } from "../src/theme";
import { Button, styles } from "../src/components/ui";
import Login from "../src/screens/Login";
import type { User } from "../src/api/client";
if (Platform.OS !== "web")
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
function Runtime() {
  const { user, ready, locked, setLocked, setOnline } = useSession();
  const userId = user?.id;
  useEffect(() => {
    void restoreSession();
    const network = NetInfo.addEventListener((state) => {
      const online =
        state.isConnected === true && state.isInternetReachable !== false;
      setOnline(online);
      onlineManager.setOnline(online);
    });
    const lifecycle = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
      if (state !== "active" && useSession.getState().biometric)
        setLocked(true);
      if (state === "active" && !useSession.getState().locked)
        void queryClient.invalidateQueries();
    });
    return () => {
      network();
      lifecycle.remove();
    };
  }, [setLocked, setOnline]);
  useEffect(() => {
    if (!userId) {
      queryClient.clear();
      return;
    }
    if (locked) return;
    void api
      .request<{ user: User }>("/api/auth/me")
      .then(({ user: current }) => {
        useSession.getState().setUser(current);
      })
      .catch(() => {});
  }, [userId, locked]);
  useEffect(() => {
    if (Platform.OS === "web" || !userId || locked) return;
    const handle = (response: Notifications.NotificationResponse | null) => {
      const path = safeNotificationPath(
        response?.notification.request.content.data,
      );
      if (path) {
        router.push(path as Href);
        void Notifications.clearLastNotificationResponseAsync();
      }
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync().then(handle);
    return () => subscription.remove();
  }, [userId, locked]);
  if (!ready)
    return (
      <View style={[styles.screen, { justifyContent: "center" }]}>
        <ActivityIndicator color={c.emerald} />
      </View>
    );
  if (!user) return <Login />;
  if (user.verificationStatus !== "VERIFIED")
    return (
      <View
        style={[
          styles.screen,
          { padding: 28, justifyContent: "center", gap: 20 },
        ]}
      >
        <Text style={styles.title}>Workspace verification</Text>
        <Text style={styles.subtitle}>
          Account status: {user.verificationStatus.replace(/_/g, " ")}. An
          authorized operator must verify access.
        </Text>
        <Button
          label="Refresh access"
          onPress={() => {
            void api
              .request<{ user: User }>("/api/auth/me")
              .then((r) => useSession.getState().setUser(r.user))
              .catch(() =>
                Alert.alert("Access check unavailable", "Reconnect and retry."),
              );
          }}
        />
        <Button
          secondary
          label="Sign out"
          onPress={() => {
            void api
              .logout()
              .catch(() =>
                Alert.alert(
                  "Sign-out not confirmed",
                  "Reconnect to revoke this session.",
                ),
              );
          }}
        />
      </View>
    );
  if (locked)
    return (
      <View
        style={[
          styles.screen,
          { padding: 28, justifyContent: "center", gap: 20 },
        ]}
      >
        <Text style={styles.title}>Your workspace is locked.</Text>
        <Text style={styles.subtitle}>
          Authenticate on this device to view financial data.
        </Text>
        <Button
          label="Unlock workspace"
          onPress={() => {
            void LocalAuthentication.authenticateAsync({
              promptMessage: "Unlock Quant’s Trade",
            })
              .then((result) => {
                if (result.success) {
                  setLocked(false);
                  void queryClient.invalidateQueries();
                }
              })
              .catch(() =>
                Alert.alert(
                  "Unlock unavailable",
                  "Check device authentication settings and retry.",
                ),
              );
          }}
        />
        <Button
          secondary
          label="Sign out"
          onPress={() => {
            void api
              .logout()
              .catch(() =>
                Alert.alert(
                  "Sign-out not confirmed",
                  "Reconnect to revoke this session.",
                ),
              );
          }}
        />
      </View>
    );
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        animation: "slide_from_right",
      }}
    />
  );
}
export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Runtime />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
