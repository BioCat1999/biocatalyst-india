/**
 * Data-access layer for Milestone 2.
 *
 * Same function names and parameters as the Milestone 1 fixture layer, now
 * backed by PostgreSQL via @biocatalyst/db. Functions are async (DB I/O);
 * callers `await` them. No other contract changes.
 *
 * Spec references: §5 (canonical model), §6 (event taxonomy), §10
 * (Postgres full-text/trigram search), §12 (API surface), §22 (card contract).
 */
import type {
  CatalystEvent,
  Company,
  Drug,
  DrugCompanyLink,
  EventCard,
  EventFilters,
  EventType,
  MarketReaction,
  Outcome,
  Paginated,
  ReviewStatus,
  Security,
  SourceRecord,
  Trial,
  TrialPhase,
  TrialStatus,
} from "@biocatalyst/types";
import { getPool } from "@biocatalyst/db";
import { globalFootprints } from "./global-footprint.js";
import { globalLinks } from "./global-links.js";
import { globalCompanies } from "./global-companies.js";
import { ipoCatalog } from "./ipo-watchlist.js";
import { companies as indianCompanies } from "./seed.js";
import type { GlobalLink } from "@biocatalyst/types";

export { EVENT_TYPES } from "@biocatalyst/types";
export type { CatalystEvent, Company, Drug, Trial };

/* ------------------------------------------------------------------ */
/* Row types                                                           */
/* ------------------------------------------------------------------ */

interface CompanyRow {
  id: string;
  canonical_name: string;
  slug: string;
  description: string;
  country: string;
  website: string;
}
interface SecurityRow {
  exchange: string;
  ticker: string;
  currency: string;
  isin: string | null;
}
interface CompanyDirectoryRow extends CompanyRow {
  securities: SecurityRow[];
  aliases: string[];
}
interface DrugRow {
  id: string;
  canonical_name: string;
  slug: string;
  modality: string | null;
  mechanism: string | null;
}
interface TrialRow {
  id: string;
  registry: string;
  registry_trial_id: string;
  title: string;
  phase: string | null;
  status: string | null;
  enrollment: number | null;
  sponsor_company_id: string | null;
  start_date: string | null; // DATE comes back as YYYY-MM-DD via pg parsing
  primary_completion_date: string | null;
  source_url: string;
  primary_endpoints: string[] | null;
}
interface EventRow {
  id: string;
  event_type: string;
  occurred_at: Date;
  published_at: Date | null;
  headline: string;
  factual_summary: string;
  catalyst_summary: string;
  confidence: number | null;
  review_status: string;
  indication: string | null;
  phase: string | null;
  outcome: string | null;
}
interface EntityRow {
  event_id: string;
  entity_type: "company" | "drug" | "trial";
  entity_id: string;
}
interface EventSourceRow {
  event_id: string;
  id: string;
  title: string | null;
  publisher: string;
  url: string;
  published_at: Date | null;
  retrieved_at: Date;
  is_primary: boolean;
}
interface MarketReactionRow {
  event_id: string;
  ticker: string;
  exchange: string;
  price_before: number | null;
  price_after: number | null;
  pct_change: number | null;
  benchmark_name: string | null;
  benchmark_pct_change: number | null;
  relative_change: number | null;
  window_definition: string;
  window_start: Date | null;
  window_end: Date | null;
  provider: string;
  license_metadata: string | null;
}

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

function toSecurity(r: SecurityRow): Security {
  return {
    exchange: r.exchange as Security["exchange"],
    ticker: r.ticker,
    currency: r.currency as Security["currency"],
    ...(r.isin ? { isin: r.isin } : {}),
  };
}

async function fetchSecurities(companyIds: string[]): Promise<Map<string, Security[]>> {
  if (companyIds.length === 0) return new Map();
  const { rows } = await getPool().query<
    SecurityRow & { company_id: string }
  >(
    `SELECT company_id, exchange, ticker, currency, isin
       FROM securities
      WHERE company_id = ANY($1)
      ORDER BY exchange`,
    [companyIds],
  );
  const map = new Map<string, Security[]>();
  for (const r of rows) {
    const list = map.get(r.company_id) ?? [];
    list.push(toSecurity(r));
    map.set(r.company_id, list);
  }
  return map;
}

async function fetchAliases(
  table: "company_aliases" | "drug_aliases",
  idCol: "company_id" | "drug_id",
  ids: string[],
): Promise<Map<string, string[]>> {
  if (ids.length === 0) return new Map();
  const { rows } = await getPool().query<{ entity_id: string; alias: string }>(
    `SELECT ${idCol} AS entity_id, alias FROM ${table} WHERE ${idCol} = ANY($1) ORDER BY alias`,
    [ids],
  );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.entity_id) ?? [];
    list.push(r.alias);
    map.set(r.entity_id, list);
  }
  return map;
}

function mapCompany(
  r: CompanyRow,
  securities: Security[],
  aliases: string[],
): Company {
  const footprint = globalFootprints[r.slug];
  return {
    id: r.id,
    slug: r.slug,
    canonicalName: r.canonical_name,
    description: r.description,
    country: r.country,
    website: r.website,
    aliases,
    securities,
    ...(footprint ? { globalFootprint: footprint } : {}),
  };
}

async function hydrateCompanies(rows: CompanyRow[]): Promise<Company[]> {
  const ids = rows.map((r) => r.id);
  const [secMap, aliasMap] = await Promise.all([
    fetchSecurities(ids),
    fetchAliases("company_aliases", "company_id", ids),
  ]);
  return rows.map((r) =>
    mapCompany(r, secMap.get(r.id) ?? [], aliasMap.get(r.id) ?? []),
  );
}

