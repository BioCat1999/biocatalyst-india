/**
 * Catalyst Feed (spec §4.1): newest-first event cards, compact filter
 * chips, cursor pagination, pull-to-refresh. Fully anonymous.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { type CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, type EventCard as EventCardT, type EventType } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { EventCard } from "../components/EventCard";
import { Chip, EmptyView, ErrorView, LoadingView, Screen } from "../components/Ui";
import { spacing } from "../theme";

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
  const [items, setItems] = useState<EventCardT[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<EventType | undefined>(undefined);

  const loadPage = useCallback(
    async (nextCursor: string | null, append: boolean) => {
      try {
        const page = await getApiClient().listEvents({
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
    setLoading(true);
    await loadPage(null, false);
    setLoading(false);
  }, [loadPage]);

  useEffect(() => {
    initial();
  }, [initial]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPage(null, false);
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
  chips: { paddingTop: spacing.sm },
  chipRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
