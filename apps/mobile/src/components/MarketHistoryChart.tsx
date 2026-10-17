import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import { eventTypeLabel, type PriceHistoryResponse } from "@biocatalyst/api-client";
import { colors, fontSize, spacing } from "../theme";

type RangeDays = 30 | 90 | 180 | 365;

interface Props {
  data: PriceHistoryResponse;
  range: RangeDays;
  onRangeChange: (range: RangeDays) => void;
  onEventPress: (eventId: string) => void;
}

const RANGE_OPTIONS: Array<{ label: string; value: RangeDays }> = [
  { label: "1M", value: 30 },
  { label: "3M", value: 90 },
  { label: "6M", value: 180 },
  { label: "1Y", value: 365 },
];

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

export function MarketHistoryChart({ data, range, onRangeChange, onEventPress }: Props) {
  const [width, setWidth] = useState(320);
  const bars = data.bars;
  const geometry = useMemo(() => {
    if (bars.length < 2) return null;
    const left = 44;
    const right = 10;
    const top = 14;
    const priceBottom = 154;
    const volumeTop = 172;
    const volumeBottom = 212;
    const min = Math.min(...bars.map((bar) => bar.close));
    const max = Math.max(...bars.map((bar) => bar.close));
    const padding = Math.max((max - min) * 0.12, max * 0.01, 1);
    const low = min - padding;
    const high = max + padding;
    const plotWidth = Math.max(width - left - right, 1);
    const x = (index: number) => left + (index / (bars.length - 1)) * plotWidth;
    const y = (value: number) => top + ((high - value) / (high - low)) * (priceBottom - top);
    const line = bars.map((bar, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(bar.close)}`).join(" ");
    const area = `${line} L${x(bars.length - 1)},${priceBottom} L${x(0)},${priceBottom} Z`;
    const maxVolume = Math.max(...bars.map((bar) => bar.volume ?? 0), 1);
    const eventMarks = data.events.map((event) => {
      const target = Date.parse(`${event.date}T00:00:00Z`);
      let best = 0;
      let distance = Number.POSITIVE_INFINITY;
      bars.forEach((bar, index) => {
        const next = Math.abs(Date.parse(`${bar.date}T00:00:00Z`) - target);
        if (next < distance) {
          best = index;
          distance = next;
        }
      });
      return { ...event, index: best, x: x(best), y: y(bars[best].close) };
    });
    return { left, right, top, priceBottom, volumeTop, volumeBottom, min, max, x, y, line, area, maxVolume, eventMarks };
  }, [bars, data.events, width]);

  const first = bars[0];
  const last = bars[bars.length - 1];
  const rangeChange = first && last && first.close !== 0
    ? ((last.close - first.close) / first.close) * 100
    : null;

  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.max(event.nativeEvent.layout.width, 280));

  return (
    <View onLayout={onLayout}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.ticker}>{data.ticker} · {data.exchange}</Text>
          {last && (
            <Text style={styles.latest}>
              {last.close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              {rangeChange !== null ? `  ${rangeChange >= 0 ? "+" : ""}${rangeChange.toFixed(1)}%` : ""}
            </Text>
          )}
        </View>
        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => onRangeChange(option.value)}
              style={[styles.rangeButton, range === option.value && styles.rangeActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: range === option.value }}
            >
              <Text style={[styles.rangeText, range === option.value && styles.rangeTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {geometry && (
        <Svg
          width={width}
          height={226}
          accessibilityRole="image"
          accessibilityLabel={`${data.ticker} price and volume history with ${data.events.length} catalyst markers`}
        >
          <Defs>
            <LinearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.teal} stopOpacity={0.24} />
              <Stop offset="1" stopColor={colors.teal} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          {[0, 0.5, 1].map((fraction) => {
            const y = geometry.top + fraction * (geometry.priceBottom - geometry.top);
            const value = geometry.max - fraction * (geometry.max - geometry.min);
            return (
              <React.Fragment key={fraction}>
                <Line x1={geometry.left} y1={y} x2={width - geometry.right} y2={y} stroke={colors.line} strokeWidth={1} />
                <SvgText x={0} y={y + 4} fill={colors.muted} fontSize={10}>{value.toFixed(0)}</SvgText>
              </React.Fragment>
            );
          })}
          <Path d={geometry.area} fill="url(#priceFill)" />
          <Path d={geometry.line} fill="none" stroke={colors.teal} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {bars.map((bar, index) => {
            const volume = bar.volume ?? 0;
            const height = (volume / geometry.maxVolume) * (geometry.volumeBottom - geometry.volumeTop);
            const barWidth = Math.max(1, (width - geometry.left - geometry.right) / bars.length - 1);
            return (
              <Rect
                key={bar.date}
                x={geometry.x(index) - barWidth / 2}
                y={geometry.volumeBottom - height}
                width={barWidth}
                height={height}
                fill={colors.navyText}
                opacity={0.55}
              />
            );
          })}
          {geometry.eventMarks.map((event, index) => (
            <React.Fragment key={event.id}>
              <Line
                x1={event.x}
                y1={geometry.top}
                x2={event.x}
                y2={geometry.priceBottom}
                stroke={colors.amber}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.75}
              />
              <Circle
                cx={event.x}
                cy={event.y}
                r={index === 0 ? 5 : 4}
                fill={colors.amber}
                stroke={colors.card}
                strokeWidth={2}
                onPress={() => onEventPress(event.id)}
              />
            </React.Fragment>
          ))}
          {first && <SvgText x={geometry.left} y={224} fill={colors.muted} fontSize={10}>{first.date.slice(5)}</SvgText>}
          {last && <SvgText x={width - geometry.right} y={224} textAnchor="end" fill={colors.muted} fontSize={10}>{last.date.slice(5)}</SvgText>}
          <SvgText x={geometry.left} y={169} fill={colors.muted} fontSize={10}>Volume · max {formatCompact(geometry.maxVolume)}</SvgText>
        </Svg>
      )}

      {data.events.length > 0 && (
        <View style={styles.markers}>
          <Text style={styles.markerHeading}>Catalysts on this chart</Text>
          {data.events.slice(0, 3).map((event) => (
            <Pressable key={event.id} onPress={() => onEventPress(event.id)} style={styles.markerRow}>
              <View style={styles.markerDot} />
              <View style={styles.markerText}>
                <Text style={styles.markerType}>{eventTypeLabel(event.eventType)}</Text>
                <Text style={styles.markerTitle} numberOfLines={1}>{event.headline}</Text>
              </View>
              <Text style={styles.markerDate}>{event.date.slice(5)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={styles.source}>Delayed daily data · {data.provider} · research use</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  ticker: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "700" },
  latest: { fontSize: fontSize.xl, color: colors.navy, fontWeight: "700", marginTop: 2 },
  rangeRow: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: 10, padding: 2 },
  rangeButton: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8 },
  rangeActive: { backgroundColor: colors.navy },
  rangeText: { fontSize: 11, color: colors.muted, fontWeight: "700" },
  rangeTextActive: { color: colors.white },
  markers: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: spacing.sm },
  markerHeading: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "700", marginBottom: spacing.xs },
  markerRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.xs, gap: spacing.sm },
  markerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  markerText: { flex: 1 },
  markerType: { fontSize: 10, color: colors.amber, fontWeight: "700", textTransform: "uppercase" },
  markerTitle: { fontSize: fontSize.xs, color: colors.ink },
  markerDate: { fontSize: fontSize.xs, color: colors.muted },
  source: { fontSize: 10, color: colors.muted, marginTop: spacing.sm, fontStyle: "italic" },
});
