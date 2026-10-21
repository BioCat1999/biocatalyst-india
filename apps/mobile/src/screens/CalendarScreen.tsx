import React, { useCallback, useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { CalendarResponse } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import { Card, Chip, EmptyView, ErrorView, LoadingView, Screen } from "../components/Ui";
import { useApiCall } from "../hooks/useApiCall";
import type { RootStackParamList } from "../navigation/types";
import { colors, fontSize, spacing } from "../theme";
import { formatDate } from "../lib/format";

type Props = NativeStackScreenProps<RootStackParamList, "Calendar">;
type Item = CalendarResponse["items"][number];

const FILTERS = [
  { label: "All", kind: "" },
  { label: "Trials", kind: "trial_completion" },
  { label: "PDUFA", kind: "pdufa" },
  { label: "Patents", kind: "patent_expiry" },
  { label: "Regulatory", kind: "regulatory_decision" },
] as const;

function kindLabel(kind: string): string {
  return kind.replaceAll("_", " ").toUpperCase();
}

export function CalendarScreen({ navigation }: Props) {
  const [kind, setKind] = useState("");
  const load = useCallback(
    () => getApiClient().getCalendar({ kind: kind || undefined, limit: 200 }),
    [kind],
  );
  const calendar = useApiCall(load, `calendar:${kind}`);

  if (calendar.loading) return <Screen><LoadingView label="Building catalyst calendar…" /></Screen>;
  if (calendar.error) return <Screen><ErrorView message={calendar.error.message} onRetry={calendar.retry} /></Screen>;

  return (
    <Screen>
      <FlatList<Item>
        data={calendar.data?.items ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text style={styles.intro}>
              Confirmed and estimated clinical, regulatory and patent dates. Estimated dates are labelled explicitly.
            </Text>
            <View style={styles.filters}>
              {FILTERS.map((filter) => (
                <Chip
                  key={filter.kind}
                  label={filter.label}
                  active={kind === filter.kind}
                  onPress={() => setKind(filter.kind)}
                />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyView message="No upcoming milestones match this filter." />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.topRow}>
              <Text style={styles.date}>{formatDate(item.date)}</Text>
              <View style={[styles.status, item.status === "estimated" && styles.estimated]}>
                <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.kind}>{kindLabel(item.kind)}</Text>
            <Text style={styles.title}>{item.title}</Text>
            {!!item.detail && <Text style={styles.detail}>{item.detail}</Text>}
            {!!item.country && <Text style={styles.country}>{item.country}</Text>}
            <View style={styles.actions}>
              {item.company && (
                <Pressable onPress={() => navigation.navigate("Company", { slug: item.company!.slug })}>
                  <Text style={styles.link}>{item.company.canonicalName} ›</Text>
                </Pressable>
              )}
              {!!item.sourceUrl && (
                <Pressable onPress={() => void Linking.openURL(item.sourceUrl)}>
                  <Text style={styles.source}>Verify source ↗</Text>
                </Pressable>
              )}
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { margin: spacing.lg, marginBottom: spacing.sm, color: colors.muted, fontSize: fontSize.sm, lineHeight: 19 },
  filters: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: spacing.lg, marginBottom: spacing.sm, rowGap: spacing.sm },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  date: { color: colors.navy, fontSize: fontSize.md, fontWeight: "800" },
  status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.greenSoft },
  estimated: { backgroundColor: colors.amberSoft },
  statusText: { color: colors.ink, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  kind: { color: colors.teal, fontSize: 10, fontWeight: "800", letterSpacing: 0.7, marginTop: spacing.sm },
  title: { color: colors.ink, fontSize: fontSize.md, fontWeight: "700", marginTop: 3 },
  detail: { color: colors.muted, fontSize: fontSize.sm, marginTop: spacing.xs },
  country: { color: colors.muted, fontSize: fontSize.xs, marginTop: spacing.xs },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.md, marginTop: spacing.md },
  link: { color: colors.teal, fontSize: fontSize.sm, fontWeight: "700" },
  source: { color: colors.navy, fontSize: fontSize.sm, fontWeight: "700" },
});
