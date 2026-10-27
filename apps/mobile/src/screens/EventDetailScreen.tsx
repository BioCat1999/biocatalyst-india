/**
 * Event Detail (spec §4.2): structured headline, fact box, 80–150 word
 * summary, "Why this matters", market reaction with exact window +
 * provider, sources with provenance, confidence + report-an-issue.
 */
import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { eventTypeLabel } from "@biocatalyst/types";
import { getApiClient } from "../api";
import type { RootStackParamList } from "../navigation/types";
import { Ionicons } from "@expo/vector-icons";
import { Card, EmptyView, ErrorView, HeroHeader, Screen, SectionTitle, SkeletonList } from "../components/Ui";
import { useApiCall } from "../hooks/useApiCall";
import { colors, fontSize, radius, shadow, spacing } from "../theme";
import { formatDate, formatPct } from "../lib/format";
import { eventStyle } from "../lib/categories";

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
    { cacheKey: `event:${eventId}`, staleMs: 300_000 },
  );
  const [saved, setSaved] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [workspaceReady, setWorkspaceReady] = React.useState(false);
  const [workspaceMessage, setWorkspaceMessage] = React.useState("");

  React.useEffect(() => {
    if (!event) return;
    let alive = true;
    void getApiClient().updateEventState(eventId, { markRead: true })
      .then((state) => {
        if (!alive) return;
        setSaved(state.saved);
        setNote(state.note);
        setWorkspaceReady(true);
      })
      .catch(() => setWorkspaceReady(false));
    return () => { alive = false; };
  }, [event, eventId]);

  const updateWorkspace = React.useCallback(async (input: { saved?: boolean; note?: string }) => {
    try {
      const state = await getApiClient().updateEventState(eventId, input);
      setSaved(state.saved);
      setNote(state.note);
      setWorkspaceReady(true);
      setWorkspaceMessage("Saved");
    } catch {
      setWorkspaceMessage("Could not save. Please try again.");
    }
  }, [eventId]);

  if (loading)
    return (
      <Screen>
        <SkeletonList count={3} />
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
  const cat = eventStyle(event.eventType);
  const pct = mr?.pctChange;
  const moveColor = pct === null || pct === undefined || pct === 0 ? colors.muted : pct > 0 ? colors.green : colors.red;
  const confidence = Math.max(0, Math.min(1, event.confidence));
  const confColor = confidence >= 0.8 ? colors.green : confidence >= 0.6 ? colors.amber : colors.red;

  return (
    <Screen>
      <ScrollView>
        <HeroHeader style={styles.hero}>
          <View style={styles.kickerRow}>
            <View style={[styles.kickerBadge, { backgroundColor: cat.soft }]}>
              <Ionicons name={cat.icon} size={14} color={cat.color} />
              <Text style={[styles.kicker, { color: cat.color }]}>{eventTypeLabel(event.eventType)}</Text>
            </View>
          </View>
          <Text style={styles.headline}>{event.headline}</Text>
          <View style={styles.heroMeta}>
            <Ionicons name="calendar-outline" size={13} color={colors.navyText} />
            <Text style={styles.date}>{formatDate(event.occurredAt)}</Text>
            <Text style={styles.heroDot}>•</Text>
            <Ionicons name="documents-outline" size={13} color={colors.navyText} />
            <Text style={styles.date}>{event.sources.length} source{event.sources.length === 1 ? "" : "s"}</Text>
            {pct !== null && pct !== undefined ? (
              <View style={[styles.heroMove, { backgroundColor: pct > 0 ? "rgba(34,197,94,0.18)" : pct < 0 ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.1)" }]}>
                <Ionicons name={pct > 0 ? "caret-up" : pct < 0 ? "caret-down" : "remove"} size={12} color={pct > 0 ? "#86efac" : pct < 0 ? "#fca5a5" : colors.navyText} />
                <Text style={[styles.heroMoveText, { color: pct > 0 ? "#86efac" : pct < 0 ? "#fca5a5" : colors.navyText }]}>{formatPct(pct)}</Text>
              </View>
            ) : null}
          </View>
        </HeroHeader>

        {event.fact ? (
          <View style={[styles.keyFact, { borderLeftColor: cat.color }]}>
            <Text style={[styles.keyFactLabel, { color: cat.color }]}>KEY FACT</Text>
            <Text style={styles.keyFactText}>{event.fact}</Text>
          </View>
        ) : null}

        <SectionTitle icon="reader-outline">Summary</SectionTitle>
        <Card>
          <Text style={styles.body}>{event.summary}</Text>
        </Card>

        {event.catalystSummary ? (
          <>
            <SectionTitle icon="flash" color={colors.amber}>Why this matters</SectionTitle>
            <Card style={styles.whyCard}>
              <Text style={styles.body}>{event.catalystSummary}</Text>
              <Text style={styles.disclaimer}>Neutral catalyst context — not investment advice.</Text>
            </Card>
          </>
        ) : null}

        <SectionTitle icon="grid-outline" color={colors.navy3}>At a glance</SectionTitle>
        <Card>
          <FactRow label="Event type" value={eventTypeLabel(event.eventType)} />
          <FactRow label="Date" value={formatDate(event.occurredAt)} />
          {event.indication && <FactRow label="Indication" value={event.indication} />}
          {event.phase && <FactRow label="Phase" value={event.phase} />}
          {event.outcome && event.outcome !== "unknown" && (
            <FactRow label="Outcome" value={event.outcome.replace(/_/g, " ")} />
          )}
        </Card>

        {mr && (
          <>
            <SectionTitle icon="stats-chart" color={colors.rose}>Market reaction</SectionTitle>
            <Card>
              <View style={styles.moveRow}>
                <Text style={[styles.moveBig, { color: moveColor }]}>{formatPct(mr.pctChange)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.moveTicker}>{mr.securityTicker} · {mr.exchange}</Text>
                  <Text style={styles.movePrices}>{mr.priceBefore ?? "—"} → {mr.priceAfter ?? "—"}</Text>
                </View>
              </View>
              <FactRow label="Window" value={mr.windowDefinition} />
              {mr.benchmarkName && (
                <FactRow label="Benchmark" value={`${mr.benchmarkName} (${formatPct(mr.benchmarkPctChange)})`} />
              )}
              <FactRow label="Provider" value={mr.provider} />
              {mr.licenseMetadata && <FactRow label="License" value={mr.licenseMetadata} />}
            </Card>
          </>
        )}

        <SectionTitle icon="library-outline" color={colors.blue}>Sources ({event.sources.length})</SectionTitle>
        {event.sources.map((s) => (
          <Pressable key={s.id} onPress={() => Linking.openURL(s.url)} accessibilityRole="link" style={({ pressed }) => [styles.sourceCard, pressed && { opacity: 0.85 }]}>
            <View style={[styles.sourceIcon, s.isPrimary && { backgroundColor: colors.greenSoft }]}>
              <Ionicons name={s.isPrimary ? "shield-checkmark" : "link"} size={15} color={s.isPrimary ? colors.green : colors.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.link} numberOfLines={2}>{s.title}</Text>
              <Text style={styles.muted}>
                {s.publisher} · {formatDate(s.publishedAt)}
                {s.isPrimary ? " · primary source" : ""}
              </Text>
            </View>
            <Ionicons name="open-outline" size={15} color={colors.muted} />
          </Pressable>
        ))}

        <SectionTitle icon="analytics-outline" color={confColor}>Data quality</SectionTitle>
        <Card>
          <View style={styles.confRow}>
            <Text style={styles.confLabel}>Extraction confidence</Text>
            <Text style={[styles.confValue, { color: confColor }]}>{Math.round(confidence * 100)}%</Text>
          </View>
          <View style={styles.confTrack}>
            <View style={[styles.confFill, { width: `${Math.round(confidence * 100)}%`, backgroundColor: confColor }]} />
          </View>
          <Text style={styles.muted}>
            Spotted an error? Report it from the web app's event page — every
            correction is reviewed by the curation team.
          </Text>
        </Card>

        <SectionTitle icon="bookmark-outline">Research workspace</SectionTitle>
        <Card>
          <Pressable
            style={[styles.saveButton, saved && styles.saveButtonActive]}
            onPress={() => void updateWorkspace({ saved: !saved })}
          >
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={16} color={saved ? colors.teal : colors.navy} />
            <Text style={[styles.saveButtonText, saved && styles.saveButtonTextActive]}>
              {saved ? "Saved to library" : "Save to library"}
            </Text>
          </Pressable>
          <TextInput
            style={styles.noteInput}
            multiline
            maxLength={5000}
            value={note}
            onChangeText={setNote}
            placeholder="Add private research notes…"
            placeholderTextColor={colors.placeholder}
          />
          <Pressable style={styles.noteButton} onPress={() => void updateWorkspace({ note })}>
            <Text style={styles.noteButtonText}>Save note</Text>
          </Pressable>
          {!!workspaceMessage && <Text style={styles.workspaceMessage}>{workspaceMessage}</Text>}
          {!workspaceReady && <Text style={styles.workspaceMessage}>Workspace syncs when connected.</Text>}
        </Card>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  kickerRow: { flexDirection: "row" },
  kickerBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  kicker: { fontSize: fontSize.xs, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  headline: {
    fontSize: fontSize.title,
    lineHeight: 31,
    fontWeight: "800",
    color: colors.white,
    marginTop: spacing.md,
    letterSpacing: -0.4,
  },
  heroMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: spacing.md },
  heroDot: { color: colors.navyText, marginHorizontal: 2 },
  date: { fontSize: fontSize.sm, color: colors.navyText, fontWeight: "600" },
  heroMove: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 },
  heroMoveText: { fontSize: fontSize.sm, fontWeight: "800" },
  keyFact: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderLeftWidth: 4,
    padding: spacing.lg,
    ...shadow,
  },
  keyFactLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  keyFactText: { fontSize: fontSize.lg, lineHeight: 25, fontWeight: "700", color: colors.ink, marginTop: 4 },
  whyCard: { backgroundColor: "#fffaf0", borderColor: "#f6e3b4" },
  moveRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  moveBig: { fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  moveTicker: { fontSize: fontSize.sm, fontWeight: "800", color: colors.navy },
  movePrices: { fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  sourceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: 5,
  },
  sourceIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" },
  confRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  confLabel: { fontSize: fontSize.sm, fontWeight: "700", color: colors.ink2 },
  confValue: { fontSize: fontSize.lg, fontWeight: "900" },
  confTrack: { height: 8, borderRadius: 4, backgroundColor: colors.slateSoft, marginTop: spacing.sm, overflow: "hidden" },
  confFill: { height: 8, borderRadius: 4 },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 24 },
  muted: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs, lineHeight: 20 },
  disclaimer: { fontSize: fontSize.sm, color: colors.muted, fontStyle: "italic", marginTop: spacing.sm },
  factRow: { flexDirection: "row", paddingVertical: spacing.xs },
  factLabel: { width: 110, fontSize: fontSize.sm, fontWeight: "700", color: colors.muted },
  factValue: { flex: 1, fontSize: fontSize.sm, color: colors.ink },
  link: { fontSize: fontSize.md, color: colors.teal, fontWeight: "600" },
  saveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md },
  saveButtonActive: { backgroundColor: colors.tealSoft, borderColor: colors.teal },
  saveButtonText: { color: colors.navy, fontSize: fontSize.sm, fontWeight: "700", textAlign: "center" },
  saveButtonTextActive: { color: colors.teal },
  noteInput: { minHeight: 90, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, marginTop: spacing.md, color: colors.ink, textAlignVertical: "top", backgroundColor: colors.inputBg },
  noteButton: { alignSelf: "flex-end", backgroundColor: colors.navy, borderRadius: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.sm },
  noteButtonText: { color: colors.white, fontSize: fontSize.sm, fontWeight: "700" },
  workspaceMessage: { color: colors.muted, fontSize: fontSize.xs, marginTop: spacing.xs },
});
