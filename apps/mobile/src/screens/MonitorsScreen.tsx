import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { MonitorRule } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import { Card, Chip, EmptyView, ErrorView, LoadingView, PrimaryButton, Screen } from "../components/Ui";
import { colors, fontSize, radius, spacing } from "../theme";

const COUNTRIES = ["Any", "India", "United States"] as const;
const EVENT_TYPES = [
  { label: "Any event", value: "" },
  { label: "Trial results", value: "clinical_trial_result" },
  { label: "Approvals", value: "regulatory_approval" },
  { label: "Safety", value: "safety_signal" },
  { label: "Deals", value: "licensing_or_partnership" },
] as const;

export function MonitorsScreen() {
  const [items, setItems] = useState<MonitorRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState<string>("Any");
  const [eventType, setEventType] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await getApiClient().listMonitors()).items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const save = useCallback(async () => {
    const cleanName = name.trim();
    if (!cleanName || (!keyword.trim() && country === "Any" && !eventType)) {
      setError("Add a name and at least one keyword, market or event type.");
      return;
    }
    setSaving(true);
    try {
      const created = await getApiClient().createMonitor({
        name: cleanName,
        keyword: keyword.trim() || undefined,
        countries: country === "Any" ? [] : [country],
        eventTypes: eventType ? [eventType] : [],
      });
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id && item.name !== created.name)]);
      setName("");
      setKeyword("");
      setCountry("Any");
      setEventType("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [country, eventType, keyword, name]);

  const remove = useCallback(async (id: string) => {
    try {
      await getApiClient().deleteMonitor(id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  if (loading) return <Screen><LoadingView label="Loading monitors…" /></Screen>;

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Card>
            <Text style={styles.heading}>Create a smart monitor</Text>
            <Text style={styles.help}>Match a keyword, market and/or catalyst type. New matching events appear in Alerts.</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Monitor name" placeholderTextColor={colors.placeholder} />
            <TextInput style={styles.input} value={keyword} onChangeText={setKeyword} placeholder="Keyword, ticker, drug or theme" placeholderTextColor={colors.placeholder} />
            <Text style={styles.label}>Market</Text>
            <View style={styles.chips}>{COUNTRIES.map((value) => <Chip key={value} label={value} active={country === value} onPress={() => setCountry(value)} />)}</View>
            <Text style={styles.label}>Catalyst</Text>
            <View style={styles.chips}>{EVENT_TYPES.map((item) => <Chip key={item.value} label={item.label} active={eventType === item.value} onPress={() => setEventType(item.value)} />)}</View>
            <PrimaryButton label={saving ? "Saving…" : "Save monitor"} onPress={() => void save()} disabled={saving} />
            {!!error && <Text style={styles.error}>{error}</Text>}
          </Card>
        }
        ListEmptyComponent={<EmptyView message="No saved monitors yet." />}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.detail}>
                  {[item.keyword, ...item.countries, ...item.eventTypes.map((v) => v.replaceAll("_", " "))].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Pressable onPress={() => void remove(item.id)}><Text style={styles.delete}>Delete</Text></Pressable>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.navy, fontSize: fontSize.lg, fontWeight: "800" },
  help: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inputBg, borderRadius: radius, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.md, color: colors.ink },
  label: { color: colors.navy, fontSize: fontSize.sm, fontWeight: "700", marginTop: spacing.md, marginBottom: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.sm },
  error: { color: colors.red, fontSize: fontSize.sm, marginTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  info: { flex: 1 },
  name: { color: colors.navy, fontSize: fontSize.md, fontWeight: "700" },
  detail: { color: colors.muted, fontSize: fontSize.sm, marginTop: spacing.xs, textTransform: "capitalize" },
  delete: { color: colors.red, fontSize: fontSize.sm, fontWeight: "700" },
});
