/**
 * Global section (mobile): non-Indian pharma majors tracked for their
 * India impact — FDA approvals, trial readouts, patent expiries and deals
 * that move Indian pharma. Tapping a company opens its detail page with
 * delayed quote, global footprint and India-impact links.
 */
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, type CompanyListItem } from "@biocatalyst/api-client";
import { getCachedGlobalCompanies, loadGlobalCompanies } from "../contentCache";
import { getApiClient } from "../api";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { Card, EmptyView, ErrorView, LoadingView, Screen } from "../components/Ui";
import { colors, fontSize, spacing } from "../theme";
import { useFocusEffect } from "@react-navigation/native";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Global">,
  NativeStackScreenProps<RootStackParamList>
>;

export function GlobalScreen({ navigation }: Props) {
  const cached = getCachedGlobalCompanies();
  const [items, setItems] = useState<CompanyListItem[]>(() => cached?.items ?? []);
  const [loading, setLoading] = useState(cached === null);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(cached?.nextCursor ?? null);
  const [total, setTotal] = useState(cached?.total ?? cached?.items.length ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const res = await loadGlobalCompanies(force);
      setItems(res.items);
      setNextCursor(res.nextCursor ?? null);
      setTotal(res.total ?? res.items.length);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err), "network"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await getApiClient().listCompanies("global", { limit: 50, cursor: nextCursor });
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...res.items.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(res.nextCursor ?? null);
      setTotal(res.total ?? total);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err), "network"));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, total]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <Screen>
        <LoadingView label="Loading global pharma…" />
      </Screen>
    );
  }
  if (error && items.length === 0) {
    return (
      <Screen>
        <ErrorView message={error.message} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        ListEmptyComponent={<EmptyView message="No global companies tracked yet." />}
        ListHeaderComponent={
          <Text style={styles.blurb}>
            {total.toLocaleString()} global clinical-industry companies. Results load in fast batches
            as you scroll.
          </Text>
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <LoadingView label="Loading more companies…" /> : null}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("Company", { slug: item.slug })}>
            <Card>
              <View style={styles.row}>
                <View style={styles.text}>
                  <Text style={styles.name}>{item.canonicalName}</Text>
                  <Text style={styles.meta}>
                    {item.country}
                    {item.securities[0]
                      ? ` · ${item.securities[0].ticker} (${item.securities[0].exchange})`
                      : ""}
                  </Text>
                  <Text style={styles.desc} numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  blurb: {
    fontSize: fontSize.sm,
    color: colors.muted,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  text: { flex: 1 },
  name: { fontSize: fontSize.md, fontWeight: "700", color: colors.navy },
  meta: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  desc: { fontSize: fontSize.sm, color: colors.ink, marginTop: spacing.xs },
  chevron: { fontSize: 24, color: colors.muted },
});
