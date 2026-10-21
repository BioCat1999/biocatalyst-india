/**
 * Ingestion runner — Milestone 3 (spec §7, §8 intro, §20).
 *
 * Pipeline per document:
 *   fetch → raw snapshot dedupe (canonical URL + content hash)
 *         → normalize → validate → entity resolution
 *         → event fingerprint dedupe → store + index → publish
 *
 * Dedupe layers (spec §7):
 *   1. Document level: (source_name, canonical_url) in `raw_snapshots` with
 *      an unchanged content hash → not re-processed.
 *   2. Event level: `events.fingerprint` UNIQUE → ingesting the same source
 *      document twice never creates duplicate events.
 *   3. Cross-source level (M7): candidates carrying a `crossSourceKey`
 *      (trial-anchored, source-agnostic) merge into the existing event with
 *      that key — one event, all sources linked via `event_sources`.
 *      First writer wins on headline/type/summaries; the merge is counted
 *      as `eventsMerged`, and no new alert fires (watchers were already
 *      alerted when the event was first published).
 *
 * Entity resolution is conservative: a candidate whose trial/company/drug
 * references do not resolve against the canonical catalog is REJECTED and
 * counted (events_rejected) rather than published with guessed links
 * (spec §17: unknown stays null; §15 review posture).
 *
 * Milestone 6: after a new event is published, in-app alerts are generated
 * for watchers of the event's companies/drugs
 * (`generateAlertsForEvent`) — idempotent by UNIQUE (user_id, event_id,
 * channel), so re-ingests and retries never duplicate alerts.
 */
import type { Pool } from "pg";
import { generateAlertsForEvent } from "@biocatalyst/notifications";
import type { Cursor, NormalizedCandidate, RawSourceDocument, SourceAdapter } from "./adapter.js";
import { canonicalizeUrl, contentHash, isPublishableCandidate } from "./normalize.js";
import {
  EXTRACTION_SCHEMA_VERSION,
  PROMPT_VERSION,
  extractDocument,
  selectProvider,
  type ExtractionDocument,
  type ExtractionOutcome,
  type ExtractionProvider,
} from "@biocatalyst/extraction";

export interface IngestionMetrics {
  sourceName: string;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failed";
  docsFetched: number;
  docsChanged: number;
  eventsCreated: number;
  eventsRejected: number;
  /** Cross-source merges: candidates absorbed into an existing event (M7). */
  eventsMerged: number;
  /** Extraction provider + prompt/schema versions used this run (M4). */
  extractionProvider: string;
  promptVersion: string;
  schemaVersion: string;
  /** Extractions served from the content-hash cache (M4, spec §8.1). */
  extractionsCached: number;
  /** In-app alerts created for watchers this run (M6, spec §14). */
  alertsCreated: number;
  newestSourceTs: string | null;
  error: string | null;
}

interface ResolvedEntities {
  trialId: string | null;
  companyIds: string[];
  drugIds: string[];
  /** True when any referenced trial/company/drug failed to resolve. */
  unresolved: boolean;
}

