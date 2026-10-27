/**
 * Catalyst feed card (spec §4.1): company + ticker, event-type label,
 * drug/indication/phase, event timestamp, one-line fact, summary,
 * catalyst label, source count, and market reaction.
 *
 * Each event type has its own color and icon (lib/categories) so a reader
 * can scan the feed by kind. The fact/summary pair is deduped (see lib/text)
 * because ingested events often repeat the fact as the summary's opening
 * sentence. Long summaries get an inline "Read more" toggle.
 *
 * Memoized: the feed re-renders on every page load, but cards only change
 * when their own event changes.
 */
import React, { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { eventTypeLabel, type EventCard as EventCardT } from "@biocatalyst/types";
import { colors, fontSize, radius, shadow, spacing } from "../theme";
import { formatPct, formatRelative } from "../lib/format";
import { dedupeEventText } from "../lib/text";
import { eventStyle } from "../lib/categories";

/** Summaries longer than this get the inline Read more / Show less toggle. */
const READ_MORE_THRESHOLD = 180;

function EventCardImpl({
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
  const cat = eventStyle(event.eventType);

  const mr = event.marketReaction;
  const pct = mr?.pctChange;
  const hasPct = pct !== null && pct !== undefined;
  const mrText = hasPct ? formatPct(pct) : null;
  const mrPositive = hasPct && pct > 0;
  const mrNegative = hasPct && pct < 0;
  const mrColor = mrPositive ? colors.green : mrNegative ? colors.red : colors.muted;
  const hasPrimary = event.sources.some((s) => s.isPrimary);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={event.headline}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.accent, { backgroundColor: cat.color }]} />
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: cat.soft }]}>
          <Ionicons name={cat.icon} size={16} color={cat.color} />
        </View>
        <Text style={[styles.typeLabel, { color: cat.color }]} numberOfLines={1}>
          {eventTypeLabel(event.eventType)}
        </Text>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={12} color={colors.placeholder} />
          <Text style={styles.date}>{formatRelative(event.occurredAt)}</Text>
        </View>
      </View>

      <Text style={styles.headline}>{event.headline}</Text>

      <View style={styles.metaRow}>
        {event.company?.ticker ? (
          <View style={styles.tickerPill}>
            <Text style={styles.ticker}>{event.company.ticker}</Text>
          </View>
        ) : null}
        <Text style={styles.meta} numberOfLines={1}>
          {[event.company?.name, event.drug?.name, event.indication, event.trial?.phase]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>

      {fact ? (
        <View style={[styles.factBox, { borderLeftColor: cat.color, backgroundColor: cat.soft }]}>
          <Text style={styles.fact}>{fact}</Text>
        </View>
      ) : null}

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
              style={styles.readMoreRow}
            >
              <Text style={styles.readMore}>{expanded ? "Show less" : "Read more"}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.teal} />
            </Pressable>
          )}
        </>
      ) : null}

      {event.catalystSummary ? (
        <View style={styles.catalystRow}>
          <View style={styles.catalystIcon}>
            <Ionicons name="flash" size={12} color={colors.amberBright} />
          </View>
          <Text style={styles.catalyst} numberOfLines={2}>{event.catalystSummary}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.sourceRow}>
          <Ionicons
            name={hasPrimary ? "shield-checkmark" : "document-text-outline"}
            size={13}
            color={hasPrimary ? colors.green : colors.muted}
          />
          <Text style={styles.sources}>
            {event.sources.length} source{event.sources.length === 1 ? "" : "s"}
            {hasPrimary ? " · primary" : ""}
          </Text>
        </View>
        {mrText && (
          <View style={[styles.marketPill, mrPositive && styles.marketUp, mrNegative && styles.marketDown]}>
            <Ionicons name={mrPositive ? "caret-up" : mrNegative ? "caret-down" : "remove"} size={12} color={mrColor} />
            <Text style={[styles.mr, { color: mrColor }]}>{mrText}</Text>
          </View>
        )}
        <View style={styles.openRow}>
          <Text style={styles.openText}>Details</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.teal} />
        </View>
      </View>
    </Pressable>
  );
}

export const EventCard = memo(
  EventCardImpl,
  (a, b) => a.event === b.event || (a.event.id === b.event.id && a.event.headline === b.event.headline),
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    paddingLeft: spacing.lg + 4,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    overflow: "hidden",
    ...shadow,
  },
  accent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  typeLabel: { flex: 1, fontSize: fontSize.xs, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  date: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  headline: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    color: colors.navy,
    marginTop: spacing.md,
    letterSpacing: -0.3,
  },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  tickerPill: { backgroundColor: colors.navy2, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginRight: spacing.sm },
  ticker: { fontSize: 10, color: colors.white, fontWeight: "800", letterSpacing: 0.4 },
  meta: { flex: 1, fontSize: fontSize.sm, color: colors.muted, fontWeight: "500" },
  factBox: { marginTop: spacing.md, borderLeftWidth: 3, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10 },
  fact: { fontSize: fontSize.md, color: colors.ink, fontWeight: "700", lineHeight: 21 },
  summary: { fontSize: fontSize.md, color: colors.ink2, marginTop: spacing.sm, lineHeight: 22 },
  readMoreRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: spacing.xs },
  readMore: { fontSize: fontSize.sm, color: colors.teal, fontWeight: "800" },
  catalystRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.amberSoft,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  catalystIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  catalyst: { flex: 1, fontSize: fontSize.sm, color: colors.ink, fontWeight: "700", lineHeight: 18 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sources: { fontSize: fontSize.xs, color: colors.muted, fontWeight: "600" },
  marketPill: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: colors.inputBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  marketUp: { backgroundColor: colors.greenSoft },
  marketDown: { backgroundColor: colors.redSoft },
  mr: { fontSize: fontSize.sm, fontWeight: "800" },
  openRow: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" },
  openText: { color: colors.teal, fontSize: fontSize.sm, fontWeight: "800" },
});
