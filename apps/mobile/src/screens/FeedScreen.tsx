/**
 * Catalyst Feed (spec §4.1): newest-first event cards, colored filter
 * chips, cursor pagination, and pull-to-refresh for signed-in members.
 *
 * The header shows a live pulse (what arrived today, approvals, trial
 * readouts, market movers) and a "coming up this week" calendar teaser to
 * pull readers into the next thing worth reading.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { type CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, type CalendarResponse, type EventCard as EventCardT, type EventType } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import { getCachedFeed, loadFirstFeedPage } from "../contentCache";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { EventCard } from "../components/EventCard";
import { Chip, EmptyView, ErrorView, HeroHeader, LoadingView, Screen, SkeletonList } from "../components/Ui";
import { peekApiCache, prefetchApi } from "../hooks/useApiCall";
import { colors, fontSize, radius, shadow, spacing } from "../theme";
import { eventStyle, kindStyle, type IconName } from "../lib/categories";
import { addDays, countdownLabel, startOfWeek, toDay } from "../lib/calendarDates";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

const FILTERS: Array<{ label: string; value: EventType | undefined; icon: IconName; color: string }> = [
  { label: "All", value: undefined, icon: "apps", color: colors.navy },
  { label: "Approvals", value: "regulatory_approval", ...pick("regulatory_approval") },
  { label: "Trial results", value: "clinical_trial_result", ...pick("clinical_trial_result") },
  { label: "Deals", value: "licensing_or_partnership", ...pick("licensing_or_partnership") },
  { label: "Submissions", value: "regulatory_submission", ...pick("regulatory_submission") },
  { label: "Safety", value: "safety_signal", ...pick("safety_signal") },
];

function pick(t: EventType) {
  const s = eventStyle(t);
  return { icon: s.icon, color: s.color };
}

type CalendarItem = CalendarResponse["items"][number];

/** Same key/shape the Calendar screen uses for this week, so it opens instantly. */
function thisWeekPeriod() {
  const start = startOfWeek(new Date());
  return { from: toDay(start), to: toDay(addDays(start, 6)), key: `calendar:w:${toDay(start)}` };
}

