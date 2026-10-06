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
  const [items, setItems] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getApiClient().listCompanies("global");
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err), "network"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<EmptyView message="No global companies tracked yet." />}
        ListHeaderComponent={
          <Text style={styles.blurb}>
            Non-Indian pharma majors whose approvals, deals and patent moves
            affect Indian companies.
          </Text>
        }
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
