import React, { memo, useState } from "react";
import { View, Text } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import { colors as c } from "../theme";
import { styles } from "./ui";
import { number, object } from "../utils/data";
export function chartPoints(source: unknown, field = "equity") {
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => {
      const p = object(item);
      return {
        value: number(p[field] ?? p.value ?? p.close),
        date: String(p.timestamp ?? p.date ?? ""),
      };
    })
    .filter((p): p is { value: number; date: string } => p.value !== null)
    .filter(
      (_, i, all) =>
        all.length <= 160 ||
        i % Math.ceil(all.length / 160) === 0 ||
        i === all.length - 1,
    );
}
export const FinancialChart = memo(function FinancialChart({
  data,
  field,
  height = 168,
}: {
  data: unknown;
  field?: string;
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const points = chartPoints(data, field);
  return (
    <View
      onLayout={(e) => setWidth(Math.max(0, e.nativeEvent.layout.width - 10))}
      accessibilityLabel={`${points.length} recorded chart points`}
      style={{ minHeight: height + 20 }}
    >
      {points.length > 1 && width > 0 ? (
        <LineChart
          data={points}
          width={width}
          height={height}
          adjustToWidth
          thickness={2}
          color={c.emerald}
          areaChart
          startFillColor={c.emerald}
          endFillColor={c.surface}
          startOpacity={0.16}
          endOpacity={0}
          hideDataPoints
          hideRules
          hideYAxisText
          yAxisThickness={0}
          xAxisThickness={0}
          hideAxesAndRules
          initialSpacing={0}
          endSpacing={0}
          pointerConfig={{
            pointerStripColor: c.muted,
            pointerStripWidth: 1,
            pointerColor: c.emerald,
            radius: 4,
          }}
        />
      ) : (
        <View style={{ height, justifyContent: "center" }}>
          <Text style={styles.subtitle}>
            Performance history will appear when the server records enough
            observations.
          </Text>
        </View>
      )}
    </View>
  );
});