async function upsertTrialRecord(pool: Pool, c: NormalizedCandidate): Promise<void> {
  const record = c.trialRecord;
  if (!record) return;

  const sponsorId = record.sponsorCompanyName
    ? await resolveNamed(pool, "companies", "company_aliases", "company_id", record.sponsorCompanyName)
    : null;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO trials (
       registry, registry_trial_id, title, phase, status, enrollment,
       sponsor_company_id, start_date, primary_completion_date, source_url,
       primary_endpoints
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::uuid,$8::date,$9::date,$10,$11::text[])
     ON CONFLICT (registry, registry_trial_id) DO UPDATE SET
       title = EXCLUDED.title,
       phase = COALESCE(EXCLUDED.phase, trials.phase),
       status = COALESCE(EXCLUDED.status, trials.status),
       enrollment = COALESCE(EXCLUDED.enrollment, trials.enrollment),
       sponsor_company_id = COALESCE(EXCLUDED.sponsor_company_id, trials.sponsor_company_id),
       start_date = COALESCE(EXCLUDED.start_date, trials.start_date),
       primary_completion_date = COALESCE(EXCLUDED.primary_completion_date, trials.primary_completion_date),
       source_url = EXCLUDED.source_url,
       primary_endpoints = CASE
         WHEN cardinality(EXCLUDED.primary_endpoints) > 0 THEN EXCLUDED.primary_endpoints
         ELSE trials.primary_endpoints
       END
     RETURNING id::text AS id`,
    [
      record.registry,
      record.registryTrialId,
      record.title,
      record.phase,
      record.status,
      record.enrollment,
      sponsorId,
      record.startDate,
      record.primaryCompletionDate,
      record.sourceUrl,
      record.primaryEndpoints,
    ],
  );
  const trialId = rows[0]?.id;
  if (!trialId) throw new Error("ingestion: trial upsert returned no id");

  for (const name of record.indications) {
    const clean = name.trim().slice(0, 300);
    if (!clean) continue;
    const indication = await pool.query<{ id: string }>(
      `INSERT INTO indications (canonical_name) VALUES ($1)
       ON CONFLICT (canonical_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
       RETURNING id::text AS id`,
      [clean],
    );
    await pool.query(
      `INSERT INTO trial_indications (trial_id, indication_id)
       VALUES ($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`,
      [trialId, indication.rows[0].id],
    );
  }

  for (const name of record.drugNames) {
    const drugId = await resolveNamed(pool, "drugs", "drug_aliases", "drug_id", name);
    if (!drugId) continue;
    await pool.query(
      `INSERT INTO trial_drugs (trial_id, drug_id, role)
       VALUES ($1::uuid,$2::uuid,'intervention')
       ON CONFLICT (trial_id, drug_id) DO UPDATE SET role = EXCLUDED.role`,
      [trialId, drugId],
    );
  }
}

async function upsertCalendarMilestones(
  pool: Pool,
  c: NormalizedCandidate,
  entities: ResolvedEntities,
): Promise<void> {
  for (const milestone of c.calendarMilestones ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(milestone.date)) continue;
    await pool.query(
      `INSERT INTO catalyst_milestones
         (kind, event_date, title, detail, company_id, country, source_url, status)
       VALUES ($1,$2::date,$3,$4,$5::uuid,$6,$7,$8)
       ON CONFLICT (kind, event_date, source_url) DO UPDATE SET
         title = EXCLUDED.title, detail = EXCLUDED.detail,
         company_id = COALESCE(EXCLUDED.company_id, catalyst_milestones.company_id),
         country = COALESCE(NULLIF(EXCLUDED.country, ''), catalyst_milestones.country),
         status = EXCLUDED.status, updated_at = now()`,
      [milestone.kind, milestone.date, milestone.title, milestone.detail,
        entities.companyIds[0] ?? null, milestone.country ?? "", c.canonicalUrl, milestone.status],
    );
  }
}

async function resolveTrial(pool: Pool, registry: string, registryTrialId: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id::text AS id FROM trials WHERE registry = $1 AND registry_trial_id = $2",
    [registry, registryTrialId],
  );
  return rows[0]?.id ?? null;
}

/** Resolve by canonical name or curated alias (case-insensitive). */
async function resolveNamed(
  pool: Pool,
  table: "companies" | "drugs",
  aliasTable: "company_aliases" | "drug_aliases",
  idCol: "company_id" | "drug_id",
  name: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT e.id::text AS id FROM ${table} e WHERE e.canonical_name ILIKE $1
     UNION
     SELECT a.${idCol}::text AS id FROM ${aliasTable} a WHERE a.alias ILIKE $1
     LIMIT 1`,
    [name],
  );
  return rows[0]?.id ?? null;
}

async function resolveEntities(pool: Pool, c: NormalizedCandidate): Promise<ResolvedEntities> {
  const out: ResolvedEntities = { trialId: null, companyIds: [], drugIds: [], unresolved: false };
  const ref = c.trialRefs[0];
  if (ref) {
    out.trialId = await resolveTrial(pool, ref.registry, ref.registryTrialId);
    if (!out.trialId) out.unresolved = true;
  }
  for (const name of c.companyNames) {
    const id = await resolveNamed(pool, "companies", "company_aliases", "company_id", name);
    if (id) {
      if (!out.companyIds.includes(id)) out.companyIds.push(id);
    } else {
      out.unresolved = true;
    }
  }
  for (const name of c.drugNames) {
    const id = await resolveNamed(pool, "drugs", "drug_aliases", "drug_id", name);
    if (id) {
      if (!out.drugIds.includes(id)) out.drugIds.push(id);
    } else {
      out.unresolved = true;
    }
  }
  return out;
}

/** Upsert the provenance source row; returns the source UUID. */
async function upsertSource(
  pool: Pool,
  c: NormalizedCandidate,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sources (source_name, title, publisher, url, canonical_url,
                          published_at, retrieved_at, content_hash)
     VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8)
     ON CONFLICT (url) DO UPDATE SET
       source_name = EXCLUDED.source_name,
       title = COALESCE(EXCLUDED.title, sources.title),
       published_at = COALESCE(EXCLUDED.published_at, sources.published_at),
       retrieved_at = EXCLUDED.retrieved_at,
       content_hash = EXCLUDED.content_hash,
       canonical_url = EXCLUDED.canonical_url
     RETURNING id::text AS id`,
    [
      c.sourceName,
      c.sourceTitle,
      c.publisher,
      c.canonicalUrl,
      c.canonicalUrl,
      c.publishedAt,
      c.retrievedAt,
      c.contentHash,
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("ingestion: source upsert returned no id");
  return id;
}

async function storeCandidate(
  pool: Pool,
  c: NormalizedCandidate,
  entities: ResolvedEntities,
  extraction: ExtractionOutcome,
): Promise<{ eventId: string; created: boolean; merged: boolean }> {
  const client = await pool.connect();
  const linkEntity = async (eventId: string, type: "company" | "drug" | "trial", entityId: string) => {
    await client.query(
      `INSERT INTO event_entities (event_id, entity_type, entity_id)
       VALUES ($1::uuid,$2,$3::uuid) ON CONFLICT DO NOTHING`,
      [eventId, type, entityId],
    );
  };
  try {
    await client.query("BEGIN");
    // M7 cross-source dedupe: a candidate carrying a cross-source key that
    // already exists belongs to the same real-world event as the stored
    // row. Link this source (and any additional resolved entities) into
    // that event instead of creating a duplicate. First writer wins on
    // headline/event_type/summaries.
    const crossKey = c.crossSourceKey ?? null;
    if (crossKey) {
      const existing = await client.query<{ id: string }>(
        "SELECT id::text AS id FROM events WHERE cross_source_key = $1",
        [crossKey],
      );
      if (existing.rows[0]) {
        const eventId = existing.rows[0].id;
        const sourceId = await upsertSource(pool, c);
        await client.query(
          `INSERT INTO event_sources (event_id, source_id, is_primary)
           VALUES ($1::uuid,$2::uuid,$3) ON CONFLICT DO NOTHING`,
          [eventId, sourceId, c.isPrimary],
        );
        for (const id of entities.companyIds) await linkEntity(eventId, "company", id);
        for (const id of entities.drugIds) await linkEntity(eventId, "drug", id);
        if (entities.trialId) await linkEntity(eventId, "trial", entities.trialId);
        await client.query("COMMIT");
        return { eventId, created: false, merged: true };
      }
    }
    // Event-level dedupe: fingerprint UNIQUE — the same event is never
    // inserted twice (spec §7 acceptance: ingest twice → one event).
    // M4: the event stores the extraction's validated summaries, effective
    // confidence, review status (confidence-threshold rules), and a link to
    // the extraction row (provenance + versioning, spec §8.3). On conflict
    // the extraction-derived columns are refreshed (a changed document can
    // move an event into or out of the review queue) while the event row
    // itself — and its provenance links — are preserved.
    const ev = await client.query<{ id: string; existed: boolean }>(
      `WITH ins AS (
         INSERT INTO events (event_type, occurred_at, published_at, headline,
                             factual_summary, catalyst_summary, confidence,
                             review_status, indication, phase, outcome, fingerprint,
                             extraction_id, cross_source_key)
         VALUES ($1,$2::timestamptz,$3::timestamptz,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::uuid,$14)
         ON CONFLICT (fingerprint) DO UPDATE SET
           factual_summary = EXCLUDED.factual_summary,
           catalyst_summary = EXCLUDED.catalyst_summary,
           confidence = EXCLUDED.confidence,
           review_status = EXCLUDED.review_status,
           extraction_id = EXCLUDED.extraction_id,
           cross_source_key = EXCLUDED.cross_source_key
         RETURNING id::text AS id
       )
       SELECT id, false AS existed FROM ins
       UNION ALL
       SELECT id::text AS id, true AS existed FROM events WHERE fingerprint = $12
       LIMIT 1`,
      [
        c.eventType,
        c.occurredAt,
        c.publishedAt,
        c.headline,
        extraction.factualSummary,
        extraction.catalystSummary,
        extraction.confidence,
        extraction.reviewStatus,
        c.indication,
        c.phase,
        c.outcome,
        c.fingerprint,
        extraction.extractionId,
        crossKey,
      ],
    );
    const eventId = ev.rows[0].id;
    const existed = ev.rows[0].existed;
    if (!existed) {
      const sourceId = await upsertSource(pool, c);
      await client.query(
        `INSERT INTO event_sources (event_id, source_id, is_primary)
         VALUES ($1::uuid,$2::uuid,$3) ON CONFLICT DO NOTHING`,
        [eventId, sourceId, c.isPrimary],
      );
      for (const id of entities.companyIds) await linkEntity(eventId, "company", id);
      for (const id of entities.drugIds) await linkEntity(eventId, "drug", id);
      if (entities.trialId) await linkEntity(eventId, "trial", entities.trialId);
    }
    await client.query("COMMIT");
    // M6: alert generation happens after publish, outside the store
    // transaction. It is idempotent (unique constraint), so a crash here
    // can never produce duplicate alerts on the next run.
    return { eventId, created: !existed, merged: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Build the extraction input from a normalized candidate (M4).
 * The deterministic extractor works from the candidate's headline +
 * template summary plus the adapter's verbatim raw record fields — it
 * never invents values absent from these (spec §8.3).
 */
function toExtractionDocument(c: NormalizedCandidate): ExtractionDocument {
  const structured =
    c.rawSnapshot && typeof c.rawSnapshot === "object"
      ? (c.rawSnapshot as Record<string, unknown>)
      : undefined;
  return {
    contentHash: c.contentHash,
    text: [c.headline, c.factualSummary].filter(Boolean).join(" "),
    structured,
    sourceName: c.sourceName,
    canonicalUrl: c.canonicalUrl,
    publisher: c.publisher,
    publishedAt: c.publishedAt,
    eventType: c.eventType ?? undefined,
  };
}
/**
 * Check the raw-snapshot store. Returns true when the document is new or
 * its content changed (and persists the new snapshot); false when it is an
 * unchanged re-fetch.
 */
async function snapshotChanged(pool: Pool, doc: RawSourceDocument): Promise<boolean> {
  const hash = contentHash(doc.raw);
  const canonicalUrl = canonicalizeUrl(doc.canonicalUrl);
  const { rows } = await pool.query<{ content_hash: string }>(
    "SELECT content_hash FROM raw_snapshots WHERE source_name = $1 AND canonical_url = $2",
    [doc.sourceName, canonicalUrl],
  );
  if (rows.length > 0 && rows[0].content_hash === hash) return false;
  await pool.query(
    `INSERT INTO raw_snapshots (source_name, canonical_url, content_hash, raw, retrieved_at)
     VALUES ($1,$2,$3,$4::jsonb,$5::timestamptz)
     ON CONFLICT (source_name, canonical_url) DO UPDATE SET
       content_hash = EXCLUDED.content_hash,
       raw = EXCLUDED.raw,
       retrieved_at = EXCLUDED.retrieved_at`,
    [doc.sourceName, canonicalUrl, hash, JSON.stringify(doc.raw), doc.retrievedAt],
  );
  return true;
}

async function getCursor(pool: Pool, sourceName: string): Promise<Cursor> {
  const { rows } = await pool.query<{ cursor: string }>(
    "SELECT cursor FROM ingestion_cursors WHERE source_name = $1",
    [sourceName],
  );
  return rows[0]?.cursor ?? "";
}

async function setCursor(pool: Pool, sourceName: string, cursor: Cursor): Promise<void> {
  await pool.query(
    `INSERT INTO ingestion_cursors (source_name, cursor, updated_at)
     VALUES ($1,$2,now())
     ON CONFLICT (source_name) DO UPDATE SET cursor = EXCLUDED.cursor, updated_at = now()`,
    [sourceName, cursor],
  );
}

/**
 * Run one ingestion pass for an adapter. Never throws on per-document
 * failures — those are counted as rejections and recorded on the run row
 * (spec §20). Only throws when the run bookkeeping itself fails.
 */
export async function runIngestion(pool: Pool, adapter: SourceAdapter): Promise<IngestionMetrics> {
  const sourceName = adapter.sourceName;
  const startedAt = new Date().toISOString();
  const metrics: IngestionMetrics = {
    sourceName,
    startedAt,
    finishedAt: startedAt,
    status: "failed",
    docsFetched: 0,
    docsChanged: 0,
    eventsCreated: 0,
    eventsRejected: 0,
    eventsMerged: 0,
    extractionProvider: "unselected",
    promptVersion: PROMPT_VERSION,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    extractionsCached: 0,
    alertsCreated: 0,
    newestSourceTs: null,
    error: null,
  };

  const runId = (
    await pool.query<{ id: string }>(
      `INSERT INTO ingestion_runs (source_name, started_at, status)
       VALUES ($1,$2::timestamptz,'running') RETURNING id::text AS id`,
      [sourceName, startedAt],
    )
  ).rows[0].id;

  try {
    const cursor = await getCursor(pool, sourceName);
    // M4: provider selected once per run via MODEL_PROVIDER (default:
    // deterministic offline extractor). See docs/decisions.md for why no
    // real model API is wired.
    const provider: ExtractionProvider = await selectProvider();
    metrics.extractionProvider = provider.providerName;
    const docs = await adapter.fetchSince(cursor);
    metrics.docsFetched = docs.length;

    for (const doc of docs) {
      try {
        const changed = await snapshotChanged(pool, doc);
        if (!changed) continue; // unchanged re-fetch — dedupe layer 1
        metrics.docsChanged += 1;
        if (doc.publishedAt && (!metrics.newestSourceTs || doc.publishedAt > metrics.newestSourceTs)) {
          metrics.newestSourceTs = doc.publishedAt;
        }

        const candidates = await adapter.normalize(doc);
        for (const candidate of candidates) {
          if (!isPublishableCandidate(candidate)) {
            metrics.eventsRejected += 1; // unknown taxonomy / unparseable — never guessed
            continue;
          }
          const c = candidate;
          await upsertTrialRecord(pool, c);
          const entities = await resolveEntities(pool, c);
          const hasRefs =
            c.trialRefs.length > 0 || c.companyNames.length > 0 || c.drugNames.length > 0;
          if (hasRefs && entities.unresolved) {
            metrics.eventsRejected += 1; // references don't resolve — reject, don't guess
            continue;
          }
          // M4 extraction: after normalize → extract → validate → confidence
          // rules → store extraction. Cache (content hash + versions) means
          // re-ingested documents are never re-extracted (spec §8.1).
          // Provider/validation failures resolve to the deterministic
          // fallback inside extractDocument — this line never throws for
          // extraction problems (spec §17).
          const extraction = await extractDocument(pool, provider, toExtractionDocument(c));
          if (extraction.fromCache) metrics.extractionsCached += 1;
          const before = await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM events WHERE fingerprint = $1",
            [c.fingerprint],
          );
          const stored = await storeCandidate(pool, c, entities, extraction);
          await upsertCalendarMilestones(pool, c, entities);
          if (stored.merged) {
            metrics.eventsMerged += 1; // M7: absorbed into an existing event
          } else if (before.rows[0].n === 0) {
            metrics.eventsCreated += 1; // else dedupe layer 2 absorbed it
            // M6: newly published event → in-app alerts for watchers.
            // generateAlertsForEvent is idempotent, so a retry of this
            // block can never duplicate alerts.
            const alertResult = await generateAlertsForEvent(pool, stored.eventId);
            metrics.alertsCreated += alertResult.created;
          }
        }
      } catch (err) {
        metrics.eventsRejected += 1;
        console.error(`[ingestion] ${sourceName}: document rejected:`, (err as Error).message);
      }
    }

    await setCursor(pool, sourceName, adapter.getNextCursor());
    metrics.status = "success";
  } catch (err) {
    metrics.status = "failed";
    metrics.error = (err as Error).message;
  }

  metrics.finishedAt = new Date().toISOString();
  await pool.query(
    `UPDATE ingestion_runs SET finished_at = $2::timestamptz, status = $3,
       docs_fetched = $4, docs_changed = $5, events_created = $6,
       events_rejected = $7, newest_source_ts = $8::timestamptz, error = $9
     WHERE id = $1::uuid`,
    [
      runId,
      metrics.finishedAt,
      metrics.status,
      metrics.docsFetched,
      metrics.docsChanged,
      metrics.eventsCreated,
      metrics.eventsRejected,
      metrics.newestSourceTs,
      metrics.error,
    ],
  );
  return metrics;
}
