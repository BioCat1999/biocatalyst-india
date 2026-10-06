/**
 * Follow/unfollow toggle for companies and drugs.
 *
 * Reads the signed-in user's watchlist, shows the current state, and
 * toggles via POST/DELETE /api/v1/watchlist. Anonymous users are sent
 * to the sign-in screen (same auth-gating as web).
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { WatchlistEntityType } from "@biocatalyst/types";
import { ApiError } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import { useAuth } from "../auth/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { colors, fontSize, radius, spacing } from "../theme";

export function FollowButton({
  entityType,
  entityId,
}: {
  entityType: WatchlistEntityType;
  entityId: string;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setFollowing(null);
      return;
    }
    try {
      const list = await getApiClient().listWatchlist();
      setFollowing(
        list.items.some((i) => i.entityType === entityType && i.entityId === entityId),
      );
    } catch {
      setFollowing(null);
    }
  }, [user, entityType, entityId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (!user) {
      navigation.navigate("SignIn");
      return;
    }
    setBusy(true);
    try {
      if (following) {
        await getApiClient().unfollow(entityType, entityId);
        setFollowing(false);
      } else {
        await getApiClient().follow(entityType, entityId);
        setFollowing(true);
      }
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) navigation.navigate("SignIn");
    } finally {
      setBusy(false);
    }
  }, [user, following, entityType, entityId, navigation]);

  return (
    <Pressable
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={following ? "Unfollow" : "Follow"}
      style={[styles.button, following && styles.buttonActive]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={following ? colors.white : colors.teal} />
      ) : (
        <Text style={[styles.label, following && styles.labelActive]}>
          {following ? "Following" : user ? "Follow" : "Sign in to follow"}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: radius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  buttonActive: { backgroundColor: colors.teal },
  label: { color: colors.teal, fontWeight: "700", fontSize: fontSize.md },
  labelActive: { color: colors.white },
});
