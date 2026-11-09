/**
 * Market-reaction pipeline wiring — Milestone 5.
 *
 * Computes §9 reactions for published events with a known event_time and
 * stores them in `market_reactions`. Run after event publish via the
 * `pnpm market:reaction` CLI (or programmatically); backfills/recomputes for
 * seeded and ingested events wherever the provider has price data.
 *
 * Idempotent: rows are upserted on (event_id, security_id), so re-running
 * never duplicates rows — it refreshes them. Events whose securities have no
 * price data get NO row (missing → nulls downstream, never fabricated).
 */
import type { Pool } from "pg";
import type { MarketDataProvider, PriceBar, SecurityRef } from "./types.js";
import { computeReaction } from "./calculate.js";

/** Minimal DB surface — accepts a Pool or a PoolClient (e.g. inside seed-db's transaction). */
export type DbLike = Pick<Pool, "query">;

export interface ReactionRunMetrics {
  provider: string;
  /** Published events with a known event_time that were scanned. */
  eventsScanned: number;
  /** Events for which a window could be formed and a row upserted. */
  reactionsUpserted: number;
  /** Upserted rows where a price (or the pct) is null. */
  reactionsWithNullPrices: number;
  /** Events skipped because the provider returned no bars for the security. */
  securitiesWithoutData: number;
  /** Events skipped because no window could be formed from the bars. */
  windowsUnformable: number;
  /** True when the time budget ran out before every event was processed. */
  incomplete: boolean;
  errors: string[];
}

interface EventRow {
  id: string;
  occurred_at: Date;
}

