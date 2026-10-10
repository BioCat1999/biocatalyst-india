/**
 * Account screen: session state, sign in/out, push-notification setup
 * (Milestone 9 plumbing), and the configured API URL.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { API_URL } from "../api";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { Card, PrimaryButton, Screen, SectionTitle } from "../components/Ui";
import {
  ensurePushToken,
  getStoredPushToken,
  type PushSetupResult,
} from "../push/notifications";
import { colors, fontSize, spacing } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Account">,
  NativeStackScreenProps<RootStackParamList>
>;

function pushStatusLabel(result: PushSetupResult | null): string {
  if (!result) return "Not set up yet.";
  switch (result.status) {
    case "granted":
      return result.registered
        ? "Enabled — this device will receive push alerts once server delivery is configured."
        : "Permission granted. Token saved on-device; the server push endpoint is not live yet (Milestone 9 plumbing).";
    case "denied":
      return "Permission denied. Enable notifications in system Settings to receive alerts.";
    case "undetermined":
      return "Permission not decided yet.";
    case "unavailable":
      return result.detail ?? "Push tokens are unavailable on this device/emulator.";
    case "error":
      return result.detail ?? "Something went wrong while setting up push.";
  }
}

export function AccountScreen({ navigation }: Props) {
  const { user, initializing, busy, signOut, deleteAccount } = useAuth();
  const [pushResult, setPushResult] = useState<PushSetupResult | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [storedToken, setStoredToken] = useState<string | null>(null);

  useEffect(() => {
    getStoredPushToken().then(setStoredToken);
  }, []);

  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, watchlist, alerts and device push tokens. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
            } catch {
              Alert.alert("Could not delete account", "Please try again, or contact support.");
            }
          },
        },
      ],
    );
  }, [deleteAccount]);

  const setupPush = useCallback(async () => {
    setPushBusy(true);
    try {
      const result = await ensurePushToken();
      setPushResult(result);
      setStoredToken(await getStoredPushToken());
    } finally {
      setPushBusy(false);
    }
  }, []);

  return (
    <Screen>
      <ScrollView>
        <SectionTitle>Account</SectionTitle>
        <Card>
          {initializing ? (
            <ActivityIndicator color={colors.teal} />
          ) : user ? (
            <>
              <Text style={styles.email}>{user.email}</Text>
              <Text style={styles.muted}>Member since {user.createdAt.slice(0, 10)}</Text>
              <View style={{ height: spacing.md }} />
              <PrimaryButton
                label={busy ? "Signing out…" : "Sign out"}
                onPress={() => signOut()}
                disabled={busy}
              />
              <View style={{ height: spacing.md }} />
              <Text style={styles.muted}>
                Deleting your account permanently removes your watchlist, alerts and device
                push tokens.
              </Text>
              <View style={{ height: spacing.sm }} />
              <PrimaryButton
                label="Delete account"
                onPress={confirmDeleteAccount}
                disabled={busy}
              />
            </>
          ) : (
            <>
              <Text style={styles.muted}>You're browsing anonymously.</Text>
              <PrimaryButton label="Sign in" onPress={() => navigation.navigate("SignIn")} />
              <PrimaryButton label="Create account" onPress={() => navigation.navigate("SignUp")} />
            </>
          )}
        </Card>

        <SectionTitle>Push notifications</SectionTitle>
        <Card>
          <Text style={styles.body}>{pushStatusLabel(pushResult)}</Text>
          <Text style={styles.muted}>
            Enable push notifications to get alerted when companies, drugs, or trials you follow
            have new catalyst events. You can change this any time in system Settings.
          </Text>
          {storedToken && !pushResult && (
            <Text style={styles.muted}>A device token is already saved on this device.</Text>
          )}
          <View style={{ height: spacing.sm }} />
          {pushBusy ? (
            <ActivityIndicator color={colors.teal} />
          ) : (
            <PrimaryButton label="Enable push notifications" onPress={setupPush} />
          )}
          <Text style={styles.finePrint}>
            Milestone 10: requests OS permission, acquires the native device token, stores it
            securely on-device, and registers it with POST /api/v1/push-tokens. Actual push
            delivery still needs server credentials — see README.
          </Text>
        </Card>

        <SectionTitle>Connection</SectionTitle>
        <Card>
          <Text style={styles.body}>API: {API_URL}</Text>
          <Text style={styles.muted}>
            Set EXPO_PUBLIC_API_URL to point at another server (e.g. your LAN IP for a physical
            device).
          </Text>
        </Card>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  email: { fontSize: fontSize.lg, fontWeight: "700", color: colors.navy },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs, lineHeight: 20 },
  finePrint: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.md, lineHeight: 18 },
});