async function hydrateDrugs(rows: DrugRow[]): Promise<Drug[]> {
  const ids = rows.map((r) => r.id);
  const pool = getPool();
  const [aliasMap, indRows, linkRows] = await Promise.all([
    fetchAliases("drug_aliases", "drug_id", ids),
    ids.length
      ? pool.query<{ drug_id: string; canonical_name: string }>(
          `SELECT di.drug_id, i.canonical_name
             FROM drug_indications di
             JOIN indications i ON i.id = di.indication_id
            WHERE di.drug_id = ANY($1)
            ORDER BY i.canonical_name`,
          [ids],
        )
      : Promise.resolve({ rows: [] as { drug_id: string; canonical_name: string }[] }),
    ids.length
      ? pool.query<{ drug_id: string; company_id: string; relationship_type: string }>(
          `SELECT drug_id, company_id, relationship_type
             FROM drug_company_links
            WHERE drug_id = ANY($1)`,
          [ids],
        )
      : Promise.resolve({
          rows: [] as { drug_id: string; company_id: string; relationship_type: string }[],
        }),
  ]);
  const indMap = new Map<string, string[]>();
  for (const r of indRows.rows) {
    const list = indMap.get(r.drug_id) ?? [];
    list.push(r.canonical_name);
    indMap.set(r.drug_id, list);
  }
  const linkMap = new Map<string, DrugCompanyLink[]>();
  for (const r of linkRows.rows) {
    const list = linkMap.get(r.drug_id) ?? [];
    list.push({
      companyId: r.company_id,
      relationshipType: r.relationship_type as DrugCompanyLink["relationshipType"],
    });
    linkMap.set(r.drug_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    canonicalName: r.canonical_name,
    aliases: aliasMap.get(r.id) ?? [],
    ...(r.modality ? { modality: r.modality } : {}),
    ...(r.mechanism ? { mechanism: r.mechanism } : {}),
    indications: indMap.get(r.id) ?? [],
    companyLinks: linkMap.get(r.id) ?? [],
  }));
}

function fmtDate(d: string | Date | null): string | undefined {
  if (!d) return undefined;
  // pg returns DATE as YYYY-MM-DD string (or Date); normalize to YYYY-MM-DD.
  return d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10);
}

async function hydrateTrials(rows: TrialRow[]): Promise<Trial[]> {
  const ids = rows.map((r) => r.id);
  const pool = getPool();
  const [drugRows, indRows] = await Promise.all([
    ids.length
      ? pool.query<{ trial_id: string; drug_id: string }>(
          `SELECT trial_id, drug_id::text AS drug_id FROM trial_drugs WHERE trial_id = ANY($1)`,
          [ids],
        )
      : Promise.resolve({ rows: [] as { trial_id: string; drug_id: string }[] }),
    ids.length
      ? pool.query<{ trial_id: string; canonical_name: string }>(
          `SELECT ti.trial_id, i.canonical_name
             FROM trial_indications ti
             JOIN indications i ON i.id = ti.indication_id
            WHERE ti.trial_id = ANY($1)
            ORDER BY i.canonical_name`,
          [ids],
        )
      : Promise.resolve({ rows: [] as { trial_id: string; canonical_name: string }[] }),
  ]);
  const drugMap = new Map<string, string[]>();
  for (const r of drugRows.rows) {
    const list = drugMap.get(r.trial_id) ?? [];
    list.push(r.drug_id);
    drugMap.set(r.trial_id, list);
  }
  const indMap = new Map<string, string[]>();
  for (const r of indRows.rows) {
    const list = indMap.get(r.trial_id) ?? [];
    list.push(r.canonical_name);
    indMap.set(r.trial_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    registry: r.registry as Trial["registry"],
    registryTrialId: r.registry_trial_id,
    title: r.title,
    phase: (r.phase ?? "Preclinical") as TrialPhase,
    status: (r.status ?? "Recruiting") as TrialStatus,
    ...(r.enrollment != null ? { enrollment: r.enrollment } : {}),
    ...(r.sponsor_company_id ? { sponsorCompanyId: r.sponsor_company_id } : {}),
    ...(fmtDate(r.start_date) ? { startDate: fmtDate(r.start_date)! } : {}),
    ...(fmtDate(r.primary_completion_date)
      ? { primaryCompletionDate: fmtDate(r.primary_completion_date)! }
      : {}),
    sourceUrl: r.source_url,
    drugIds: drugMap.get(r.id) ?? [],
    indications: indMap.get(r.id) ?? [],
    ...(r.primary_endpoints ? { primaryEndpoints: r.primary_endpoints } : {}),
  }));
}

function mapSource(r: EventSourceRow): SourceRecord {
  return {
    id: r.id,
    title: r.title ?? "",
    publisher: r.publisher,
    url: r.url,
    publishedAt: r.published_at ? r.published_at.toISOString() : "",
    retrievedAt: r.retrieved_at.toISOString(),
    isPrimary: r.is_primary,
  };
}

function mapMarketReaction(r: MarketReactionRow): MarketReaction {
  return {
    windowDefinition: r.window_definition,
    windowStart: r.window_start ? r.window_start.toISOString() : null,
    windowEnd: r.window_end ? r.window_end.toISOString() : null,
    securityTicker: r.ticker,
    exchange: r.exchange as MarketReaction["exchange"],
    priceBefore: r.price_before,
    priceAfter: r.price_after,
    pctChange: r.pct_change,
    ...(r.benchmark_name ? { benchmarkName: r.benchmark_name } : {}),
    ...(r.benchmark_pct_change != null ? { benchmarkPctChange: r.benchmark_pct_change } : {}),
    ...(r.relative_change != null ? { relativeChange: r.relative_change } : {}),
    provider: r.provider,
    ...(r.license_metadata ? { licenseMetadata: r.license_metadata } : {}),
  };
}

