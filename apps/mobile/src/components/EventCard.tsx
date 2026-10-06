/**
 * Catalyst feed card (spec §4.1): company + ticker, event-type label,
 * drug/indication/phase, event timestamp, one-line fact, summary,
 * catalyst label, source count, and market reaction.
 *
 * The fact/summary pair is deduped (see lib/text) because ingested events
 * often repeat the fact as the summary's opening sentence. Long summaries
 * get an inline "Read more" toggle so users can read the full text without
 * leaving the feed.
 */
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { eventTypeLabel, type EventCard as EventCardT } from "@biocatalyst/types";
import { colors, fontSize, radius, spacing } from "../theme";
import { formatDate, formatPct } from "../lib/format";
import { dedupeEventText } from "../lib/text";

/** Summaries longer than this get the inline Read more / Show less toggle. */
const READ_MORE_THRESHOLD = 180;

export function EventCard({
  event,
  onPress,
}: {
  event: EventCardT;
  onPress: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { fact, summary } = useMemo(
    () => dedupeEventText(event.fact ?? "", event.summary ?? ""),
    [event.fact, event.summary],
  );
  const canExpand = summary.length > READ_MORE_THRESHOLD;

  const mr = event.marketReaction;
  const mrText =
    mr && mr.pctChange !== null && mr.pctChange !== undefined
      ? formatPct(mr.pctChange)
      : null;
  const mrPositive = mr?.pctChange !== null && mr?.pctChange !== undefined && mr.pctChange > 0;
  const mrNegative = mr?.pctChange !== null && mr?.pctChange !== undefined && mr.pctChange < 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={event.headline}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <Text style={styles.typeLabel}>{eventTypeLabel(event.eventType)}</Text>
        <Text style={styles.date}>{formatDate(event.occurredAt)}</Text>
      </View>
      <Text style={styles.headline}>{event.headline}</Text>
      <Text style={styles.meta} numberOfLines={1}>
        {[
          event.company ? `${event.company.name} (${event.company.ticker})` : null,
          event.drug?.name,
          event.indication,
          event.trial?.phase,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {fact && <Text style={styles.fact}>{fact}</Text>}
      {summary ? (
        <>
          <Text style={styles.summary} numberOfLines={expanded ? undefined : 3}>
            {summary}
          </Text>
          {canExpand && (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Show less" : "Read more"}
              hitSlop={8}
            >
              <Text style={styles.readMore}>{expanded ? "Show less" : "Read more"}</Text>
            </Pressable>
          )}
        </>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.catalyst} numberOfLines={1}>
          {event.catalystSummary}
        </Text>
        <View style={styles.footerRow}>
          <Text style={styles.sources}>
            {event.sources.length} source{event.sources.length === 1 ? "" : "s"}
            {event.sources.some((s) => s.isPrimary) ? " · primary" : ""}
          </Text>
          {mrText && (
            <Text style={[styles.mr, mrPositive && styles.mrUp, mrNegative && styles.mrDown]}>
              {mrText}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  typeLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  date: { fontSize: fontSize.xs, color: colors.muted },
  headline: { fontSize: fontSize.lg, fontWeight: "700", color: colors.navy, marginTop: spacing.sm },
  meta: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs },
  fact: { fontSize: fontSize.md, color: colors.ink, marginTop: spacing.sm, fontWeight: "600" },
  summary: { fontSize: fontSize.md, color: colors.ink, marginTop: spacing.xs, lineHeight: 21 },
  readMore: {
    fontSize: fontSize.sm,
    color: colors.teal,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  footer: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm },
  catalyst: { fontSize: fontSize.sm, color: colors.muted, fontStyle: "italic" },
  footerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  sources: { fontSize: fontSize.xs, color: colors.muted },
  mr: { fontSize: fontSize.sm, fontWeight: "700", color: colors.muted },
  mrUp: { color: colors.green },
  mrDown: { color: colors.red },
});
