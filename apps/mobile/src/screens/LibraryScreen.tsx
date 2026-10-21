import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { LibraryResponse } from "@biocatalyst/api-client";
import { eventTypeLabel } from "@biocatalyst/types";
import { getApiClient } from "../api";
import { Card, Chip, EmptyView, ErrorView, LoadingView, Screen } from "../components/Ui";
import type { RootStackParamList } from "../navigation/types";
import { colors, fontSize, spacing } from "../theme";
import { formatDate } from "../lib/format";

type Props = NativeStackScreenProps<RootStackParamList, "Library">;

export function LibraryScreen({ navigation }: Props) {
  const [mode, setMode] = useState<"saved" | "history">("saved");
  const [items, setItems] = useState<LibraryResponse["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await getApiClient().getLibrary(mode)).items); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }, [mode]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (loading) return <Screen><LoadingView label="Loading research library…" /></Screen>;
  if (error) return <Screen><ErrorView message={error} onRetry={() => void load()} /></Screen>;
  return <Screen><FlatList
    data={items}
    keyExtractor={(item) => item.id}
    ListHeaderComponent={<View style={styles.filters}><Chip label="Saved" active={mode === "saved"} onPress={() => setMode("saved")} /><Chip label="History" active={mode === "history"} onPress={() => setMode("history")} /></View>}
    ListEmptyComponent={<EmptyView message={mode === "saved" ? "No saved articles yet." : "No reading history yet."} />}
    renderItem={({ item }) => <Pressable onPress={() => navigation.navigate("EventDetail", { eventId: item.id })}><Card>
      <Text style={styles.kind}>{eventTypeLabel(item.eventType as never)}</Text>
      <Text style={styles.title}>{item.headline}</Text>
      <Text style={styles.meta}>{formatDate(item.occurredAt)}{item.note ? " · note saved" : ""}</Text>
    </Card></Pressable>}
  /></Screen>;
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", margin: spacing.lg },
  kind: { color: colors.teal, fontSize: fontSize.xs, fontWeight: "800", textTransform: "uppercase" },
  title: { color: colors.navy, fontSize: fontSize.md, fontWeight: "700", marginTop: spacing.xs },
  meta: { color: colors.muted, fontSize: fontSize.sm, marginTop: spacing.sm },
});