/** Fetch full event graphs for the given ids, preserving input order. */
async function hydrateEvents(rows: EventRow[]): Promise<CatalystEvent[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const pool = getPool();
  const [entityRes, sourceRes, mrRes] = await Promise.all([
    pool.query<EntityRow>(
      `SELECT event_id, entity_type, entity_id::text AS entity_id
         FROM event_entities WHERE event_id = ANY($1::uuid[])`,
      [ids],
    ),
    pool.query<EventSourceRow>(
      `SELECT es.event_id, s.id::text AS id, s.title, s.publisher, s.url,
              s.published_at, s.retrieved_at, es.is_primary
         FROM event_sources es
         JOIN sources s ON s.id = es.source_id
        WHERE es.event_id = ANY($1::uuid[])
        ORDER BY es.is_primary DESC, s.published_at`,
      [ids],
    ),
    pool.query<MarketReactionRow>(
      `SELECT mr.event_id, sec.ticker, sec.exchange, mr.price_before, mr.price_after,
              mr.pct_change, mr.benchmark_name, mr.benchmark_pct_change,
              mr.relative_change, mr.window_definition, mr.window_start,
              mr.window_end, mr.provider, mr.license_metadata
         FROM market_reactions mr
         JOIN securities sec ON sec.id = mr.security_id
        WHERE mr.event_id = ANY($1::uuid[])`,
      [ids],
    ),
  ]);

  const entMap = new Map<string, EntityRow[]>();
  for (const r of entityRes.rows) {
    const list = entMap.get(r.event_id) ?? [];
    list.push(r);
    entMap.set(r.event_id, list);
  }
  const srcMap = new Map<string, SourceRecord[]>();
  for (const r of sourceRes.rows) {
    const list = srcMap.get(r.event_id) ?? [];
    list.push(mapSource(r));
    srcMap.set(r.event_id, list);
  }
  const mrMap = new Map<string, MarketReaction>();
  for (const r of mrRes.rows) mrMap.set(r.event_id, mapMarketReaction(r));

  return rows.map((r) => {
    const ents = entMap.get(r.id) ?? [];
    return {
      id: r.id,
      eventType: r.event_type as EventType,
      occurredAt: r.occurred_at.toISOString(),
      publishedAt: r.published_at ? r.published_at.toISOString() : r.occurred_at.toISOString(),
      headline: r.headline,
      fact: r.factual_summary,
      summary: r.factual_summary, // factual_summary stores the 80–150 word summary
      catalystSummary: r.catalyst_summary,
      confidence: r.confidence ?? 0,
      reviewStatus: (r.review_status ?? "published") as ReviewStatus,
      companyIds: ents.filter((e) => e.entity_type === "company").map((e) => e.entity_id),
      drugIds: ents.filter((e) => e.entity_type === "drug").map((e) => e.entity_id),
      trialIds: ents.filter((e) => e.entity_type === "trial").map((e) => e.entity_id),
      ...(r.indication ? { indication: r.indication } : {}),
      ...(r.phase ? { phase: r.phase as TrialPhase } : {}),
      ...(r.outcome ? { outcome: r.outcome as Outcome } : {}),
      sources: srcMap.get(r.id) ?? [],
      ...(mrMap.get(r.id) ? { marketReaction: mrMap.get(r.id)! } : {}),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 10;

export async function listEvents(
  filters: EventFilters = {},
  cursor?: string,
  limit: number = PAGE_SIZE,
): Promise<Paginated<CatalystEvent>> {
  const pool = getPool();
  const where: string[] = [];
  const params: unknown[] = [];
  let n = 1;

  if (filters.eventType) {
    where.push(`e.event_type = $${n++}`);
    params.push(filters.eventType);
  }
  if (filters.companyId) {
    where.push(
      `EXISTS (SELECT 1 FROM event_entities ee
                WHERE ee.event_id = e.id AND ee.entity_type = 'company'
                  AND ee.entity_id = $${n++}::uuid)`,
    );
    params.push(filters.companyId);
  }
  if (filters.phase) {
    where.push(`e.phase = $${n++}`);
    params.push(filters.phase);
  }
  if (filters.indication) {
    where.push(`e.indication ILIKE $${n++}`);
    params.push(`%${filters.indication}%`);
  }
  if (filters.from) {
    where.push(`e.occurred_at >= $${n++}::timestamptz`);
    params.push(filters.from);
  }
  if (filters.to) {
    where.push(`e.occurred_at <= $${n++}::timestamptz`);
    params.push(filters.to);
  }
  // Cursor semantics match Milestone 1: cursor is an event id; start after it
  // in (occurred_at DESC, id DESC) order. Unknown cursor → first page.
  if (cursor) {
    const cur = await pool.query<{ occurred_at: Date; id: string }>(
      `SELECT occurred_at, id::text AS id FROM events WHERE id = $1::uuid`,
      [cursor],
    );
    if (cur.rows.length > 0) {
      where.push(
        `(e.occurred_at, e.id) < ($${n++}::timestamptz, $${n++}::uuid)`,
      );
      params.push(cur.rows[0].occurred_at.toISOString(), cur.rows[0].id);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await pool.query<EventRow>(
    `SELECT e.id::text AS id, e.event_type, e.occurred_at, e.published_at,
            e.headline, e.factual_summary, e.catalyst_summary, e.confidence,
            e.review_status, e.indication, e.phase, e.outcome
       FROM events e
       ${whereSql}
       ORDER BY e.occurred_at DESC, e.id DESC
       LIMIT $${n++}`,
    [...params, limit + 1],
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: await hydrateEvents(page),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}

export async function getEvent(id: string): Promise<CatalystEvent | undefined> {
  const { rows } = await getPool().query<EventRow>(
    `SELECT id::text AS id, event_type, occurred_at, published_at, headline,
            factual_summary, catalyst_summary, confidence, review_status,
            indication, phase, outcome
       FROM events WHERE id = $1::uuid`,
    [id],
  );
  if (rows.length === 0) return undefined;
  return (await hydrateEvents(rows))[0];
}

async function getCompanyRow(where: string, param: string): Promise<Company | undefined> {
  const { rows } = await getPool().query<CompanyRow>(
    `SELECT id::text AS id, canonical_name, slug, description, country, website
       FROM companies WHERE ${where} LIMIT 1`,
    [param],
  );
  if (rows.length === 0) return undefined;
  return (await hydrateCompanies(rows))[0];
}

export async function getCompany(slug: string): Promise<Company | undefined> {
  return getCompanyRow("slug = $1", slug);
}

export async function getCompanyById(id: string): Promise<Company | undefined> {
  return getCompanyRow("id = $1::uuid", id);
}

/** All tracked companies, alphabetically — powers the /companies browse page. */
export async function listCompanies(): Promise<Company[]> {
  const { rows } = await getPool().query<CompanyRow>(
    `SELECT id::text AS id, canonical_name, slug, description, country, website
       FROM companies ORDER BY canonical_name`,
  );
  return hydrateCompanies(rows);
}

/* ------------------------------------------------------------------ */
/* Global section: non-Indian pharma, India-impact links, IPO pipeline  */
/* ------------------------------------------------------------------ */

export { globalCompanies } from "./global-companies.js";
export { ipoCompanySeeds, ipoCatalog } from "./ipo-watchlist.js";
export type { IpoRecord, IpoCatalogStatus } from "./ipo-watchlist.js";
export { globalLinks } from "./global-links.js";
export type { GlobalLink } from "@biocatalyst/types";

/* ------------------------------------------------------------------ */
/* Orange Book patents                                                 */
/* ------------------------------------------------------------------ */

export {
  syncOrangeBookPatents,
  getPatentsForCompany,
  getPatentsForDrug,
  getUpcomingPatentExpiries,
  getPatentStats,
  parseOrangeBookDate,
  parsePatentRows,
  parseTildeDelimited,
  normalizeApplicantName,
  resolveApplicantCompany,
  extractZipFiles,
  APPLICANT_TO_SLUG,
  ORANGE_BOOK_ZIP_URL,
} from "./patents.js";
export type { PatentExpiryItem, PatentStats } from "./patents.js";
export type { OrangeBookPatent } from "@biocatalyst/types";

/** Companies headquartered outside India, alphabetically. */
export async function listGlobalCompanies(): Promise<Company[]> {
  const { rows } = await getPool().query<CompanyDirectoryRow>(
    `SELECT c.id::text AS id, c.canonical_name, c.slug, c.description,
            c.country, c.website,
            COALESCE(
              (SELECT jsonb_agg(jsonb_build_object(
                 'exchange', s.exchange,
                 'ticker', s.ticker,
                 'currency', s.currency,
                 'isin', s.isin
               ) ORDER BY s.exchange)
                 FROM securities s WHERE s.company_id = c.id),
              '[]'::jsonb
            ) AS securities,
            COALESCE(
              (SELECT jsonb_agg(a.alias ORDER BY a.alias)
                 FROM company_aliases a WHERE a.company_id = c.id),
              '[]'::jsonb
            ) AS aliases
       FROM companies c
      WHERE c.country <> 'India'
      ORDER BY c.canonical_name`,
  );
  return rows.map((row) =>
    mapCompany(row, row.securities.map(toSecurity), row.aliases),
  );
}

const KNOWN_COMPANIES_BY_SLUG: Map<string, { canonicalName: string; country: string }> =
  new Map(
    [...indianCompanies, ...globalCompanies].map((c) => [
      c.slug,
      { canonicalName: c.canonicalName, country: c.country },
    ]),
  );

export interface ResolvedGlobalLink {
  link: GlobalLink;
  /** The company on the other side of the link (null when unknown). */
  otherCompany: { slug: string; canonicalName: string; country: string } | null;
}

/**
 * India-impact links touching a company — either as the Indian side or as
 * the global side. Powers the "Global links" section on company pages.
 */
export function getGlobalLinksForCompany(slug: string): ResolvedGlobalLink[] {
  return globalLinks
    .filter((l) => l.companySlug === slug || l.globalCompanySlug === slug)
    .map((link) => {
      const otherSlug =
        link.companySlug === slug ? link.globalCompanySlug : link.companySlug;
      const known = otherSlug ? KNOWN_COMPANIES_BY_SLUG.get(otherSlug) : undefined;
      return {
        link,
        otherCompany: otherSlug && known ? { slug: otherSlug, ...known } : null,
      };
    });
}

export type IpoStatus = "in_pipeline" | "listed" | "watchlist";

export interface IpoEntry {
  company: Company;
  status: IpoStatus;
  /** Curated milestone info from the IPO catalog (dates predate ingestion). */
  milestone: {
    drhpDate?: string;
    listingDate?: string;
    note?: string;
  };
  latestEvent: {
    id: string;
    headline: string;
    occurredAt: string;
    eventType: EventType;
  } | null;
}

/**
 * IPO pipeline: the explicit curated IPO catalog (ipo-watchlist.ts), joined
 * to companies by slug. Status starts from the catalog's curated initial
 * status — which covers milestones that predate ingestion — and detected
 * IPO events can only advance it (ipo_filing → in_pipeline, ipo_listing →
 * listed); a stale DRHP story never downgrades an already-listed company.
 */
export async function listIpoPipeline(): Promise<IpoEntry[]> {
  const { rows } = await getPool().query<CompanyRow>(
    `SELECT c.id::text AS id, c.canonical_name, c.slug, c.description, c.country, c.website
       FROM companies c
      WHERE c.slug = ANY($1)
      ORDER BY c.canonical_name`,
    [ipoCatalog.map((r) => r.slug)],
  );
  // The IPO list only exposes the compact company fields below. Avoid the
  // securities and aliases hydration queries used by full company pages;
  // each extra database round trip is noticeable on a serverless cold start.
  const companies = rows.map((row) => mapCompany(row, [], []));
  const bySlug = new Map(companies.map((c) => [c.slug, c]));
  if (companies.length === 0) return [];
  const companyIds = companies.map((company) => company.id);

  const { rows: evRows } = await getPool().query<{
    entity_id: string;
    id: string;
    headline: string;
    occurred_at: string;
    event_type: string;
  }>(
    `SELECT DISTINCT ON (ee.entity_id)
       ee.entity_id::text AS entity_id, e.id::text AS id, e.headline,
       e.occurred_at::text AS occurred_at, e.event_type
       FROM event_entities ee
       JOIN events e ON e.id = ee.event_id
      WHERE ee.entity_type = 'company'
        AND ee.entity_id = ANY($1::uuid[])
        AND e.event_type IN ('ipo_filing', 'ipo_listing')
        AND e.review_status = 'published'
      ORDER BY ee.entity_id, e.occurred_at DESC`,
    [companyIds],
  );
  const latest = new Map(evRows.map((r) => [r.entity_id, r]));
  const entries: IpoEntry[] = [];
  for (const rec of ipoCatalog) {
    const company = bySlug.get(rec.slug);
    if (!company) continue; // catalog slug not seeded yet — skip
    const ev = latest.get(company.id) ?? null;
    let status: IpoStatus = rec.status;
    if (ev?.event_type === "ipo_listing") status = "listed";
    else if (ev?.event_type === "ipo_filing" && status !== "listed") status = "in_pipeline";
    entries.push({
      company,
      status,
      milestone: {
        drhpDate: rec.drhpDate,
        listingDate: rec.listingDate,
        note: rec.note,
      },
      latestEvent: ev
        ? { id: ev.id, headline: ev.headline, occurredAt: ev.occurred_at, eventType: ev.event_type as EventType }
        : null,
    });
  }
  return entries;
}

async function getDrugRow(where: string, param: string): Promise<Drug | undefined> {
  const { rows } = await getPool().query<DrugRow>(
    `SELECT id::text AS id, canonical_name, slug, modality, mechanism
       FROM drugs WHERE ${where} LIMIT 1`,
    [param],
  );
  if (rows.length === 0) return undefined;
  return (await hydrateDrugs(rows))[0];
}

export async function getDrug(slug: string): Promise<Drug | undefined> {
  return getDrugRow("slug = $1", slug);
}

export async function getDrugById(id: string): Promise<Drug | undefined> {
  return getDrugRow("id = $1::uuid", id);
}

/** All drugs, alphabetically — powers modality/indication exploration. */
export async function listDrugs(): Promise<Drug[]> {
  const { rows } = await getPool().query<DrugRow>(
    `SELECT id::text AS id, canonical_name, slug, modality, mechanism
       FROM drugs ORDER BY canonical_name`,
  );
  return hydrateDrugs(rows);
}

/** Drugs linked to any of the given indication names (exact match). */
export async function getDrugsByIndications(indications: string[]): Promise<Drug[]> {
  if (indications.length === 0) return [];
  const { rows } = await getPool().query<DrugRow>(
    `SELECT DISTINCT d.id::text AS id, d.canonical_name, d.slug, d.modality, d.mechanism
       FROM drugs d
       JOIN drug_indications di ON di.drug_id = d.id
       JOIN indications i ON i.id = di.indication_id
      WHERE i.canonical_name = ANY($1)
      ORDER BY d.canonical_name`,
    [indications],
  );
  return hydrateDrugs(rows);
}

/** Trials linked to any of the given indication names (exact match). */
export async function getTrialsByIndications(indications: string[]): Promise<Trial[]> {
  if (indications.length === 0) return [];
  const { rows } = await getPool().query<TrialRow>(
    `SELECT DISTINCT t.id::text AS id, t.registry, t.registry_trial_id, t.title,
            t.phase, t.status, t.enrollment,
            t.sponsor_company_id::text AS sponsor_company_id,
            t.start_date::text AS start_date,
            t.primary_completion_date::text AS primary_completion_date,
            t.source_url, t.primary_endpoints
       FROM trials t
       JOIN trial_indications ti ON ti.trial_id = t.id
       JOIN indications i ON i.id = ti.indication_id
      WHERE i.canonical_name = ANY($1)
      ORDER BY primary_completion_date DESC NULLS LAST, registry_trial_id`,
    [indications],
  );
  return hydrateTrials(rows);
}

/**
 * Catalyst calendar — trials with a primary completion date today or later,
 * soonest first. These are the upcoming readout/completion catalysts.
 */
export async function getUpcomingTrials(limit = 50): Promise<Trial[]> {
  const { rows } = await getPool().query<TrialRow>(
    `SELECT id::text AS id, registry, registry_trial_id, title, phase, status,
            enrollment, sponsor_company_id::text AS sponsor_company_id,
            start_date::text AS start_date,
            primary_completion_date::text AS primary_completion_date,
            source_url, primary_endpoints
       FROM trials
      WHERE primary_completion_date >= CURRENT_DATE
      ORDER BY primary_completion_date ASC, registry_trial_id
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return hydrateTrials(rows);
}

export interface CompanyMarketMove {
  eventId: string;
  headline: string;
  occurredAt: string | null;
  exchange: string;
  ticker: string;
  pctChange: number;
  benchmarkPctChange: number | null;
  relativeChange: number | null;
  provider: string;
}

/**
 * Recent market moves for one company — latest computed reactions across its
 * securities, newest event first. Used by the company-compare view.
 */
export async function getRecentReactionsForCompany(
  companyId: string,
  limit = 5,
): Promise<CompanyMarketMove[]> {
  const { rows } = await getPool().query(
    `SELECT mr.event_id::text AS event_id, e.headline,
            e.occurred_at::text AS occurred_at,
            s.exchange, s.ticker,
            mr.pct_change AS pct_change,
            mr.benchmark_pct_change AS benchmark_pct_change,
            mr.relative_change AS relative_change,
            mr.provider
       FROM market_reactions mr
       JOIN securities s ON s.id = mr.security_id
       JOIN events e ON e.id = mr.event_id
      WHERE s.company_id = $1::uuid
      ORDER BY e.occurred_at DESC NULLS LAST, mr.pct_change DESC
      LIMIT $2`,
    [companyId, Math.min(Math.max(limit, 1), 20)],
  );
  return rows.map((r) => ({
    eventId: r.event_id,
    headline: r.headline,
    occurredAt: r.occurred_at ? new Date(r.occurred_at).toISOString().slice(0, 10) : null,
    exchange: r.exchange,
    ticker: r.ticker,
    pctChange: Number(r.pct_change),
    benchmarkPctChange: r.benchmark_pct_change != null ? Number(r.benchmark_pct_change) : null,
    relativeChange: r.relative_change != null ? Number(r.relative_change) : null,
    provider: r.provider,
  }));
}

export async function getTrial(
  registry: string,
  registryTrialId: string,
): Promise<Trial | undefined> {
  const { rows } = await getPool().query<TrialRow>(
    `SELECT id::text AS id, registry, registry_trial_id, title, phase, status,
            enrollment, sponsor_company_id::text AS sponsor_company_id,
            start_date::text AS start_date,
            primary_completion_date::text AS primary_completion_date,
            source_url, primary_endpoints
       FROM trials WHERE registry = $1 AND registry_trial_id = $2 LIMIT 1`,
    [registry, registryTrialId],
  );
  if (rows.length === 0) return undefined;
  return (await hydrateTrials(rows))[0];
}

export async function getTrialById(id: string): Promise<Trial | undefined> {
  const { rows } = await getPool().query<TrialRow>(
    `SELECT id::text AS id, registry, registry_trial_id, title, phase, status,
            enrollment, sponsor_company_id::text AS sponsor_company_id,
            start_date::text AS start_date,
            primary_completion_date::text AS primary_completion_date,
            source_url, primary_endpoints
       FROM trials WHERE id = $1::uuid LIMIT 1`,
    [id],
  );
  if (rows.length === 0) return undefined;
  return (await hydrateTrials(rows))[0];
}

async function getEventsForEntity(
  entityType: "company" | "drug" | "trial",
  entityId: string,
): Promise<CatalystEvent[]> {
  const { rows } = await getPool().query<EventRow>(
    `SELECT e.id::text AS id, e.event_type, e.occurred_at, e.published_at,
            e.headline, e.factual_summary, e.catalyst_summary, e.confidence,
            e.review_status, e.indication, e.phase, e.outcome
       FROM events e
       JOIN event_entities ee ON ee.event_id = e.id
      WHERE ee.entity_type = $1 AND ee.entity_id = $2::uuid
      ORDER BY e.occurred_at DESC, e.id DESC`,
    [entityType, entityId],
  );
  return hydrateEvents(rows);
}

export async function getEventsForCompany(companyId: string): Promise<CatalystEvent[]> {
  return getEventsForEntity("company", companyId);
}

export async function getEventsForDrug(drugId: string): Promise<CatalystEvent[]> {
  return getEventsForEntity("drug", drugId);
}

export async function getEventsForTrial(trialId: string): Promise<CatalystEvent[]> {
  return getEventsForEntity("trial", trialId);
}

export async function getDrugsForCompany(companyId: string): Promise<Drug[]> {
  const { rows } = await getPool().query<DrugRow>(
    `SELECT d.id::text AS id, d.canonical_name, d.slug, d.modality, d.mechanism
       FROM drugs d
       JOIN drug_company_links l ON l.drug_id = d.id
      WHERE l.company_id = $1::uuid
      ORDER BY d.canonical_name`,
    [companyId],
  );
  return hydrateDrugs(rows);
}

export async function getTrialsForCompany(companyId: string): Promise<Trial[]> {
  const { rows } = await getPool().query<TrialRow>(
    `SELECT id::text AS id, registry, registry_trial_id, title, phase, status,
            enrollment, sponsor_company_id::text AS sponsor_company_id,
            start_date::text AS start_date,
            primary_completion_date::text AS primary_completion_date,
            source_url, primary_endpoints
       FROM trials WHERE sponsor_company_id = $1::uuid
      ORDER BY registry_trial_id`,
    [companyId],
  );
  return hydrateTrials(rows);
}

export async function getTrialsForDrug(drugId: string): Promise<Trial[]> {
  const { rows } = await getPool().query<TrialRow>(
    `SELECT t.id::text AS id, t.registry, t.registry_trial_id, t.title, t.phase,
            t.status, t.enrollment,
            t.sponsor_company_id::text AS sponsor_company_id,
            t.start_date::text AS start_date,
            t.primary_completion_date::text AS primary_completion_date,
            t.source_url, t.primary_endpoints
       FROM trials t
       JOIN trial_drugs td ON td.trial_id = t.id
      WHERE td.drug_id = $1::uuid
      ORDER BY t.registry_trial_id`,
    [drugId],
  );
  return hydrateTrials(rows);
}

export async function getCompaniesForDrug(drug: Drug): Promise<Company[]> {
  const { rows } = await getPool().query<CompanyRow>(
    `SELECT c.id::text AS id, c.canonical_name, c.slug, c.description,
            c.country, c.website
       FROM companies c
       JOIN drug_company_links l ON l.company_id = c.id
      WHERE l.drug_id = $1::uuid
      ORDER BY c.canonical_name`,
    [drug.id],
  );
  return hydrateCompanies(rows);
}

/** Human label for an event type — re-exported from @biocatalyst/types (pure, client-safe). */
export { eventTypeLabel } from "@biocatalyst/types";

/** Spec §22 event-card contract. */
export async function toEventCards(events: CatalystEvent[]): Promise<EventCard[]> {
  if (events.length === 0) return [];

  const companyIds = [...new Set(events.flatMap((event) => event.companyIds.slice(0, 1)))];
  const drugIds = [...new Set(events.flatMap((event) => event.drugIds.slice(0, 1)))];
  const trialIds = [...new Set(events.flatMap((event) => event.trialIds.slice(0, 1)))];
  const pool = getPool();

  // Event pages only need compact labels. Fetch every referenced entity in
  // three batches instead of hydrating up to three full graphs per event.
  const [companyRes, drugRes, trialRes] = await Promise.all([
    companyIds.length
      ? pool.query<{
          id: string;
          slug: string;
          canonical_name: string;
          ticker: string | null;
          exchange: string | null;
        }>(
          `SELECT c.id::text AS id, c.slug, c.canonical_name,
                  security.ticker, security.exchange
             FROM companies c
             LEFT JOIN LATERAL (
               SELECT s.ticker, s.exchange
                 FROM securities s
                WHERE s.company_id = c.id
                ORDER BY s.exchange, s.ticker
                LIMIT 1
             ) security ON true
            WHERE c.id = ANY($1::uuid[])`,
          [companyIds],
        )
      : Promise.resolve({ rows: [] }),
    drugIds.length
      ? pool.query<{ id: string; canonical_name: string }>(
          `SELECT id::text AS id, canonical_name
             FROM drugs WHERE id = ANY($1::uuid[])`,
          [drugIds],
        )
      : Promise.resolve({ rows: [] }),
    trialIds.length
      ? pool.query<{ id: string; registry_trial_id: string; phase: string | null }>(
          `SELECT id::text AS id, registry_trial_id, phase
             FROM trials WHERE id = ANY($1::uuid[])`,
          [trialIds],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const companies = new Map(companyRes.rows.map((row) => [row.id, row]));
  const drugs = new Map(drugRes.rows.map((row) => [row.id, row]));
  const trials = new Map(trialRes.rows.map((row) => [row.id, row]));

  return events.map((event) => {
    const company = event.companyIds[0] ? companies.get(event.companyIds[0]) : undefined;
    const drug = event.drugIds[0] ? drugs.get(event.drugIds[0]) : undefined;
    const trial = event.trialIds[0] ? trials.get(event.trialIds[0]) : undefined;
    return {
      id: event.id,
      headline: event.headline,
      occurredAt: event.occurredAt,
      eventType: event.eventType,
      company: company
        ? {
            id: company.id,
            slug: company.slug,
            name: company.canonical_name,
            ticker: company.ticker ?? "",
            exchange: company.exchange ?? "",
          }
        : undefined,
      drug: drug ? { name: drug.canonical_name } : undefined,
      trial: trial
        ? { id: trial.registry_trial_id, phase: (trial.phase ?? "Preclinical") as TrialPhase }
        : undefined,
      indication: event.indication,
      fact: event.fact,
      summary: event.summary,
      catalystSummary: event.catalystSummary,
      marketReaction: event.marketReaction,
      sources: event.sources.map((source) => ({
        title: source.title,
        url: source.url,
        isPrimary: source.isPrimary,
      })),
      confidence: event.confidence,
    };
  });
}

export async function toEventCard(event: CatalystEvent): Promise<EventCard> {
  return (await toEventCards([event]))[0];
}

export interface SearchResults {
  companies: Company[];
  drugs: Drug[];
  trials: Trial[];
  events: CatalystEvent[];
}

/** Escape LIKE wildcards so user input can't widen the pattern. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Universal search across company name/ticker/alias, drug name/alias,
 * trial registry ID/title, and event headline/fact/indication
 * (spec §4.6, §17; Postgres trigram indexes per §10).
 */
export async function search(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (!q) return { companies: [], drugs: [], trials: [], events: [] };
  const pool = getPool();
  const pat = likePattern(q);

  // These searches are independent. Running them concurrently avoids four
  // serial database round trips before hydration can even begin.
  const [companyRes, drugRes, trialRes, eventRes] = await Promise.all([
    pool.query<CompanyRow>(
      `SELECT DISTINCT c.id::text AS id, c.canonical_name, c.slug, c.description,
              c.country, c.website,
              GREATEST(similarity(c.canonical_name, $1),
                       COALESCE(MAX(similarity(a.alias, $1)) OVER (PARTITION BY c.id), 0)) AS rank
         FROM companies c
         LEFT JOIN company_aliases a ON a.company_id = c.id
        WHERE c.canonical_name ILIKE $2
           OR a.alias ILIKE $2
           OR EXISTS (SELECT 1 FROM securities s
                       WHERE s.company_id = c.id AND s.ticker ILIKE $2)
           OR similarity(c.canonical_name, $1) > 0.25
           OR similarity(a.alias, $1) > 0.35
        ORDER BY rank DESC, c.canonical_name
        LIMIT 10`,
      [q, pat],
    ),
    pool.query<DrugRow>(
      `SELECT DISTINCT d.id::text AS id, d.canonical_name, d.slug, d.modality, d.mechanism,
              GREATEST(similarity(d.canonical_name, $1),
                       COALESCE(MAX(similarity(a.alias, $1)) OVER (PARTITION BY d.id), 0)) AS rank
         FROM drugs d
         LEFT JOIN drug_aliases a ON a.drug_id = d.id
        WHERE d.canonical_name ILIKE $2
           OR a.alias ILIKE $2
           OR similarity(d.canonical_name, $1) > 0.25
           OR similarity(a.alias, $1) > 0.35
        ORDER BY rank DESC, d.canonical_name
        LIMIT 10`,
      [q, pat],
    ),
    pool.query<TrialRow>(
      `SELECT id::text AS id, registry, registry_trial_id, title, phase, status,
              enrollment, sponsor_company_id::text AS sponsor_company_id,
              start_date::text AS start_date,
              primary_completion_date::text AS primary_completion_date,
              source_url, primary_endpoints,
              GREATEST(similarity(title, $1), similarity(registry_trial_id, $1)) AS rank
         FROM trials
        WHERE registry_trial_id ILIKE $2
           OR title ILIKE $2
           OR similarity(title, $1) > 0.2
        ORDER BY rank DESC, registry_trial_id
        LIMIT 10`,
      [q, pat],
    ),
    pool.query<EventRow>(
      `SELECT id::text AS id, event_type, occurred_at, published_at, headline,
              factual_summary, catalyst_summary, confidence, review_status,
              indication, phase, outcome
         FROM events
        WHERE headline ILIKE $1
           OR factual_summary ILIKE $1
           OR COALESCE(indication, '') ILIKE $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT 10`,
      [pat],
    ),
  ]);

  const [companies, drugs, trials, events] = await Promise.all([
    hydrateCompanies(companyRes.rows),
    hydrateDrugs(drugRes.rows),
    hydrateTrials(trialRes.rows),
    hydrateEvents(eventRes.rows),
  ]);
  return { companies, drugs, trials, events };
}

/* ------------------------------------------------------------------ */
/* Review queue (Milestone 4, spec §8.3)                                */
/* ------------------------------------------------------------------ */

/** One item awaiting manual review, with its extraction provenance. */
export interface PendingReviewItem {
  id: string;
  headline: string;
  eventType: string;
  confidence: number;
  outcome: string | null;
  occurredAt: string | null;
  extractionId: string | null;
  extractionProvider: string | null;
  promptVersion: string | null;
  schemaVersion: string | null;
  fallbackUsed: boolean | null;
}

export interface ReviewQueue {
  pendingCount: number;
  items: PendingReviewItem[];
}

/**
 * Query the confidence-threshold review queue: events with
 * review_status = 'pending_review', lowest confidence first, joined to
 * their extraction record (provider, versions, fallback flag) for
 * traceability. Used by GET /api/v1/admin/health.
 */
export async function listPendingReview(limit = 50): Promise<ReviewQueue> {
  const pool = getPool();
  const countRes = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM events WHERE review_status = 'pending_review'",
  );
  const { rows } = await pool.query<{
    id: string;
    headline: string;
    event_type: string;
    confidence: number;
    outcome: string | null;
    occurred_at: Date | null;
    extraction_id: string | null;
    provider: string | null;
    prompt_version: string | null;
    schema_version: string | null;
    fallback_used: boolean | null;
  }>(
    `SELECT e.id::text AS id, e.headline, e.event_type, e.confidence, e.outcome,
            e.occurred_at, e.extraction_id::text AS extraction_id,
            x.provider, x.prompt_version, x.schema_version, x.fallback_used
       FROM events e
       LEFT JOIN extractions x ON x.id = e.extraction_id
      WHERE e.review_status = 'pending_review'
      ORDER BY e.confidence ASC, e.occurred_at DESC NULLS LAST, e.id DESC
      LIMIT $1`,
    [Math.max(1, Math.min(200, limit))],
  );
  return {
    pendingCount: countRes.rows[0].n,
    items: rows.map((r) => ({
      id: r.id,
      headline: r.headline,
      eventType: r.event_type,
      confidence: r.confidence,
      outcome: r.outcome,
      occurredAt: r.occurred_at?.toISOString() ?? null,
      extractionId: r.extraction_id,
      extractionProvider: r.provider,
      promptVersion: r.prompt_version,
      schemaVersion: r.schema_version,
      fallbackUsed: r.fallback_used,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Issue reports — data-correction mechanism (Milestone 8, spec §21)    */
/* ------------------------------------------------------------------ */

export const ISSUE_CATEGORIES = [
  "incorrect_fact",
  "wrong_entity_link",
  "missing_source",
  "stale_data",
  "other",
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export type IssueStatus = "open" | "reviewed" | "resolved" | "dismissed";

export interface IssueReport {
  id: string;
  eventId: string;
  category: IssueCategory;
  description: string;
  contact: string | null;
  status: IssueStatus;
  createdAt: string;
}

export interface NewIssueReport {
  eventId: string;
  category: IssueCategory;
  description: string;
  /** Optional free text (e.g. an email) so the operator can follow up. */
  contact?: string;
}

interface IssueReportRow {
  id: string;
  event_id: string;
  category: IssueCategory;
  description: string;
  contact: string | null;
  status: IssueStatus;
  created_at: Date;
}

function toIssueReport(r: IssueReportRow): IssueReport {
  return {
    id: r.id,
    eventId: r.event_id,
    category: r.category,
    description: r.description,
    contact: r.contact,
    status: r.status,
    createdAt: r.created_at.toISOString(),
  };
}

/** Insert a validated issue report. Throws if `eventId` does not exist. */
export async function createIssueReport(input: NewIssueReport): Promise<IssueReport> {
  const pool = getPool();
  const { rows } = await pool.query<IssueReportRow>(
    `INSERT INTO issue_reports (event_id, category, description, contact)
     VALUES ($1, $2, $3, NULLIF($4, ''))
     RETURNING id::text AS id, event_id::text AS event_id, category, description,
               contact, status, created_at`,
    [input.eventId, input.category, input.description, input.contact ?? null],
  );
  return toIssueReport(rows[0]);
}

/** Admin list: newest first, optional status filter. */
export async function listIssueReports(
  status?: IssueStatus,
  limit = 100,
): Promise<IssueReport[]> {
  const pool = getPool();
  const { rows } = await pool.query<IssueReportRow>(
    `SELECT id::text AS id, event_id::text AS event_id, category, description,
            contact, status, created_at
       FROM issue_reports
      ${status ? "WHERE status = $2" : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $1`,
    status ? [Math.max(1, Math.min(500, limit)), status] : [Math.max(1, Math.min(500, limit))],
  );
  return rows.map(toIssueReport);
}

/** Admin triage: change the status of one report. */
export async function setIssueReportStatus(
  id: string,
  status: IssueStatus,
): Promise<IssueReport | undefined> {
  const pool = getPool();
  const { rows } = await pool.query<IssueReportRow>(
    `UPDATE issue_reports SET status = $2 WHERE id = $1
     RETURNING id::text AS id, event_id::text AS event_id, category, description,
               contact, status, created_at`,
    [id, status],
  );
  return rows[0] ? toIssueReport(rows[0]) : undefined;
}

/* ------------------------------------------------------------------ */
/* Push tokens — device registry for future alert fan-out (Milestone 10) */
/* ------------------------------------------------------------------ */

export const PUSH_TOKEN_PLATFORMS = ["expo", "apns", "fcm"] as const;
export type PushTokenPlatform = (typeof PUSH_TOKEN_PLATFORMS)[number];

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: PushTokenPlatform;
  createdAt: string;
  updatedAt: string;
}

interface PushTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: PushTokenPlatform;
  created_at: Date;
  updated_at: Date;
}

function toPushToken(r: PushTokenRow): PushToken {
  return {
    id: r.id,
    userId: r.user_id,
    token: r.token,
    platform: r.platform,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

const PUSH_TOKEN_SELECT = `id::text AS id, user_id::text AS user_id, token,
  platform, created_at, updated_at`;

/**
 * Register (or refresh) a device push token for a user. Idempotent:
 * re-registering the same token for the same user only bumps `updated_at`.
 * One user may register tokens from several devices.
 */
export async function upsertPushToken(input: {
  userId: string;
  token: string;
  platform: PushTokenPlatform;
}): Promise<PushToken> {
  const pool = getPool();
  const { rows } = await pool.query<PushTokenRow>(
    `INSERT INTO push_tokens (user_id, token, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, token)
     DO UPDATE SET platform = EXCLUDED.platform, updated_at = now()
     RETURNING ${PUSH_TOKEN_SELECT}`,
    [input.userId, input.token, input.platform],
  );
  return toPushToken(rows[0]);
}

/** List all registered device tokens for a user (admin/fan-out support). */
export async function listPushTokens(userId: string): Promise<PushToken[]> {
  const pool = getPool();
  const { rows } = await pool.query<PushTokenRow>(
    `SELECT ${PUSH_TOKEN_SELECT} FROM push_tokens
      WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(toPushToken);
}
