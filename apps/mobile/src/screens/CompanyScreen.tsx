/**
 * Company page (spec §4.3): name, NSE/BSE tickers, description,
 * follow/unfollow, associated drugs and trials, recent catalyst timeline.
 */
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Quote } from "@biocatalyst/api-client";
import { getApiClient } from "../api";
import type { RootStackParamList } from "../navigation/types";
import { EventCard } from "../components/EventCard";
import { FollowButton } from "../components/FollowButton";
import { Card, EmptyView, ErrorView, LoadingView, Screen, SectionTitle } from "../components/Ui";
import { useApiCall } from "../hooks/useApiCall";
import { colors, fontSize, spacing } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Company">;

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

function formatPrice(q: Quote): string {
  const symbol = CURRENCY_SYMBOL[q.currency] ?? `${q.currency} `;
  return `${symbol}${q.price!.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Delayed price header: latest quote + day change, then related news below. */
function PriceCard({ quote }: { quote: Quote }) {
  if (quote.price === null) {
    return (
      <Card>
        <Text style={styles.mutedNote}>Price unavailable for {quote.ticker}.</Text>
        <Text style={styles.disclaimer}>Delayed quotes · Yahoo Finance · not investment advice</Text>
      </Card>
    );
  }
  const up = (quote.changePct ?? 0) >= 0;
  return (
    <Card>
      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatPrice(quote)}</Text>
        {quote.changePct !== null && (
          <Text style={[styles.change, up ? styles.changeUp : styles.changeDown]}>
            {up ? "+" : ""}
            {quote.changePct.toFixed(2)}%
          </Text>
        )}
      </View>
      <Text style={styles.priceMeta}>
        {quote.ticker} ({quote.exchange})
        {quote.asOf ? ` · as of ${quote.asOf}` : ""}
      </Text>
      <Text style={styles.disclaimer}>Delayed ~15 min · Yahoo Finance · not investment advice</Text>
    </Card>
  );
}

export function CompanyScreen({ route, navigation }: Props) {
  const { slug } = route.params;
  const company = useApiCall(() => getApiClient().getCompany(slug), slug);
  const events = useApiCall(() => getApiClient().getCompanyEvents(slug), slug);
  const quote = useApiCall(() => getApiClient().getQuote(slug), slug);
  const links = useApiCall(() => getApiClient().getGlobalLinks(slug), slug);
  const patents = useApiCall(() => getApiClient().getCompanyPatents(slug), slug);

  if (company.loading)
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  if (company.error)
    return (
      <Screen>
        <ErrorView message={company.error.message} onRetry={company.retry} />
      </Screen>
    );
  if (!company.data)
    return (
      <Screen>
        <EmptyView message="Company not found." />
      </Screen>
    );

  const c = company.data;
  return (
    <Screen>
      <ScrollView>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.name}>{c.canonicalName}</Text>
            <Text style={styles.tickers}>
              {c.securities.map((s) => `${s.ticker} (${s.exchange})`).join(" · ") || "Unlisted"}
            </Text>
          </View>
          <FollowButton entityType="company" entityId={c.id} />
        </View>
        {quote.data && <PriceCard quote={quote.data} />}
        {c.description ? (
          <Card>
            <Text style={styles.body}>{c.description}</Text>
          </Card>
        ) : null}
        {c.globalFootprint ? (
          <>
            <SectionTitle>Global footprint</SectionTitle>
            <Card>
              <Text style={styles.body}>{c.globalFootprint}</Text>
            </Card>
          </>
        ) : null}
        {patents.data && patents.data.items.length > 0 && (
          <>
            <SectionTitle>Patents ({patents.data.items.length})</SectionTitle>
            {patents.data.items.slice(0, 5).map((p) => (
              <Card key={`${p.patentNumber}-${p.applNo}-${p.productNo}`}>
                <Text style={styles.patentNumber}>US {p.patentNumber}</Text>
                <Text style={styles.linkTitle}>{p.tradeName}</Text>
                <Text style={styles.mutedNote}>
                  {p.activeIngredient} · expires {p.expiryDate ?? "—"}
                </Text>
              </Card>
            ))}
          </>
        )}
        {links.data && links.data.items.length > 0 && (
          <>
            <SectionTitle>Global links</SectionTitle>
            {links.data.items.map((l) => (
              <Pressable
                key={l.id}
                onPress={() =>
                  l.otherCompany && navigation.navigate("Company", { slug: l.otherCompany.slug })
                }
              >
                <Card>
                  <Text style={styles.linkKind}>{l.kind.replace(/_/g, " ")}</Text>
                  {l.otherCompany && (
                    <Text style={styles.link}>{l.otherCompany.canonicalName}</Text>
                  )}
                  <Text style={styles.linkTitle}>{l.title}</Text>
                  <Text style={styles.mutedNote}>{l.description}</Text>
                </Card>
              </Pressable>
            ))}
          </>
        )}

        <SectionTitle>Drugs ({c.drugs.length})</SectionTitle>
        {c.drugs.map((d) => (
          <Pressable key={d.id} onPress={() => navigation.navigate("Drug", { slug: d.slug })}>
            <Card>
              <Text style={styles.link}>{d.canonicalName}</Text>
            </Card>
          </Pressable>
        ))}
        {c.drugs.length === 0 && (
          <Text style={styles.mutedNote}>No curated drugs linked yet.</Text>
        )}

        <SectionTitle>Trials ({c.trials.length})</SectionTitle>
        {c.trials.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => navigation.navigate("Trial", { registry: t.registry, trialId: t.registryTrialId })}
          >
            <Card>
              <Text style={styles.link}>{t.registryTrialId}</Text>
              <Text style={styles.mutedNote}>
                {t.phase} · {t.status}
              </Text>
            </Card>
          </Pressable>
        ))}
        {c.trials.length === 0 && (
          <Text style={styles.mutedNote}>No curated trials linked yet.</Text>
        )}

        <SectionTitle>Recent catalysts</SectionTitle>
        {events.loading && <LoadingView label="Loading events…" />}
        {events.error && <ErrorView message={events.error.message} onRetry={events.retry} />}
        {events.data?.items.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            onPress={() => navigation.navigate("EventDetail", { eventId: e.id })}
          />
        ))}
        {events.data && events.data.items.length === 0 && (
          <Text style={styles.mutedNote}>No catalyst events recorded yet.</Text>
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
  tickers: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22 },
  link: { fontSize: fontSize.md, color: colors.teal, fontWeight: "600" },
  linkKind: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  linkTitle: { fontSize: fontSize.sm, color: colors.ink, fontWeight: "600", marginTop: spacing.xs },
  patentNumber: { fontSize: fontSize.sm, color: colors.teal, fontWeight: "700" },
  mutedNote: { fontSize: fontSize.sm, color: colors.muted, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  price: { fontSize: fontSize.title, fontWeight: "700", color: colors.navy },
  change: { fontSize: fontSize.md, fontWeight: "700" },
  changeUp: { color: colors.green },
  changeDown: { color: colors.red },
  priceMeta: { fontSize: fontSize.sm, color: colors.muted, marginTop: spacing.xs },
  disclaimer: { fontSize: fontSize.xs, color: colors.muted, marginTop: spacing.xs, fontStyle: "italic" },
});
