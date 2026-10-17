/**
 * Alerts — the in-app notification center (spec §4.7/§14).
 *
 * Newest first with unread highlighting; tapping an alert marks it
 * read and opens the event. Auth-gated like web.
 */
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, type CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError, type AlertListResponse } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { Card, EmptyView, ErrorView, LoadingView, PrimaryButton, Screen, SectionTitle } from "../components/Ui";
import { colors, fontSize, spacing } from "../theme";
import { formatDate } from "../lib/format";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Alerts">,
  NativeStackScreenProps<RootStackParamList>
>;

export function AlertsScreen({ navigation }: Props) {
  const { user, initializing } = useAuth();
  const hasLoaded = React.useRef(false);
  const [data, setData] = useState<AlertListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (!hasLoaded.current) setLoading(true);
    try {
      const res = await getApiClient().listAlerts();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err), "network"));
    } finally {
      hasLoaded.current = true;
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const openAlert = useCallback(
    async (alertId: string, eventId: string) => {
      try {
        await getApiClient().markAlertRead(alertId);
      } catch {
        // Reading the event still works; the badge refreshes next load.
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              unreadCount: Math.max(0, prev.unreadCount - 1),
              items: prev.items.map((a) =>
                a.id === alertId ? { ...a, readAt: new Date().toISOString() } : a,
              ),
            }
          : prev,
      );
      navigation.navigate("EventDetail", { eventId });
    },
    [navigation],
  );

  const markAllRead = useCallback(async () => {
    try {
      await getApiClient().markAllAlertsRead();
      setData((prev) =>
        prev
          ? {
              ...prev,
              unreadCount: 0,
              items: prev.items.map((a) => ({ ...a, readAt: a.readAt ?? new Date().toISOString() })),
            }
          : prev,
      );
    } catch {
      // Non-fatal; user can retry.
    }
  }, []);

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
          <Text style={styles.promptTitle}>Alerts</Text>
          <Text style={styles.promptBody}>
            Follow companies or drugs and we'll surface high-confidence catalysts here. Sign in to
            begin.
          </Text>
          <PrimaryButton label="Sign in" onPress={() => navigation.navigate("SignIn")} />
        </View>
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <ErrorView message={error.message} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen>
      {data && data.unreadCount > 0 && (
        <View style={styles.badgeRow}>
          <Text style={styles.badgeText}>
            {data.unreadCount} unread
          </Text>
          <Pressable onPress={markAllRead} accessibilityRole="button">
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={<EmptyView message="No alerts yet. Follow a company or drug to get notified of new catalysts." />}
        renderItem={({ item }) => {
          const unread = !item.readAt;
          return (
            <Pressable onPress={() => openAlert(item.id, item.eventId)} accessibilityRole="button">
              <Card style={unread ? styles.unreadCard : undefined}>
                <View style={styles.row}>
                  {unread && <View style={styles.dot} />}
                  <View style={styles.info}>
                    <Text style={[styles.headline, unread && styles.headlineUnread]}>
                      {item.headline ?? "New catalyst event"}
                    </Text>
                    <Text style={styles.meta}>
                      {formatDate(item.createdAt)} · {item.channel}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
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
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  badgeText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.navy },
  markAll: { fontSize: fontSize.sm, fontWeight: "600", color: colors.teal },
  unreadCard: { borderColor: colors.teal, borderWidth: 1.5 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal, marginTop: 6, marginRight: spacing.sm },
  info: { flex: 1 },
  headline: { fontSize: fontSize.md, color: colors.ink },
  headlineUnread: { fontWeight: "700", color: colors.navy },
  meta: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs },
});