const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function computeAndStoreReactions(
  db: DbLike,
  provider: MarketDataProvider,
  opts: {
    eventIds?: string[];
    /** Only events that occurred within this many days (daily refresh). */
    sinceDays?: number;
    /** Stop starting new events after this many ms (serverless time limit). */
    budgetMs?: number;
  } = {},
): Promise<ReactionRunMetrics> {
  const metrics: ReactionRunMetrics = {
    provider: provider.providerName,
    eventsScanned: 0,
    reactionsUpserted: 0,
    reactionsWithNullPrices: 0,
    securitiesWithoutData: 0,
    windowsUnformable: 0,
    incomplete: false,
    errors: [],
  };
  const started = Date.now();

  const filters: string[] = [];
  const params: unknown[] = [];
  if (opts.eventIds) {
    params.push(opts.eventIds);
    filters.push(`AND e.id = ANY($${params.length}::uuid[])`);
  }
  if (opts.sinceDays !== undefined) {
    params.push(opts.sinceDays);
    filters.push(`AND e.occurred_at >= now() - make_interval(days => $${params.length}::int)`);
  }
  const eventFilter = filters.join(" ");
  const { rows: events } = await db.query<EventRow>(
    `SELECT e.id::text AS id, e.occurred_at
       FROM events e
      WHERE e.review_status = 'published' AND e.occurred_at IS NOT NULL ${eventFilter}
      ORDER BY e.occurred_at DESC`,  // newest first, so a time-limited run covers fresh news
    params,
  );
  if (events.length === 0) return metrics;
  const eventIds = events.map((e) => e.id);

  const { rows: links } = await db.query<{ event_id: string; entity_id: string }>(
    `SELECT event_id::text AS event_id, entity_id::text AS entity_id
       FROM event_entities
      WHERE event_id = ANY($1::uuid[]) AND entity_type = 'company'`,
    [eventIds],
  );
  const companiesByEvent = new Map<string, string[]>();
  for (const l of links) {
    const list = companiesByEvent.get(l.event_id) ?? [];
    list.push(l.entity_id);
    companiesByEvent.set(l.event_id, list);
  }
  const companyIds = [...new Set(links.map((l) => l.entity_id))];

  const { rows: secs } = await db.query<{
    id: string;
    company_id: string;
    exchange: string;
    ticker: string;
  }>(
    `SELECT id::text AS id, company_id::text AS company_id, exchange, ticker
       FROM securities WHERE company_id = ANY($1::uuid[])`,
    [companyIds.length > 0 ? companyIds : ["00000000-0000-0000-0000-000000000000"]],
  );
  const secsByCompany = new Map<string, { id: string; exchange: string; ticker: string }[]>();
  for (const s of secs) {
    const list = secsByCompany.get(s.company_id) ?? [];
    list.push({ id: s.id, exchange: s.exchange, ticker: s.ticker });
    secsByCompany.set(s.company_id, list);
  }

  // One reaction per event: first linked company's NSE security, falling
  // back to that company's first security.
  const chosenByEvent = new Map<string, { id: string; exchange: string; ticker: string }>();
  for (const event of events) {
    const companySecurities = (companiesByEvent.get(event.id) ?? []).flatMap(
      (cid) => secsByCompany.get(cid) ?? [],
    );
    const chosen = companySecurities.find((s) => s.exchange === "NSE") ?? companySecurities[0];
    if (chosen) chosenByEvent.set(event.id, chosen);
  }

  // Fetch each security's prices once, over the span all its events need,
  // instead of one provider call per event.
  const windowOf = (e: EventRow) => {
    const at = e.occurred_at.getTime();
    return { from: isoDate(new Date(at - 20 * DAY_MS)), to: isoDate(new Date(at + 20 * DAY_MS)) };
  };
  const spanBySecurity = new Map<string, { from: string; to: string }>();
  // Span across every event, for one benchmark fetch ("" = no events yet).
  const overall = { from: "", to: "" };
  for (const event of events) {
    const chosen = chosenByEvent.get(event.id);
    if (!chosen) continue;
    const w = windowOf(event);
    const span = spanBySecurity.get(chosen.id);
    spanBySecurity.set(chosen.id, span
      ? { from: w.from < span.from ? w.from : span.from, to: w.to > span.to ? w.to : span.to }
      : w);
    if (!overall.from || w.from < overall.from) overall.from = w.from;
    if (!overall.to || w.to > overall.to) overall.to = w.to;
  }
  const barsBySecurity = new Map<string, Promise<PriceBar[]>>();
  const barsFor = (sec: { id: string; exchange: string; ticker: string }) => {
    let p = barsBySecurity.get(sec.id);
    if (!p) {
      const span = spanBySecurity.get(sec.id)!;
      const ref: SecurityRef = { exchange: sec.exchange as SecurityRef["exchange"], ticker: sec.ticker };
      p = provider.getPrices(ref, span.from, span.to).then(async (bars) => {
        // Persist the bars we measured from (provenance for market_prices).
        if (bars.length > 0) await persistBars(db, sec.id, bars, provider.providerName);
        return bars;
      });
      barsBySecurity.set(sec.id, p);
    }
    return p;
  };
  let benchmarkAll: Promise<PriceBar[] | undefined> | undefined;
  const benchmarkFor = () => {
    if (!benchmarkAll) {
      benchmarkAll =
        provider.benchmarkId && provider.getBenchmarkPrices && overall.from
          ? provider
              .getBenchmarkPrices(provider.benchmarkId, overall.from, overall.to)
              .catch(() => undefined) // benchmark failure → nulls, not a crash
          : Promise.resolve(undefined);
    }
    return benchmarkAll;
  };
  const inWindow = (bars: PriceBar[] | undefined, w: { from: string; to: string }) =>
    bars?.filter((b) => b.date >= w.from && b.date <= w.to);

  for (const event of events) {
    if (opts.budgetMs !== undefined && Date.now() - started > opts.budgetMs) {
      metrics.incomplete = true;
      break;
    }
    metrics.eventsScanned++;
    try {
      const chosen = chosenByEvent.get(event.id);
      if (!chosen) continue; // no listed security linked — nothing to measure

      const ref: SecurityRef = {
        exchange: chosen.exchange as SecurityRef["exchange"],
        ticker: chosen.ticker,
      };
      const w = windowOf(event);
      const bars = inWindow(await barsFor(chosen), w) ?? [];
      if (bars.length === 0) {
        metrics.securitiesWithoutData++;
        continue; // missing data → no row, never fabricated
      }

      const benchmarkBars = inWindow(await benchmarkFor(), w);

      const reaction = computeReaction({
        eventTime: event.occurred_at.toISOString(),
        exchange: ref.exchange,
        securityTicker: ref.ticker,
        securityBars: bars,
        benchmarkBars,
        benchmarkName: provider.benchmarkName,
        providerName: provider.providerName,
        licenseMetadata: provider.licenseMetadata,
      });
      if (!reaction) {
        metrics.windowsUnformable++;
        continue;
      }

      await db.query(
        `INSERT INTO market_reactions
           (event_id, security_id, price_before, price_after, pct_change,
            benchmark_name, benchmark_pct_change, relative_change,
            window_definition, window_start, window_end, provider, license_metadata)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12,$13)
         ON CONFLICT (event_id, security_id) DO UPDATE SET
           price_before = EXCLUDED.price_before,
           price_after = EXCLUDED.price_after,
           pct_change = EXCLUDED.pct_change,
           benchmark_name = EXCLUDED.benchmark_name,
           benchmark_pct_change = EXCLUDED.benchmark_pct_change,
           relative_change = EXCLUDED.relative_change,
           window_definition = EXCLUDED.window_definition,
           window_start = EXCLUDED.window_start,
           window_end = EXCLUDED.window_end,
           provider = EXCLUDED.provider,
           license_metadata = EXCLUDED.license_metadata`,
        [
          event.id,
          chosen.id,
          reaction.priceBefore,
          reaction.priceAfter,
          reaction.pctChange,
          reaction.benchmarkName,
          reaction.benchmarkPctChange,
          reaction.relativeChange,
          reaction.windowDefinition,
          reaction.windowStart,
          reaction.windowEnd,
          reaction.provider,
          reaction.licenseMetadata ?? null,
        ],
      );
      metrics.reactionsUpserted++;
      if (
        reaction.priceBefore == null ||
        reaction.priceAfter == null ||
        reaction.pctChange == null
      ) {
        metrics.reactionsWithNullPrices++;
      }
    } catch (err) {
      // One bad event must not abort the whole backfill (spec §17).
      metrics.errors.push(`${event.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return metrics;
}

async function persistBars(
  db: DbLike,
  securityId: string,
  bars: PriceBar[],
  providerName: string,
): Promise<void> {
  // One statement per security: the database can be a long round trip away
  // from the serverless function, so per-bar inserts are far too slow.
  await db.query(
    `INSERT INTO market_prices (security_id, ts, close, source_provider)
     SELECT $1::uuid, (d || 'T15:30:00+05:30')::timestamptz, c, $4
       FROM unnest($2::text[], $3::float8[]) AS t(d, c)
     ON CONFLICT (security_id, ts) DO NOTHING`,
    [securityId, bars.map((b) => b.date), bars.map((b) => b.close), providerName],
  );
}