export function FeedScreen({ navigation }: Props) {
  const cached = getCachedFeed();
  const [items, setItems] = useState<EventCardT[]>(() => cached?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(() => cached?.nextCursor ?? null);
  const [hasMore, setHasMore] = useState(() => cached?.nextCursor !== null);
  const [loading, setLoading] = useState(cached === null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<EventType | undefined>(undefined);
  const [upcoming, setUpcoming] = useState<CalendarItem[] | null>(() => {
    const hit = peekApiCache<CalendarResponse>(thisWeekPeriod().key);
    return hit ? hit.items : null;
  });

  const loadPage = useCallback(
    async (nextCursor: string | null, append: boolean, force = false) => {
      try {
        const page =
          !append && nextCursor === null && filter === undefined
            ? await loadFirstFeedPage(force)
            : await getApiClient().listEvents({
                cursor: nextCursor ?? undefined,
                eventType: filter,
                limit: 20,
              });
        setItems((prev) => {
          if (!append) return page.items;
          // Guard against duplicate ids if a page boundary shifts.
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...page.items.filter((e) => !seen.has(e.id))];
        });
        setCursor(page.nextCursor);
        setHasMore(page.nextCursor !== null);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err : new ApiError(0, String(err), "network"));
      }
    },
    [filter],
  );

  const initial = useCallback(async () => {
    // Keep an already-cached unfiltered page visible while it is reused.
    // Filter changes still get an explicit loading state.
    if (filter !== undefined || !getCachedFeed()) setLoading(true);
    await loadPage(null, false);
    setLoading(false);
  }, [filter, loadPage]);

  useEffect(() => {
    initial();
  }, [initial]);

  // "Coming up this week" teaser, sharing the Calendar screen's cache.
  useEffect(() => {
    const period = thisWeekPeriod();
    let alive = true;
    prefetchApi(period.key, () => getApiClient().getCalendar({ from: period.from, to: period.to, limit: 500 }))
      .then((res) => {
        if (alive) setUpcoming(res.items);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(null, false, true);
    setRefreshing(false);
  }, [loadPage]);

  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    await loadPage(cursor, true);
    setLoadingMore(false);
  }, [hasMore, loadingMore, loading, cursor, loadPage]);

  const pulse = useMemo(() => {
    const dayAgo = Date.now() - 86_400_000;
    let today = 0;
    let approvals = 0;
    let trials = 0;
    let movers = 0;
    for (const e of items) {
      if (e.occurredAt && new Date(e.occurredAt).getTime() >= dayAgo) today += 1;
      if (e.eventType === "regulatory_approval") approvals += 1;
      if (e.eventType === "clinical_trial_result" || e.eventType === "primary_endpoint_met" || e.eventType === "primary_endpoint_missed") trials += 1;
      const pct = e.marketReaction?.pctChange;
      if (pct !== null && pct !== undefined && Math.abs(pct) >= 3) movers += 1;
    }
    return { today, approvals, trials, movers };
  }, [items]);

  const upcomingTeaser = useMemo(() => {
    if (!upcoming) return null;
    const todayStr = toDay(new Date());
    const next = upcoming.filter((i) => i.date >= todayStr);
    return { total: next.length, first: next.slice(0, 2) };
  }, [upcoming]);

  const openEvent = useCallback(
    (id: string) => navigation.navigate("EventDetail", { eventId: id }),
    [navigation],
  );
  const renderItem = useCallback(
    ({ item }: { item: EventCardT }) => <EventCard event={item} onPress={() => openEvent(item.id)} />,
    [openEvent],
  );

  const header = (
    <View>
      <HeroHeader style={styles.hero}>
        <View style={styles.introRow}>
          <View style={styles.introIcon}>
            <Ionicons name="pulse" size={20} color={colors.mint} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.introEyebrow}>INDIA BIOPHARMA INTELLIGENCE</Text>
            <Text style={styles.introTitle}>Today’s catalysts</Text>
          </View>
          <View style={styles.liveDot}>
            <View style={styles.liveDotInner} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <Stat icon="sparkles" color={colors.mint} value={pulse.today} label="New 24h" />
          <Stat icon="ribbon" color={colors.greenBright} value={pulse.approvals} label="Approvals" />
          <Stat icon="flask" color="#8fb6ff" value={pulse.trials} label="Trial news" />
          <Stat icon="trending-up" color="#ff9fbc" value={pulse.movers} label="Movers ±3%" />
        </View>
      </HeroHeader>

      {upcomingTeaser && upcomingTeaser.total > 0 ? (
        <Pressable
          onPress={() => navigation.navigate("Calendar")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.teaser, pressed && { opacity: 0.9 }]}
        >
          <View style={styles.teaserHead}>
            <View style={styles.teaserIcon}>
              <Ionicons name="calendar" size={16} color={colors.violet} />
            </View>
            <Text style={styles.teaserTitle}>Coming up this week</Text>
            <View style={styles.teaserCount}>
              <Text style={styles.teaserCountText}>{upcomingTeaser.total}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </View>
          {upcomingTeaser.first.map((i) => {
            const s = kindStyle(i.kind);
            return (
              <View key={i.id} style={styles.teaserRow}>
                <View style={[styles.teaserDot, { backgroundColor: s.color }]} />
                <Text style={styles.teaserItem} numberOfLines={1}>{i.title}</Text>
                <Text style={[styles.teaserWhen, { color: s.color }]}>{countdownLabel(i.date)}</Text>
              </View>
            );
          })}
        </Pressable>
      ) : null}

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={FILTERS}
        keyExtractor={(f) => f.label}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item }) => (
          <Chip
            label={item.label}
            icon={item.icon}
            color={item.color}
            active={filter === item.value}
            onPress={() => setFilter(item.value)}
          />
        )}
      />
    </View>
  );

  if (error && items.length === 0 && !loading) {
    return (
      <Screen>
        <ErrorView message={error.message} onRetry={initial} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.teal} colors={[colors.teal]} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        contentContainerStyle={styles.feedContent}
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? <SkeletonList count={3} /> : <EmptyView icon="newspaper-outline" message="No catalyst events for this filter yet." />}
        ListFooterComponent={loadingMore ? <LoadingView label="Loading more…" /> : null}
        renderItem={renderItem}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={11}
        updateCellsBatchingPeriod={40}
        removeClippedSubviews
      />
    </Screen>
  );
}

function Stat({ icon, color, value, label }: { icon: IconName; color: string; value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  introRow: { flexDirection: "row", alignItems: "center" },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(126,238,222,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  introCopy: { flex: 1 },
  introEyebrow: { color: colors.mint, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  introTitle: { color: colors.white, fontSize: fontSize.xl, fontWeight: "800", marginTop: 2, letterSpacing: -0.3 },
  liveDot: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(34,197,94,0.16)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  liveDotInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.greenBright },
  liveText: { color: "#a7f3c4", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  stat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  statValue: { color: colors.white, fontSize: 20, fontWeight: "900", marginTop: 4 },
  statLabel: { color: colors.navyText, fontSize: 10, fontWeight: "700", marginTop: 1 },
  teaser: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    ...shadow,
  },
  teaserHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  teaserIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.violetSoft, alignItems: "center", justifyContent: "center" },
  teaserTitle: { flex: 1, color: colors.navy, fontSize: fontSize.md, fontWeight: "800" },
  teaserCount: { backgroundColor: colors.violetSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  teaserCountText: { color: colors.violet, fontSize: fontSize.xs, fontWeight: "900" },
  teaserRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  teaserDot: { width: 7, height: 7, borderRadius: 4 },
  teaserItem: { flex: 1, color: colors.ink2, fontSize: fontSize.sm, fontWeight: "600" },
  teaserWhen: { fontSize: fontSize.xs, fontWeight: "800" },
  chipRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  feedContent: { paddingBottom: spacing.xxl },
});
