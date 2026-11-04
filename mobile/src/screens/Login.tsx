import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { ShieldCheck, TrendingUp } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Button, Input, ErrorNotice, styles } from "../components/ui";
import { api, configurationError, useSession } from "../auth/session";
import { colors as c, font } from "../theme";
export default function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const online = useSession((s) => s.online);
  async function login() {
    setBusy(true);
    setError(null);
    try {
      const user = await api.login(email.trim(), password);
      setPassword("");
      useSession.getState().setUser(user);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "center", padding: 26, gap: 28 }}
      >
        <View style={{ gap: 18 }}>
          <View
            style={{
              height: 54,
              width: 54,
              borderRadius: 17,
              backgroundColor: "#122C23",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TrendingUp color={c.emerald} size={31} />
          </View>
          <Text style={[styles.label, { color: c.emerald }]}>
            QUANT’S TRADE
          </Text>
          <Text
            style={{
              fontFamily: font.display,
              fontSize: 43,
              lineHeight: 49,
              letterSpacing: -1.7,
              color: c.text,
            }}
          >
            Your capital.{"\n"}A clearer edge.
          </Text>
          <Text style={styles.subtitle}>
            Research, portfolio intelligence and disciplined automation.
            Connected to your existing workspace.
          </Text>
        </View>
        <Card>
          <Input
            accessibilityLabel="Email"
            placeholder="Email address"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            accessibilityLabel="Password"
            placeholder="Password"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void login()}
          />
          <ErrorNotice
            error={configurationError ? new Error(configurationError) : error}
          />
          <Button
            label="Sign in to your workspace"
            busy={busy}
            disabled={
              !online || !email.trim() || !password || !!configurationError
            }
            onPress={() => void login()}
          />
        </Card>
        <View style={[styles.row, { justifyContent: "center" }]}>
          <ShieldCheck color={c.muted} size={16} />
          <Text style={styles.small}>
            Secure device session · encrypted credential storage
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
