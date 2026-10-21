/**
 * Account screen: session state, sign in/out, account deletion, and the
 * configured API URL.
 */
import React, { useCallback } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { API_URL } from "../api";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { Card, PrimaryButton, Screen, SectionTitle } from "../components/Ui";
import { colors, fontSize, spacing } from "../theme";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Account">,
  NativeStackScreenProps<RootStackParamList>
>;

export function AccountScreen({ navigation }: Props) {
  const { user, initializing, busy, signOut, deleteAccount } = useAuth();

  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, watchlist and alerts. This cannot be undone.",
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

  return (
    <Screen>
      <ScrollView>
        {user ? (
          <View style={styles.profileHero}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.email.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileLabel}>SIGNED IN AS</Text>
              <Text style={styles.profileEmail} numberOfLines={1}>{user.email}</Text>
            </View>
            <Ionicons name="shield-checkmark" size={24} color={colors.tealBright} />
          </View>
        ) : null}
        <SectionTitle>Account</SectionTitle>
        <Card>
          {initializing ? (
            <ActivityIndicator color={colors.teal} />
          ) : user ? (
            <>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={18} color={colors.teal} />
                <Text style={styles.muted}>Member since {user.createdAt.slice(0, 10)}</Text>
              </View>
              <View style={{ height: spacing.md }} />
              <PrimaryButton
                label={busy ? "Signing out…" : "Sign out"}
                onPress={() => signOut()}
                disabled={busy}
              />
              <View style={{ height: spacing.md }} />
              <Text style={styles.muted}>
                Deleting your account permanently removes your watchlist and alerts.
              </Text>
              <View style={{ height: spacing.sm }} />
              <PrimaryButton
                label="Delete account"
                onPress={confirmDeleteAccount}
                disabled={busy}
              />
            </>
          ) : (
            <ActivityIndicator color={colors.teal} />
          )}
        </Card>

        <SectionTitle>App connection</SectionTitle>
        <Card>
          <View style={styles.infoRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.body}>Connected securely</Text>
          </View>
          <Text style={styles.endpoint} numberOfLines={1}>{API_URL}</Text>
        </Card>
        <SectionTitle>Research</SectionTitle>
        <Card>
          <PrimaryButton label="Saved articles and history" onPress={() => navigation.navigate("Library")} />
          <PrimaryButton label="Smart monitors" onPress={() => navigation.navigate("Monitors")} />
          <PrimaryButton label="Catalyst calendar" onPress={() => navigation.navigate("Calendar")} />
        </Card>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileHero: { flexDirection: "row", alignItems: "center", backgroundColor: colors.navy, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.tealBright, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  avatarText: { color: colors.white, fontSize: fontSize.xl, fontWeight: "800" },
  profileCopy: { flex: 1 },
  profileLabel: { color: colors.tealBright, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  profileEmail: { color: colors.white, fontSize: fontSize.lg, fontWeight: "700", marginTop: 3 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  onlineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs, lineHeight: 20 },
  endpoint: { fontSize: fontSize.xs, color: colors.placeholder, marginTop: spacing.sm },
});
