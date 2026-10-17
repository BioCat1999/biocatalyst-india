/**
 * IPO tracker (mobile): Indian pharma companies in the IPO pipeline or
 * recently listed. Status starts from a curated catalog and news events
 * can only advance it. Research tracker, not investment advice.
 */
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, type EventType, type IpoEntry, type IpoStatus } from "@biocatalyst/api-client";
import { eventTypeLabel } from "@biocatalyst/api-client";
import { getCachedIpos, loadIpos } from "../ipoCache";
import type { RootStackParamList } from "../navigation/types";
import { Card, EmptyView, ErrorView, LoadingView, Screen } from "../components/Ui";
import { colors, fontSize, spacing } from "../theme";
import { formatDate } from "../lib/format";

type Props = NativeStackScreenProps<RootStackParamList, "Ipo">;

const STATUS_LABEL: Record<IpoStatus, string> = {
  in_pipeline: "In pipeline",
  listed: "Listed",
  watchlist: "Watchlist",
};

export function IpoScreen({ navigation }: Props) {
  const cached = getCachedIpos();
  const [items, setItems] = useState<IpoEntry[]>(() => cached?.items ?? []);
  const [loading, setLoading] = useState(cached === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const res = await loadIpos(force);
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err), "network"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen>
        <LoadingView label="Loading IPO pipeline…" />
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
        keyExtractor={(e) => e.company.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        ListEmptyComponent={<EmptyView message="No IPO candidates tracked yet." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("Company", { slug: item.company.slug })}>
            <Card>
              <View style={styles.headRow}>
                <Text style={styles.name}>{item.company.canonicalName}</Text>
                <Text style={styles.status}>{STATUS_LABEL[item.status]}</Text>
              </View>
              <Text style={styles.desc} numberOfLines={3}>
                {item.company.description}
              </Text>
              {(item.milestone.drhpDate || item.milestone.listingDate || item.milestone.note) && (
                <Text style={styles.milestone} numberOfLines={3}>
                  {item.milestone.drhpDate ? `DRHP filed: ${item.milestone.drhpDate}. ` : ""}
                  {item.milestone.listingDate ? `Listed: ${item.milestone.listingDate}. ` : ""}
                  {item.milestone.note ?? ""}
                </Text>
              )}
              {item.latestEvent ? (
                <Pressable
                  onPress={() => navigation.navigate("EventDetail", { eventId: item.latestEvent!.id })}
                >
                  <Text style={styles.eventType}>
                    {eventTypeLabel(item.latestEvent.eventType as EventType)}
                  </Text>
                  <Text style={styles.headline} numberOfLines={2}>
                    {item.latestEvent.headline}
                  </Text>
                  <Text style={styles.date}>{formatDate(item.latestEvent.occurredAt)}</Text>
                </Pressable>
              ) : (
                <Text style={styles.noNews}>No IPO milestones reported yet.</Text>
              )}
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  name: { fontSize: fontSize.md, fontWeight: "700", color: colors.navy, flex: 1 },
  status: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
  },
  desc: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs },
  eventType: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  headline: { fontSize: fontSize.sm, color: colors.ink, marginTop: 2 },
  date: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  milestone: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs },
  noNews: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.sm, fontStyle: "italic" },
});
