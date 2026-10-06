/**
 * Seed the Postgres database from the Milestone 1 fixtures (seed.ts).
 *
 * Idempotent: TRUNCATEs all domain tables first, then inserts everything in
 * dependency order inside one transaction. Fixture string ids ("co-sun-pharma",
 * "evt-...") are preserved in `legacy_id` columns; runtime code uses UUIDs.
 *
 * Usage: `pnpm --filter @biocatalyst/data seed:db` (DATABASE_URL must point at
 * the target database).
 */
import type { Pool, PoolClient } from "pg";
import { getPool, closePool } from "@biocatalyst/db";
import {
  FixtureMarketDataProvider,
  computeAndStoreReactions,
} from "@biocatalyst/market-data";
import {
  allEvents,
  companies,
  drugs,
  trials,
} from "./seed.js";
import { globalCompanies } from "./global-companies.js";
import { ipoCompanySeeds } from "./ipo-watchlist.js";

/** Full catalog: Indian companies + global pharma majors + IPO watchlist. */
export const allCompanies = [...companies, ...globalCompanies, ...ipoCompanySeeds];

async function getOrCreateIndication(
  client: PoolClient,
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const hit = cache.get(name);
  if (hit) return hit;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO indications (canonical_name)
     VALUES ($1)
     ON CONFLICT (canonical_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
     RETURNING id::text AS id`,
    [name],
  );
  cache.set(name, rows[0].id);
  return rows[0].id;
}

export async function seedDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Clean slate — CASCADE handles all dependent rows.
    await client.query(`TRUNCATE
      alerts, watchlist_items, users, market_reactions, market_prices,
      event_sources, event_entities, events, trial_indications, trial_drugs,
      trials, drug_indications, drug_company_links, drug_aliases, drugs,
      company_aliases, securities, companies, sources, indications
      RESTART IDENTITY CASCADE`);

    const companyUuid = new Map<string, string>();
    const drugUuid = new Map<string, string>();
    const trialUuid = new Map<string, string>();
    const sourceUuid = new Map<string, string>(); // legacy source id -> uuid
    const sourceUuidByUrl = new Map<string, string>();
    const indicationCache = new Map<string, string>();

    // Companies + securities + aliases
    for (const c of allCompanies) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO companies (legacy_id, canonical_name, slug, description, country, website)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text AS id`,
        [c.id, c.canonicalName, c.slug, c.description, c.country, c.website],
      );
      const uuid = rows[0].id;
      companyUuid.set(c.id, uuid);
      for (const s of c.securities) {
        const sec = await client.query<{ id: string }>(
          `INSERT INTO securities (company_id, exchange, ticker, isin, currency)
           VALUES ($1::uuid,$2,$3,$4,$5) RETURNING id::text AS id`,
          [uuid, s.exchange, s.ticker, s.isin ?? null, s.currency],
        );
      }
      for (const alias of c.aliases) {
        await client.query(
          `INSERT INTO company_aliases (company_id, alias, alias_type)
           VALUES ($1::uuid,$2,'curated') ON CONFLICT DO NOTHING`,
          [uuid, alias],
        );
      }
    }

    // Drugs + aliases + company links + indications
    for (const d of drugs) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO drugs (legacy_id, canonical_name, slug, modality, mechanism)
         VALUES ($1,$2,$3,$4,$5) RETURNING id::text AS id`,
        [d.id, d.canonicalName, d.slug, d.modality ?? null, d.mechanism ?? null],
      );
      const uuid = rows[0].id;
      drugUuid.set(d.id, uuid);
      for (const alias of d.aliases) {
        await client.query(
          `INSERT INTO drug_aliases (drug_id, alias) VALUES ($1::uuid,$2)
           ON CONFLICT DO NOTHING`,
          [uuid, alias],
        );
      }
      for (const link of d.companyLinks) {
        const companyId = companyUuid.get(link.companyId);
        if (!companyId) throw new Error(`seed: unknown company ${link.companyId}`);
        await client.query(
          `INSERT INTO drug_company_links (drug_id, company_id, relationship_type)
           VALUES ($1::uuid,$2::uuid,$3) ON CONFLICT DO NOTHING`,
          [uuid, companyId, link.relationshipType],
        );
      }
      for (const ind of d.indications) {
        const indId = await getOrCreateIndication(client, ind, indicationCache);
        await client.query(
          `INSERT INTO drug_indications (drug_id, indication_id)
           VALUES ($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`,
          [uuid, indId],
        );
      }
    }

    // Trials + trial_drugs + trial_indications
    for (const t of trials) {
      const sponsorUuid = t.sponsorCompanyId ? companyUuid.get(t.sponsorCompanyId) : undefined;
      if (t.sponsorCompanyId && !sponsorUuid) {
        throw new Error(`seed: unknown sponsor ${t.sponsorCompanyId}`);
      }
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO trials (legacy_id, registry, registry_trial_id, title, phase,
                             status, enrollment, sponsor_company_id, start_date,
                             primary_completion_date, source_url, primary_endpoints)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid,$9::date,$10::date,$11,$12)
         RETURNING id::text AS id`,
        [
          t.id, t.registry, t.registryTrialId, t.title, t.phase, t.status,
          t.enrollment ?? null, sponsorUuid ?? null,
          t.startDate ?? null, t.primaryCompletionDate ?? null,
          t.sourceUrl, t.primaryEndpoints ?? null,
        ],
      );
      const uuid = rows[0].id;
      trialUuid.set(t.id, uuid);
      for (const drugId of t.drugIds) {
        const drugU = drugUuid.get(drugId);
        if (!drugU) throw new Error(`seed: unknown drug ${drugId}`);
        await client.query(
          `INSERT INTO trial_drugs (trial_id, drug_id, role)
           VALUES ($1::uuid,$2::uuid,'intervention') ON CONFLICT DO NOTHING`,
          [uuid, drugU],
        );
      }
      for (const ind of t.indications) {
        const indId = await getOrCreateIndication(client, ind, indicationCache);
        await client.query(
          `INSERT INTO trial_indications (trial_id, indication_id)
           VALUES ($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`,
          [uuid, indId],
        );
      }
    }

    // Events + sources + entities + market reactions
    let eventCount = 0;
    for (const e of allEvents) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO events (legacy_id, event_type, occurred_at, published_at,
                             headline, factual_summary, catalyst_summary,
                             confidence, review_status, indication, phase, outcome)
         VALUES ($1,$2,$3::timestamptz,$4::timestamptz,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id::text AS id`,
        [
          e.id, e.eventType, e.occurredAt, e.publishedAt, e.headline,
          e.summary, e.catalystSummary, e.confidence, e.reviewStatus,
          e.indication ?? null, e.phase ?? null, e.outcome ?? null,
        ],
      );
      const eventUuid = rows[0].id;
      eventCount++;

      for (const s of e.sources) {
        // Deduplicate sources on canonical URL (spec §7).
        const found = sourceUuidByUrl.get(s.url);
        let sUuid: string;
        if (found) {
          sUuid = found;
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO sources (legacy_id, title, publisher, url, published_at, retrieved_at)
             VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz)
             ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url
             RETURNING id::text AS id`,
            [s.id, s.title, s.publisher, s.url, s.publishedAt || null, s.retrievedAt],
          );
          const newId = ins.rows[0]?.id;
          if (!newId) throw new Error(`seed: source insert failed for ${s.url}`);
          sUuid = newId;
          sourceUuidByUrl.set(s.url, sUuid);
        }
        sourceUuid.set(s.id, sUuid);
        await client.query(
          `INSERT INTO event_sources (event_id, source_id, is_primary)
           VALUES ($1::uuid,$2::uuid,$3) ON CONFLICT DO NOTHING`,
          [eventUuid, sUuid, s.isPrimary],
        );
      }

      const link = async (type: "company" | "drug" | "trial", legacyId: string, map: Map<string, string>) => {
        const target = map.get(legacyId);
        if (!target) throw new Error(`seed: unknown ${type} ${legacyId} on event ${e.id}`);
        await client.query(
          `INSERT INTO event_entities (event_id, entity_type, entity_id)
           VALUES ($1::uuid,$2,$3::uuid) ON CONFLICT DO NOTHING`,
          [eventUuid, type, target],
        );
      };
      for (const id of e.companyIds) await link("company", id, companyUuid);
      for (const id of e.drugIds) await link("drug", id, drugUuid);
      for (const id of e.trialIds) await link("trial", id, trialUuid);
    }

    // Market reactions (M5, spec §9): computed from the fixture price series
    // via the market-reaction pipeline — not hand-seeded. The fixture
    // provider's bars are persisted to market_prices by the pipeline itself.
    // Events whose securities have no fixture prices (e.g. MANKIND) get no
    // row: missing data stays null, never fabricated.
    const mrMetrics = await computeAndStoreReactions(
      client,
      new FixtureMarketDataProvider(),
    );
    console.log(
      `seed: market reactions computed: ${mrMetrics.reactionsUpserted} upserted, ` +
        `${mrMetrics.securitiesWithoutData} without price data ` +
        `(provider=${mrMetrics.provider})`,
    );

    await client.query("COMMIT");
    console.log(
      `seed: ${allCompanies.length} companies, ${drugs.length} drugs, ${trials.length} trials, ` +
        `${eventCount} events, ${sourceUuidByUrl.size} unique sources, ` +
        `${indicationCache.size} indications`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// CLI entry: `pnpm --filter @biocatalyst/data seed:db`
const isCli = process.argv[1]?.endsWith("seed-db.js");
if (isCli) {
  const pool = getPool();
  try {
    await seedDatabase(pool);
  } finally {
    await closePool();
  }
}
