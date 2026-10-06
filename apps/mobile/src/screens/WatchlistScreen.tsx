/**
 * Watchlist (spec §4.7): the signed-in user's followed companies and
 * drugs, with instant unfollow. Anonymous users get a sign-in prompt —
 * same gating as web.
 */
import React, { useCallback } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, type CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { Card, EmptyView, ErrorView, LoadingView, PrimaryButton, Screen } from "../components/Ui";
import { colors, fontSize, spacing } from "../theme";
import { formatDate, parseWatchlistHref } from "../lib/format";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Watchlist">,
  NativeStackScreenProps<RootStackParamList>
>;

export function WatchlistScreen({ navigation }: Props) {
  const { user, initializing } = useAuth();
  const [items, setItems] = React.useState<
    Array<{ entityType: "company" | "drug"; entityId: string; createdAt: string; name?: string | null; href?: string | null }>
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getApiClient().listWatchlist();
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err), "network"));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const unfollow = useCallback(
    async (entityType: "company" | "drug", entityId: string) => {
      try {
        await getApiClient().unfollow(entityType, entityId);
        setItems((prev) => prev.filter((i) => i.entityId !== entityId));
      } catch {
        // Keep the item; user can retry.
      }
    },
    [],
  );

  if (initializing || loading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>Your watchlist lives here</Text>
          <Text style={styles.promptBody}>
            Sign in to follow companies and drugs and get alerts on new catalysts.
          </Text>
          <PrimaryButton label="Sign in" onPress={() => navigation.navigate("SignIn")} />
        </View>
      </Screen>
    );
  }

  if (error) {
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
        keyExtractor={(i) => `${i.entityType}:${i.entityId}`}
        ListEmptyComponent={
          <EmptyView message="Nothing followed yet — open a company or drug page and tap Follow." />
        }
        renderItem={({ item }) => {
          const target = parseWatchlistHref(item.href);
          return (
            <Card>
              <View style={styles.row}>
                <Pressable
                  style={styles.info}
                  disabled={!target}
                  onPress={() => {
                    if (!target) return;
                    if (target.kind === "company")
                      navigation.navigate("Company", { slug: target.slug });
                    else navigation.navigate("Drug", { slug: target.slug });
                  }}
                  accessibilityRole={target ? "button" : undefined}
                >
                  <Text style={styles.name}>{item.name ?? item.entityId}</Text>
                  <Text style={styles.meta}>
                    {item.entityType} · followed {formatDate(item.createdAt)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => unfollow(item.entityType, item.entityId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Unfollow ${item.name ?? item.entityId}`}
                  style={styles.unfollow}
                >
                  <Text style={styles.unfollowText}>Unfollow</Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  prompt: { flex: 1, justifyContent: "center", padding: spacing.xl },
  promptTitle: { fontSize: fontSize.xl, fontWeight: "700", color: colors.navy, textAlign: "center" },
  promptBody: { fontSize: fontSize.md, color: colors.muted, textAlign: "center", marginTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center" },
  info: { flex: 1 },
  name: { fontSize: fontSize.md, fontWeight: "700", color: colors.navy },
  meta: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs },
  unfollow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  unfollowText: { color: colors.red, fontWeight: "600", fontSize: fontSize.sm },
});
