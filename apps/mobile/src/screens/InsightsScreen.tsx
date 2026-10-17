import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { eventTypeLabel, type EventType, type InsightsResponse } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import { Card, EmptyView, ErrorView, LoadingView, Screen, SectionTitle } from "../components/Ui";
import { useApiCall } from "../hooks/useApiCall";
import type { RootStackParamList } from "../navigation/types";
import { colors, fontSize, spacing } from "../theme";
import { formatDate } from "../lib/format";

type Props = NativeStackScreenProps<RootStackParamList, "Insights">;

const PHASE_COLORS = [colors.teal, colors.navy2, colors.amber, colors.green, colors.red, colors.muted];

function SignalGrid({ signals }: { signals: InsightsResponse["regulatorySignals"] }) {
  const items = [
    { label: "Approvals", value: signals.approvals, color: colors.green, background: colors.greenSoft },
    { label: "Safety", value: signals.safety, color: colors.red, background: colors.redSoft },
    { label: "Manufacturing", value: signals.manufacturing, color: colors.amber, background: colors.amberSoft },
    { label: "Shortages", value: signals.shortages, color: colors.teal, background: colors.tealSoft },
  ];
  return (
    <View style={styles.signalGrid} accessibilityRole="summary">
      {items.map((item) => (
        <View key={item.label} style={[styles.signal, { backgroundColor: item.background }]}>
          <Text style={[styles.signalValue, { color: item.color }]}>{item.value}</Text>
          <Text style={styles.signalLabel}>{item.label}</Text>
          <Text style={styles.signalPeriod}>past 180 days</Text>
        </View>
      ))}
    </View>
  );
}

