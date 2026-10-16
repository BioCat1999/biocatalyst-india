/**
 * Universal search (spec §4.6): one input, results grouped by entity
 * type — companies, drugs, trials, events. Debounced for signed-in members.
 *
 * Tab-scoped search: each bottom tab's header search button opens this
 * screen with a `scope` param (Feed -> events, Watchlist -> companies),
 * restricting the visible groups to what is relevant on that tab.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SearchResults } from "@biocatalyst/api-client";
import { ApiError } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import type { MainTabParamList, RootStackParamList, SearchScope } from "../navigation/types";
import { SEARCH_SCOPE_LABELS } from "../navigation/types";
import { Card, EmptyView, Screen } from "../components/Ui";
import { colors, fontSize, radius, spacing } from "../theme";
import { formatDate } from "../lib/format";

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Search">,
  NativeStackScreenProps<RootStackParamList>
>;

const GROUPS: SearchScope[] = ["events", "companies", "drugs", "trials"];

export function SearchScreen({ navigation, route }: Props) {
  const scope = route.params?.scope;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await getApiClient().search(q);
        setResults(r);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : String(err));
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  const visible: SearchScope[] = scope ? [scope] : GROUPS;
  const counts: Record<SearchScope, number> = {
    events: results?.events.length ?? 0,
    companies: results?.companies.length ?? 0,
    drugs: results?.drugs.length ?? 0,
    trials: results?.trials.length ?? 0,
  };
  const total = visible.reduce((n, g) => n + counts[g], 0);

  return (
    <Screen>
      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search companies, drugs, trials…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={scope !== undefined}
          returnKeyType="search"
          style={styles.input}
          accessibilityLabel="Search"
        />
        {loading && <ActivityIndicator color={colors.teal} style={styles.spinner} />}
      </View>
      {scope && (
        <View style={styles.scopeRow}>
          <Text style={styles.scopeText}>Scoped to {SEARCH_SCOPE_LABELS[scope]}</Text>
          <Pressable
            onPress={() => navigation.setParams({ scope: undefined })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search scope"
          >
            <Text style={styles.scopeClear}>{"\u2715"}</Text>
          </Pressable>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <ScrollView keyboardShouldPersistTaps="handled">
        {query.trim().length >= 2 && !loading && total === 0 && !error && (
          <EmptyView message={`No results for “${query.trim()}”.`} />
        )}
        {results && total > 0 && (
          <>
            {visible.includes("companies") && results.companies.length > 0 && (
              <>
                <Text style={styles.group}>Companies</Text>
                {results.companies.map((c) => (
                  <Pressable key={c.id} onPress={() => navigation.navigate("Company", { slug: c.slug })}>
                    <Card>
                      <Text style={styles.link}>{c.canonicalName}</Text>
                    </Card>
                  </Pressable>
                ))}
              </>
            )}
            {visible.includes("drugs") && results.drugs.length > 0 && (
              <>
                <Text style={styles.group}>Drugs</Text>
                {results.drugs.map((d) => (
                  <Pressable key={d.id} onPress={() => navigation.navigate("Drug", { slug: d.slug })}>
                    <Card>
                      <Text style={styles.link}>{d.canonicalName}</Text>
                    </Card>
                  </Pressable>
                ))}
              </>
            )}
            {visible.includes("trials") && results.trials.length > 0 && (
              <>
                <Text style={styles.group}>Trials</Text>
                {results.trials.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() =>
                      navigation.navigate("Trial", { registry: t.registry, trialId: t.registryTrialId })
                    }
                  >
                    <Card>
                      <Text style={styles.link}>{t.registryTrialId}</Text>
                      <Text style={styles.sub} numberOfLines={2}>
                        {t.title}
                      </Text>
                    </Card>
                  </Pressable>
                ))}
              </>
            )}
            {visible.includes("events") && results.events.length > 0 && (
              <>
                <Text style={styles.group}>Events</Text>
                {results.events.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => navigation.navigate("EventDetail", { eventId: e.id })}
                  >
                    <Card>
                      <Text style={styles.link}>{e.headline}</Text>
                      <Text style={styles.sub}>{formatDate(e.occurredAt)}</Text>
                    </Card>
                  </Pressable>
                ))}
              </>
            )}
          </>
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, fontSize: fontSize.md, color: colors.ink, paddingVertical: spacing.md },
  spinner: { marginLeft: spacing.sm },
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.navy,
    borderRadius: radius,
  },
  scopeText: { fontSize: fontSize.sm, color: colors.white, fontWeight: "600" },
  scopeClear: { fontSize: fontSize.md, color: colors.white, fontWeight: "700" },
  error: { color: colors.red, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  group: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.navy,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  link: { fontSize: fontSize.md, color: colors.teal, fontWeight: "600" },
  sub: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs },
});
