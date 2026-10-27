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
import { Ionicons } from "@expo/vector-icons";
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
        <View style={styles.typePill}>
          <Text style={styles.typeLabel}>{eventTypeLabel(event.eventType)}</Text>
        </View>
        <Text style={styles.date}>{formatDate(event.occurredAt)}</Text>
      </View>
      <Text style={styles.headline}>{event.headline}</Text>
      <View style={styles.metaRow}>
        {event.company?.ticker ? <Text style={styles.ticker}>{event.company.ticker}</Text> : null}
        <Text style={styles.meta} numberOfLines={1}>
          {[
          event.company?.name,
          event.drug?.name,
          event.indication,
          event.trial?.phase,
        ]
          .filter(Boolean)
          .join(" · ")}
        </Text>
      </View>
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
        {event.catalystSummary ? (
          <View style={styles.catalystRow}>
            <Ionicons name="flash-outline" size={14} color={colors.amber} />
            <Text style={styles.catalyst} numberOfLines={1}>{event.catalystSummary}</Text>
          </View>
        ) : null}
        <View style={styles.footerRow}>
          <View style={styles.sourceRow}>
            <Ionicons name="document-text-outline" size={13} color={colors.muted} />
            <Text style={styles.sources}>
              {event.sources.length} source{event.sources.length === 1 ? "" : "s"}
              {event.sources.some((s) => s.isPrimary) ? " · primary" : ""}
            </Text>
          </View>
          {mrText && (
            <View style={[styles.marketPill, mrPositive && styles.marketUp, mrNegative && styles.marketDown]}>
              <Ionicons name={mrPositive ? "arrow-up" : mrNegative ? "arrow-down" : "remove"} size={12} color={mrPositive ? colors.green : mrNegative ? colors.red : colors.muted} />
              <Text style={[styles.mr, mrPositive && styles.mrUp, mrNegative && styles.mrDown]}>{mrText}</Text>
            </View>
          )}
        </View>
        <View style={styles.openRow}>
          <Text style={styles.openText}>View catalyst</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.teal} />
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
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  typePill: { backgroundColor: colors.tealSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  typeLabel: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  date: { fontSize: fontSize.xs, color: colors.muted },
  headline: { fontSize: 19, lineHeight: 25, fontWeight: "800", color: colors.navy, marginTop: spacing.md, letterSpacing: -0.35 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  ticker: { fontSize: 10, color: colors.white, fontWeight: "800", backgroundColor: colors.navy2, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5, marginRight: spacing.sm, overflow: "hidden" },
  meta: { flex: 1, fontSize: fontSize.sm, color: colors.muted },
  fact: { fontSize: fontSize.md, color: colors.ink, marginTop: spacing.sm, fontWeight: "600" },
  summary: { fontSize: fontSize.md, color: colors.ink, marginTop: spacing.xs, lineHeight: 21 },
  readMore: {
    fontSize: fontSize.sm,
    color: colors.teal,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  footer: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md },
  catalystRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  catalyst: { flex: 1, fontSize: fontSize.sm, color: colors.ink, fontWeight: "600" },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sources: { fontSize: fontSize.xs, color: colors.muted },
  marketPill: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.inputBg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  marketUp: { backgroundColor: colors.greenSoft },
  marketDown: { backgroundColor: colors.redSoft },
  mr: { fontSize: fontSize.sm, fontWeight: "700", color: colors.muted },
  mrUp: { color: colors.green },
  mrDown: { color: colors.red },
  openRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: spacing.md },
  openText: { color: colors.teal, fontSize: fontSize.sm, fontWeight: "700" },
});