function ActivityBars({ items }: { items: InsightsResponse["activity"] }) {
  const top = items.slice(0, 7);
  const max = Math.max(...top.map((item) => item.count), 1);
  return (
    <Card>
      {top.map((item) => (
        <View key={item.eventType} style={styles.barRow} accessibilityLabel={`${eventTypeLabel(item.eventType)}: ${item.count}`}>
          <View style={styles.barLabelRow}>
            <Text style={styles.barLabel} numberOfLines={1}>{eventTypeLabel(item.eventType as EventType)}</Text>
            <Text style={styles.barValue}>{item.count}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${Math.max((item.count / max) * 100, 3)}%` }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

function PipelineBand({ items }: { items: InsightsResponse["pipeline"] }) {
  const known = items.filter((item) => item.count > 0);
  const total = known.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return null;
  return (
    <Card>
      <View style={styles.pipelineBand} accessibilityLabel={`Trial pipeline with ${total} trials`}>
        {known.map((item, index) => (
          <View
            key={item.phase}
            style={{ flex: item.count, backgroundColor: PHASE_COLORS[index % PHASE_COLORS.length] }}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {known.map((item, index) => (
          <View key={item.phase} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PHASE_COLORS[index % PHASE_COLORS.length] }]} />
            <Text style={styles.legendText}>{item.phase} · {item.count}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function PatentCliff({ items }: { items: InsightsResponse["patentCliff"] }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <Card>
      <View style={styles.columnChart} accessibilityLabel="Upcoming Orange Book patent expiries by year">
        {items.map((item) => (
          <View key={item.year} style={styles.columnItem}>
            <Text style={styles.columnValue}>{item.count}</Text>
            <View style={styles.columnTrack}>
              <View style={[styles.column, { height: `${Math.max((item.count / max) * 100, 6)}%` }]} />
            </View>
            <Text style={styles.columnLabel}>{item.year}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>Active FDA Orange Book listings in the next six years</Text>
    </Card>
  );
}

export function InsightsScreen({ navigation }: Props) {
  const insights = useApiCall(() => getApiClient().getInsights(), "insights");
  if (insights.loading) return <Screen><LoadingView label="Building intelligence map…" /></Screen>;
  if (insights.error) return <Screen><ErrorView message={insights.error.message} onRetry={insights.retry} /></Screen>;
  if (!insights.data) return <Screen><EmptyView message="No intelligence data available yet." /></Screen>;
  const data = insights.data;

  return (
    <Screen>
      <ScrollView>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>BIOPHARMA SIGNAL MAP</Text>
          <Text style={styles.heroTitle}>What is moving, what is coming next</Text>
          <Text style={styles.heroText}>A six-month view across catalysts, regulation, trials and patent cliffs.</Text>
        </View>

        <SectionTitle>Regulatory pulse</SectionTitle>
        <SignalGrid signals={data.regulatorySignals} />

        <SectionTitle>Catalyst activity</SectionTitle>
        <ActivityBars items={data.activity} />

        <SectionTitle>Trial pipeline</SectionTitle>
        <PipelineBand items={data.pipeline} />

        <SectionTitle>Patent cliff</SectionTitle>
        <PatentCliff items={data.patentCliff} />

        <SectionTitle>Upcoming milestones</SectionTitle>
        {data.upcoming.length === 0 ? (
          <Text style={styles.empty}>No dated milestones in the next 18 months.</Text>
        ) : (
          <View style={styles.timeline}>
            {data.upcoming.map((item, index) => (
              <Pressable
                key={`${item.kind}-${item.date}-${item.title}`}
                disabled={!item.company}
                onPress={() => item.company && navigation.navigate("Company", { slug: item.company.slug })}
                style={styles.timelineRow}
              >
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, item.kind === "patent" && styles.timelineDotPatent]} />
                  {index < data.upcoming.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeader}>
                    <Text style={styles.timelineKind}>{item.kind === "trial" ? "TRIAL" : "PATENT"}</Text>
                    <Text style={styles.timelineDate}>{formatDate(item.date)}</Text>
                  </View>
                  <Text style={styles.timelineTitle}>{item.title}</Text>
                  <Text style={styles.timelineDetail}>{item.detail}</Text>
                  {item.company && <Text style={styles.timelineCompany}>{item.company.canonicalName} ›</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={styles.footnote}>Research intelligence only · verify milestones with the linked primary source</Text>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.navy, margin: spacing.lg, padding: spacing.lg, borderRadius: 18 },
  eyebrow: { fontSize: fontSize.xs, color: colors.tealBright, fontWeight: "700", letterSpacing: 1 },
  heroTitle: { fontSize: fontSize.title, color: colors.white, fontWeight: "700", marginTop: spacing.xs },
  heroText: { fontSize: fontSize.sm, color: colors.navyText, marginTop: spacing.sm, lineHeight: 19 },
  signalGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: spacing.lg, gap: spacing.sm },
  signal: { width: "48%", flexGrow: 1, borderRadius: 14, padding: spacing.md },
  signalValue: { fontSize: 28, fontWeight: "700" },
  signalLabel: { fontSize: fontSize.sm, fontWeight: "700", color: colors.ink, marginTop: 2 },
  signalPeriod: { fontSize: 10, color: colors.muted, marginTop: 2 },
  barRow: { marginBottom: spacing.md },
  barLabelRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  barLabel: { flex: 1, fontSize: fontSize.sm, color: colors.ink },
  barValue: { fontSize: fontSize.sm, color: colors.navy, fontWeight: "700" },
  track: { height: 7, borderRadius: 4, backgroundColor: colors.bg, overflow: "hidden", marginTop: spacing.xs },
  bar: { height: "100%", borderRadius: 4, backgroundColor: colors.teal },
  pipelineBand: { height: 22, borderRadius: 11, overflow: "hidden", flexDirection: "row" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: fontSize.xs, color: colors.muted },
  columnChart: { height: 156, flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  columnItem: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end" },
  columnValue: { fontSize: fontSize.xs, color: colors.navy, fontWeight: "700", marginBottom: 3 },
  columnTrack: { flex: 1, width: "68%", justifyContent: "flex-end", backgroundColor: colors.bg, borderRadius: 6, overflow: "hidden" },
  column: { width: "100%", backgroundColor: colors.amber, borderRadius: 6 },
  columnLabel: { fontSize: 10, color: colors.muted, marginTop: 4 },
  caption: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.sm, textAlign: "center" },
  timeline: { marginHorizontal: spacing.lg },
  timelineRow: { flexDirection: "row", minHeight: 92 },
  timelineRail: { width: 24, alignItems: "center" },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.teal, marginTop: 5 },
  timelineDotPatent: { backgroundColor: colors.amber },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.line, marginVertical: 3 },
  timelineContent: { flex: 1, paddingBottom: spacing.lg },
  timelineHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  timelineKind: { fontSize: 10, color: colors.teal, fontWeight: "700", letterSpacing: 0.7 },
  timelineDate: { fontSize: fontSize.xs, color: colors.muted },
  timelineTitle: { fontSize: fontSize.sm, color: colors.ink, fontWeight: "700", marginTop: 3 },
  timelineDetail: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  timelineCompany: { fontSize: fontSize.xs, color: colors.teal, fontWeight: "700", marginTop: 4 },
  empty: { fontSize: fontSize.sm, color: colors.muted, marginHorizontal: spacing.lg },
  footnote: { fontSize: 10, color: colors.muted, marginHorizontal: spacing.lg, marginTop: spacing.sm, fontStyle: "italic" },
});
