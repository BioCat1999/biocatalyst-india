/**
 * Drug page (spec §4.4): canonical name + aliases, sponsor/licensee
 * companies, indications, trials grouped by phase, follow/unfollow.
 */
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getApiClient } from "../api";
import type { RootStackParamList } from "../navigation/types";
import { FollowButton } from "../components/FollowButton";
import { Card, EmptyView, ErrorView, LoadingView, Screen, SectionTitle } from "../components/Ui";
import { useApiCall } from "../hooks/useApiCall";
import { colors, fontSize, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Drug">;

export function DrugScreen({ route, navigation }: Props) {
  const { slug } = route.params;
  const { data: drug, loading, error, retry } = useApiCall(
    () => getApiClient().getDrug(slug),
    slug,
  );

  const trialsByPhase = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof drug>["trials"]>();
    for (const t of drug?.trials ?? []) {
      const list = groups.get(t.phase) ?? [];
      list.push(t);
      groups.set(t.phase, list);
    }
    return [...groups.entries()];
  }, [drug]);

  if (loading)
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  if (error)
    return (
      <Screen>
        <ErrorView message={error.message} onRetry={retry} />
      </Screen>
    );
  if (!drug)
    return (
      <Screen>
        <EmptyView message="Drug not found." />
      </Screen>
    );

  return (
    <Screen>
      <ScrollView>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.name}>{drug.canonicalName}</Text>
            {drug.aliases.length > 0 && (
              <Text style={styles.aliases}>Also known as: {drug.aliases.join(", ")}</Text>
            )}
          </View>
          <FollowButton entityType="drug" entityId={drug.id} />
        </View>

        {(drug.modality || drug.mechanism) && (
          <Card>
            {drug.modality && <Text style={styles.body}>Modality: {drug.modality}</Text>}
            {drug.mechanism && <Text style={styles.body}>Mechanism: {drug.mechanism}</Text>}
          </Card>
        )}

        <SectionTitle>Indications</SectionTitle>
        <Card>
          <Text style={styles.body}>
            {drug.indications.length > 0 ? drug.indications.join(", ") : "—"}
          </Text>
        </Card>

        <SectionTitle>Companies ({drug.companies.length})</SectionTitle>
        {drug.companies.map((co) => (
          <Pressable key={co.id} onPress={() => navigation.navigate("Company", { slug: co.slug })}>
            <Card>
              <Text style={styles.link}>{co.canonicalName}</Text>
            </Card>
          </Pressable>
        ))}

        <SectionTitle>Trials by phase ({drug.trials.length})</SectionTitle>
        {trialsByPhase.map(([phase, trials]) => (
          <View key={phase}>
            <Text style={styles.phaseLabel}>{phase}</Text>
            {trials.map((t) => (
              <Pressable
                key={t.id}
                onPress={() =>
                  navigation.navigate("Trial", { registry: t.registry, trialId: t.registryTrialId })
                }
              >
                <Card>
                  <Text style={styles.link}>{t.registryTrialId}</Text>
                  <Text style={styles.mutedNote}>{t.status}</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        ))}
        {drug.trials.length === 0 && (
          <Text style={styles.mutedNote}>No curated trials linked yet.</Text>
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  headerText: { flex: 1 },
  name: { fontSize: fontSize.title, fontWeight: "700", color: colors.navy },
  aliases: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22 },
  link: { fontSize: fontSize.md, color: colors.teal, fontWeight: "600" },
  phaseLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.navy,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  mutedNote: { fontSize: fontSize.sm, color: colors.muted, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
});
