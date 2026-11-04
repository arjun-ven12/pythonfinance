import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  WifiOff,
} from "lucide-react-native";
import { router, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors as c, font } from "../theme";
import { refreshAll } from "../api/query";
import { useSession } from "../auth/session";
import { ago, isStale, number, text } from "../utils/data";
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  content: { padding: 22, gap: 20, paddingBottom: 36 },
  title: {
    fontFamily: font.display,
    color: c.text,
    fontSize: 30,
    letterSpacing: -1.1,
  },
  subtitle: {
    color: c.muted,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 21,
  },
  heading: {
    color: c.text,
    fontFamily: font.bold,
    fontSize: 17,
    letterSpacing: -0.4,
  },
  body: {
    color: c.text,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 23,
  },
  label: {
    color: c.muted,
    fontFamily: font.medium,
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  card: {
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    borderRadius: 22,
    padding: 19,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stack: { gap: 6 },
  metric: {
    color: c.text,
    fontFamily: font.display,
    fontSize: 38,
    letterSpacing: -1.7,
    fontVariant: ["tabular-nums"],
  },
  button: {
    minHeight: 50,
    borderRadius: 15,
    paddingHorizontal: 17,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.emerald,
  },
  buttonText: { color: c.bg, fontFamily: font.bold, fontSize: 14 },
  input: {
    backgroundColor: c.raised,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 15,
    color: c.text,
    minHeight: 52,
    padding: 15,
    fontFamily: font.regular,
    fontSize: 15,
  },
  divider: { height: 1, backgroundColor: c.border },
  small: {
    color: c.muted,
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 17,
  },
});
export function Screen({
  title,
  subtitle,
  children,
  action,
}: React.PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}>) {
  const online = useSession((s) => s.online);
  const [refreshing, setRefreshing] = useState(false);
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      {!online && (
        <View
          accessibilityRole="alert"
          style={{
            padding: 10,
            backgroundColor: "#332B1B",
            flexDirection: "row",
            gap: 8,
            justifyContent: "center",
          }}
        >
          <WifiOff size={15} color={c.amber} />
          <Text style={[styles.small, { color: c.amber }]}>
            Offline · saved view · actions unavailable
          </Text>
        </View>
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            tintColor={c.emerald}
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await refreshAll();
              } finally {
                setRefreshing(false);
              }
            }}
          />
        }
      >
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {action}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export const Card = ({
  children,
  style,
}: React.PropsWithChildren<{ style?: ViewStyle }>) => (
  <View style={[styles.card, style]}>{children}</View>
);
export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "positive" | "negative" | "warning" | "neutral";
}) {
  const color = {
    positive: c.emerald,
    negative: c.red,
    warning: c.amber,
    neutral: c.muted,
  }[tone];
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: `${color}44`,
        backgroundColor: `${color}0C`,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 5,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          color,
          fontSize: 10,
          letterSpacing: 0.8,
          fontFamily: font.bold,
        }}
      >
        {label.replace(/_/g, " ")}
      </Text>
    </View>
  );
}
export function Button({
  label,
  onPress,
  busy,
  disabled,
  danger,
  secondary,
}: {
  label: string;
  onPress(): void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: danger
            ? "#402229"
            : secondary
              ? c.raised
              : c.emerald,
          borderWidth: danger || secondary ? 1 : 0,
          borderColor: danger ? "#7C3C49" : c.border,
          opacity: disabled || busy ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {busy && (
        <ActivityIndicator
          size="small"
          color={danger ? c.red : secondary ? c.text : c.bg}
        />
      )}
      <Text
        style={[
          styles.buttonText,
          { color: danger ? c.red : secondary ? c.text : c.bg },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={c.muted}
      selectionColor={c.emerald}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}
export function Section({
  title,
  link,
  to,
}: {
  title: string;
  link?: string;
  to?: string;
}) {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {to && (
        <Pressable
          accessibilityRole="link"
          hitSlop={12}
          onPress={() => router.push(to as Href)}
        >
          <Text
            style={{ color: c.emerald, fontFamily: font.medium, fontSize: 12 }}
          >
            {link || "View all"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
export function Metric({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: unknown;
}) {
  const n = number(change);
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={{
          color: c.text,
          fontFamily: font.bold,
          fontSize: 23,
          letterSpacing: -0.8,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      {n !== null && (
        <Text
          style={{
            color: n >= 0 ? c.emerald : c.red,
            fontFamily: font.medium,
            fontSize: 12,
          }}
        >
          {n >= 0 ? "+" : ""}
          {n.toFixed(2)}%
        </Text>
      )}
    </View>
  );
}
export function LinkRow({
  title,
  detail,
  to,
  children,
}: React.PropsWithChildren<{ title: string; detail?: string; to: string }>) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(to as Href)}
      style={({ pressed }) => [
        styles.row,
        { minHeight: 56, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={styles.heading}>{title}</Text>
        {detail && <Text style={styles.subtitle}>{detail}</Text>}
      </View>
      {children}
      <ChevronRight size={17} color={c.muted} />
    </Pressable>
  );
}
export function KeyValue({
  label,
  value,
  color,
}: {
  label: string;
  value: unknown;
  color?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.subtitle, { flex: 1 }]}>{label}</Text>
      <Text
        selectable
        style={[
          styles.body,
          { textAlign: "right", flex: 1, color: color || c.text },
        ]}
      >
        {text(value)}
      </Text>
    </View>
  );
}
export function Empty({
  title = "Nothing here yet",
  detail = "Results appear after the server completes this activity.",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <Card>
      <ArrowUpRight size={22} color={c.muted} />
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.subtitle}>{detail}</Text>
    </Card>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.card, { borderColor: "#653541" }]}
    >
      <Text style={{ color: c.red, fontFamily: font.medium }}>
        {error instanceof Error ? error.message : text(error)}
      </Text>
      {retry && (
        <Pressable
          accessibilityRole="button"
          onPress={retry}
          style={styles.row}
        >
          <Text style={{ color: c.text }}>Try again</Text>
          <RefreshCw color={c.muted} size={16} />
        </Pressable>
      )}
    </View>
  );
}
export function Freshness({
  at,
  maxAge = 30000,
  label = "Updated",
}: {
  at: unknown;
  maxAge?: number;
  label?: string;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((v) => v + 1), 10000);
    return () => clearInterval(timer);
  }, []);
  void tick;
  const stale = isStale(at, maxAge);
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.small, { color: stale ? c.amber : c.muted }]}
    >
      {stale ? "STALE / UNVERIFIED · " : ""}
      {label} {ago(at)}
    </Text>
  );
}
export function Skeleton() {
  const [opacity] = useState(() => new Animated.Value(0.3));
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[styles.card, { opacity }]}
    >
      {[85, 150, 65].map((width, i) => (
        <View
          key={i}
          style={{
            width,
            height: i === 1 ? 34 : 12,
            borderRadius: 6,
            backgroundColor: c.border,
          }}
        />
      ))}
    </Animated.View>
  );
}
export function RiskBar({
  label,
  value,
  limit,
  unit = "%",
}: {
  label: string;
  value: unknown;
  limit: unknown;
  unit?: string;
}) {
  const n = number(value),
    cap = number(limit);
  const utilization = n !== null && cap !== null && cap > 0 ? n / cap : null;
  return (
    <View style={{ gap: 9 }}>
      <View style={styles.row}>
        <Text style={styles.subtitle}>{label}</Text>
        <Text style={styles.small}>
          {n === null ? "—" : n.toFixed(1)} / {cap === null ? "—" : cap}
          {unit}
        </Text>
      </View>
      <View style={{ height: 5, borderRadius: 4, backgroundColor: c.border }}>
        <View
          style={{
            height: 5,
            borderRadius: 4,
            width: `${Math.min(100, Math.max(0, (utilization || 0) * 100))}%`,
            backgroundColor:
              utilization !== null && utilization > 0.8 ? c.amber : c.emerald,
          }}
        />
      </View>
    </View>
  );
}
