/**
 * Event Detail (spec §4.2): structured headline, fact box, 80–150 word
 * summary, "Why this matters", market reaction with exact window +
 * provider, sources with provenance, confidence + report-an-issue.
 */
import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { eventTypeLabel } from "@biocatalyst/types";
import { getApiClient } from "../api";
import type { RootStackParamList } from "../navigation/types";
import { Card, EmptyView, ErrorView, LoadingView, Screen, SectionTitle } from "../components/Ui";
import { useApiCall } from "../hooks/useApiCall";
import { colors, fontSize, spacing } from "../theme";
import { formatDate, formatPct } from "../lib/format";

type Props = NativeStackScreenProps<RootStackParamList, "EventDetail">;

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export function EventDetailScreen({ route }: Props) {
  const { eventId } = route.params;
  const { data: event, loading, error, retry } = useApiCall(
    () => getApiClient().getEvent(eventId),
    eventId,
  );

  if (loading)
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  if (error)
    return (
      <Screen>
        <ErrorView message={error.message} onRetry={retry} />
      </Screen>
    );
  if (!event)
    return (
      <Screen>
        <EmptyView message="Event not found." />
      </Screen>
    );

  const mr = event.marketReaction;

  return (
    <Screen>
      <ScrollView>
        <Text style={styles.kicker}>{eventTypeLabel(event.eventType)}</Text>
        <Text style={styles.headline}>{event.headline}</Text>
        <Text style={styles.date}>{formatDate(event.occurredAt)}</Text>

        <SectionTitle>Fact box</SectionTitle>
        <Card>
          <FactRow label="Event type" value={eventTypeLabel(event.eventType)} />
          <FactRow label="Date" value={formatDate(event.occurredAt)} />
          {event.indication && <FactRow label="Indication" value={event.indication} />}
          {event.phase && <FactRow label="Phase" value={event.phase} />}
          {event.outcome && event.outcome !== "unknown" && (
            <FactRow label="Outcome" value={event.outcome.replace(/_/g, " ")} />
          )}
          <FactRow label="Fact" value={event.fact} />
        </Card>

        <SectionTitle>Summary</SectionTitle>
        <Card>
          <Text style={styles.body}>{event.summary}</Text>
        </Card>

        <SectionTitle>Why this matters</SectionTitle>
        <Card>
          <Text style={styles.body}>{event.catalystSummary}</Text>
          <Text style={styles.disclaimer}>
            Neutral catalyst context — not investment advice.
          </Text>
        </Card>

        {mr && (
          <>
            <SectionTitle>Market reaction</SectionTitle>
            <Card>
              <FactRow label="Window" value={mr.windowDefinition} />
              <FactRow label="Security" value={`${mr.securityTicker} (${mr.exchange})`} />
              <FactRow label="Provider" value={mr.provider} />
              <FactRow
                label="Move"
                value={`${mr.priceBefore ?? "—"} → ${mr.priceAfter ?? "—"} (${formatPct(mr.pctChange)})`}
              />
              {mr.benchmarkName && (
                <FactRow
                  label="Benchmark"
                  value={`${mr.benchmarkName} (${formatPct(mr.benchmarkPctChange)})`}
                />
              )}
              {mr.licenseMetadata && <FactRow label="License" value={mr.licenseMetadata} />}
            </Card>
          </>
        )}

        <SectionTitle>Sources ({event.sources.length})</SectionTitle>
        {event.sources.map((s) => (
          <Card key={s.id}>
            <Pressable onPress={() => Linking.openURL(s.url)} accessibilityRole="link">
              <Text style={styles.link}>{s.title}</Text>
            </Pressable>
            <Text style={styles.muted}>
              {s.publisher} · published {formatDate(s.publishedAt)} · retrieved{" "}
              {formatDate(s.retrievedAt)}
              {s.isPrimary ? " · primary source" : ""}
            </Text>
          </Card>
        ))}

        <SectionTitle>Data quality</SectionTitle>
        <Card>
          <Text style={styles.body}>
            Extraction confidence: {Math.round(event.confidence * 100)}%
          </Text>
          <Text style={styles.muted}>
            Spotted an error? Report it from the web app's event page — every
            correction is reviewed by the curation team.
          </Text>
        </Card>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  headline: {
    fontSize: fontSize.title,
    fontWeight: "700",
    color: colors.navy,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  date: { fontSize: fontSize.sm, color: colors.muted, marginHorizontal: spacing.lg, marginTop: spacing.xs },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs, lineHeight: 20 },
  disclaimer: { fontSize: fontSize.sm, color: colors.muted, fontStyle: "italic", marginTop: spacing.sm },
  factRow: { flexDirection: "row", paddingVertical: spacing.xs },
  factLabel: { width: 110, fontSize: fontSize.sm, fontWeight: "700", color: colors.muted },
  factValue: { flex: 1, fontSize: fontSize.sm, color: colors.ink },
  link: { fontSize: fontSize.md, color: colors.teal, fontWeight: "600" },
});
