/**
 * Catalyst Feed (spec §4.1): newest-first event cards, compact filter
 * chips, cursor pagination, and pull-to-refresh for signed-in members.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { type CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, type EventCard as EventCardT, type EventType } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import { getCachedFeed, loadFirstFeedPage } from "../contentCache";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { EventCard } from "../components/EventCard";
import { Chip, EmptyView, ErrorView, LoadingView, Screen } from "../components/Ui";
import { colors, fontSize, spacing } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Feed">,
  NativeStackScreenProps<RootStackParamList>
>;

const FILTERS: Array<{ label: string; value: EventType | undefined }> = [
  { label: "All", value: undefined },
  { label: "Regulatory", value: "regulatory_approval" },
  { label: "Trial results", value: "clinical_trial_result" },
  { label: "Partnerships", value: "licensing_or_partnership" },
  { label: "Submissions", value: "regulatory_submission" },
];

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
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
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

  if (loading) {
    return (
      <Screen>
        <LoadingView label="Loading catalyst feed…" />
      </Screen>
    );
  }
  if (error && items.length === 0) {
    return (
      <Screen>
        <ErrorView message={error.message} onRetry={initial} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Ionicons name="pulse" size={20} color={colors.teal} />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.introEyebrow}>INDIA BIOPHARMA INTELLIGENCE</Text>
          <Text style={styles.introText}>Material clinical, regulatory and deal catalysts—in one signal-first feed.</Text>
        </View>
      </View>
      <View style={styles.chips}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(f) => f.label}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              active={filter === item.value}
              onPress={() => setFilter(item.value)}
            />
          )}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(e) => e.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.feedContent}
        ListEmptyComponent={<EmptyView message="No catalyst events yet." />}
        ListFooterComponent={loadingMore ? <LoadingView label="Loading more…" /> : null}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => navigation.navigate("EventDetail", { eventId: item.id })}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.navy,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.tealSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  introCopy: { flex: 1 },
  introEyebrow: { color: colors.tealBright, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  introText: { color: colors.white, fontSize: fontSize.sm, lineHeight: 19, marginTop: 3 },
  chips: { paddingTop: spacing.md, backgroundColor: colors.bg },
  chipRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  feedContent: { paddingBottom: spacing.xl },
});
