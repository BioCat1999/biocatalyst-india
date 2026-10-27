/**
 * Trial page (spec §4.5): registry ID + link, sponsor, phase, status,
 * enrollment, dates, indications, interventions/endpoints when available.
 */
import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getApiClient } from "../api";
import type { RootStackParamList } from "../navigation/types";
import { Card, EmptyView, ErrorView, LoadingView, Screen, SectionTitle } from "../components/Ui";
import { useApiCall } from "../hooks/useApiCall";
import { colors, fontSize, spacing } from "../theme";
import { formatDate } from "../lib/format";

type Props = NativeStackScreenProps<RootStackParamList, "Trial">;

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export function TrialScreen({ route }: Props) {
  const { registry, trialId } = route.params;
  const key = `${registry}/${trialId}`;
  const { data: trial, loading, error, retry } = useApiCall(
    () => getApiClient().getTrial(registry, trialId),
    key,
    { cacheKey: `trial:${key}`, staleMs: 300_000 },
  );

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
  if (!trial)
    return (
      <Screen>
        <EmptyView message="Trial not found." />
      </Screen>
    );

  return (
    <Screen>
      <ScrollView>
        <Text style={styles.kicker}>
          {trial.registry} · {trial.phase}
        </Text>
        <Text style={styles.title}>{trial.registryTrialId}</Text>
        <Text style={styles.headline}>{trial.title}</Text>

        <SectionTitle>Details</SectionTitle>
        <Card>
          <FactRow label="Status" value={trial.status} />
          <FactRow label="Phase" value={trial.phase} />
          {trial.enrollment !== undefined && (
            <FactRow label="Enrollment" value={String(trial.enrollment)} />
          )}
          {trial.startDate && <FactRow label="Start" value={formatDate(trial.startDate)} />}
          {trial.primaryCompletionDate && (
            <FactRow label="Primary completion" value={formatDate(trial.primaryCompletionDate)} />
          )}
          {trial.indications.length > 0 && (
            <FactRow label="Indications" value={trial.indications.join(", ")} />
          )}
        </Card>

        {trial.primaryEndpoints && trial.primaryEndpoints.length > 0 && (
          <>
            <SectionTitle>Primary endpoints</SectionTitle>
            <Card>
              {trial.primaryEndpoints.map((ep, i) => (
                <Text key={i} style={styles.body}>
                  • {ep}
                </Text>
              ))}
            </Card>
          </>
        )}

        <SectionTitle>Registry record</SectionTitle>
        <Card>
          <Pressable onPress={() => Linking.openURL(trial.sourceUrl)} accessibilityRole="link">
            <Text style={styles.link}>Open {trial.registry} record ↗</Text>
          </Pressable>
        </Card>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: "700",
    color: colors.navy,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  headline: { fontSize: fontSize.md, color: colors.ink, marginHorizontal: spacing.lg, marginTop: spacing.sm, lineHeight: 22 },
  factRow: { flexDirection: "row", paddingVertical: spacing.xs },
  factLabel: { width: 150, fontSize: fontSize.sm, fontWeight: "700", color: colors.muted },
  factValue: { flex: 1, fontSize: fontSize.sm, color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22, marginBottom: spacing.xs },
  link: { fontSize: fontSize.md, color: colors.teal, fontWeight: "600" },
});
