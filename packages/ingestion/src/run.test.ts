/**
 * Ingestion runner integration tests — Milestone 3.
 *
 * Runs against an ISOLATED `biocatalyst_ingestion_test` database (never the
 * shared `biocatalyst_test` DB, so the data package's count assertions can't
 * flake). beforeAll migrates + seeds it.
 *
 * Encodes the spec §17 acceptance criteria for M3:
 *  - ingesting the same source document twice creates no duplicate events
 *  - every ingested event has ≥1 source with URL + timestamps + content hash
 *  - unknown/missing fields stay null; unresolvable candidates are rejected
 *  - health metrics (spec §20) are persisted and queryable
 */
import { mkdtempSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";
import { seedDatabase } from "@biocatalyst/data/seed-db";
import { CtriFixtureAdapter } from "./adapters/ctri.js";
import { BseFixtureAdapter } from "./adapters/bse.js";
import { PubmedFixtureAdapter } from "./adapters/pubmed.js";
import { runIngestion } from "./run.js";
import { createAdapter, listSourceNames, runAllIngestion } from "./registry.js";
import { crossSourceKey } from "./normalize.js";
import { getSourceHealth, isSourceStale } from "./health.js";
import { FixtureMarketDataProvider, computeAndStoreReactions } from "@biocatalyst/market-data";

function ingestionTestDatabaseUrl(): string {
  // Isolated DB for ingestion tests — see scripts/db-setup.sh.
  if (process.env.INGESTION_TEST_DATABASE_URL) return process.env.INGESTION_TEST_DATABASE_URL;
  const base = getTestDatabaseUrl();
  return base.replace(/\/[^/]*$/, "/biocatalyst_ingestion_test");
}

/** Same adapter shape but a distinct source name → isolated cursor/runs. */
class EdgeAdapter extends CtriFixtureAdapter {
  override readonly sourceName = "ctri-fixture-edge";
}

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: ingestionTestDatabaseUrl(), max: 5 });
  await migrate(pool);
  // Ingestion state (cursors, snapshots, run history, cached extractions)
  // is NOT cleared by seedDatabase — truncate it so every test run starts
  // from a clean slate. CASCADE also clears events that reference
  // extractions; seedDatabase re-seeds them immediately after.
  await pool.query(
    "TRUNCATE raw_snapshots, ingestion_runs, ingestion_cursors, extractions RESTART IDENTITY CASCADE",
  );
  await seedDatabase(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await closePool();
});

async function eventCount(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM events");
  return rows[0].n;
}

describe("runIngestion — happy path", () => {
  it("first run ingests all 5 fixtures into canonical tables", async () => {
    const metrics = await runIngestion(pool, new CtriFixtureAdapter());
    expect(metrics.status).toBe("success");
    expect(metrics.error).toBeNull();
    expect(metrics.docsFetched).toBe(5);
    expect(metrics.docsChanged).toBe(5);
    expect(metrics.eventsCreated).toBe(5);
    expect(metrics.eventsRejected).toBe(0);
    expect(metrics.newestSourceTs).toBe("2026-09-28T00:00:00.000Z");
    expect(await eventCount()).toBe(35); // 30 seed + 5 ingested
  });

  it("ingesting the same source documents twice creates no duplicate events", async () => {
    const before = await eventCount();
    const metrics = await runIngestion(pool, new CtriFixtureAdapter());
    expect(metrics.status).toBe("success");
    // Cursor advanced past every fixture → nothing fetched the second time.
    expect(metrics.docsFetched).toBe(0);
    expect(metrics.docsChanged).toBe(0);
    expect(metrics.eventsCreated).toBe(0);
    expect(await eventCount()).toBe(before);
  });

  it("re-fetching from the start still dedupes on snapshot + fingerprint", async () => {
    // Reset the cursor to force a full re-fetch of identical documents.
    await pool.query("UPDATE ingestion_cursors SET cursor = '' WHERE source_name = 'ctri-fixture'");
    const before = await eventCount();
    const metrics = await runIngestion(pool, new CtriFixtureAdapter());
    expect(metrics.status).toBe("success");
    expect(metrics.docsFetched).toBe(5);
    expect(metrics.docsChanged).toBe(0); // content hashes unchanged → skipped
    expect(metrics.eventsCreated).toBe(0);
    expect(await eventCount()).toBe(before);
  });
});

describe("provenance (§1, §7, §17)", () => {
  it("every ingested event has ≥1 source with URL, timestamps, hash, source name", async () => {
    const { rows } = await pool.query<{ id: string; headline: string }>(
      `SELECT e.id::text AS id, e.headline FROM events e
        WHERE e.fingerprint IS NOT NULL`,
    );
    expect(rows.length).toBe(5);
    for (const e of rows) {
      const src = await pool.query<{
        url: string;
        published_at: Date | null;
        retrieved_at: Date | null;
        content_hash: string | null;
        source_name: string | null;
        is_primary: boolean;
      }>(
        `SELECT s.url, s.published_at, s.retrieved_at, s.content_hash, s.source_name, es.is_primary
           FROM event_sources es JOIN sources s ON s.id = es.source_id
          WHERE es.event_id = $1::uuid`,
        [e.id],
      );
      expect(src.rows.length, `event ${e.headline}`).toBeGreaterThanOrEqual(1);
      for (const s of src.rows) {
        expect(s.url).toMatch(/^https:\/\/ctri\.nic\.in\//);
        expect(s.retrieved_at).not.toBeNull();
        expect(s.published_at).not.toBeNull();
        expect(s.content_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(s.source_name).toBe("ctri-fixture");
      }
    }
  });

  it("keeps a raw snapshot per ingested document", async () => {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM raw_snapshots WHERE source_name = 'ctri-fixture'`,
    );
    expect(rows[0].n).toBe(5);
    const one = await pool.query(
      `SELECT raw FROM raw_snapshots WHERE source_name = 'ctri-fixture' LIMIT 1`,
    );
    expect(one.rows[0].raw.ctri_number).toMatch(/^CTRI\//);
  });

  it("ingested events link to the canonical trial/company/drug entities", async () => {
    const { rows } = await pool.query<{ headline: string; entity_type: string; canonical: string }>(
      `SELECT e.headline, ee.entity_type,
              COALESCE(c.canonical_name, d.canonical_name, t.registry_trial_id) AS canonical
         FROM events e
         JOIN event_entities ee ON ee.event_id = e.id
         LEFT JOIN companies c ON ee.entity_type = 'company' AND c.id = ee.entity_id
         LEFT JOIN drugs d ON ee.entity_type = 'drug' AND d.id = ee.entity_id
         LEFT JOIN trials t ON ee.entity_type = 'trial' AND t.id = ee.entity_id
        WHERE e.fingerprint IS NOT NULL AND e.headline LIKE '%SUN-103%'
        ORDER BY ee.entity_type`,
    );
    const linked = rows.map((r) => `${r.entity_type}:${r.canonical}`);
    expect(linked).toContain("company:Sun Pharmaceutical Industries Ltd");
    expect(linked).toContain("drug:SUN-103");
    expect(linked).toContain("trial:CTRI/2024/08/071902");
  });

  it("ingested events carry extraction-driven review_status + summaries (M4 rules)", async () => {
    // M4: review_status now follows the confidence-threshold rules
    // (spec §8.3) instead of defaulting to pending_review. Each ingested
    // event links to its extraction row, and the event's stored summaries /
    // confidence / review_status match the extraction's.
    const { rows } = await pool.query<{
      headline: string;
      confidence: number;
      review_status: string;
      extraction_id: string | null;
      x_confidence: number;
      x_review_status: string;
      provider: string;
      prompt_version: string;
      schema_version: string;
      fallback_used: boolean;
      factual_summary: string;
      e_factual_summary: string;
    }>(
      `SELECT e.headline, e.confidence, e.review_status,
              e.extraction_id::text AS extraction_id,
              x.confidence AS x_confidence, x.review_status AS x_review_status,
              x.provider, x.prompt_version, x.schema_version, x.fallback_used,
              x.factual_summary, e.factual_summary AS e_factual_summary
         FROM events e
         JOIN extractions x ON x.id = e.extraction_id
        WHERE e.fingerprint IS NOT NULL`,
    );
    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect(r.extraction_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(r.provider).toBe("deterministic");
      expect(r.prompt_version).toBe("m4-v1");
      expect(r.schema_version).toBe("1.0.0");
      expect(r.fallback_used).toBe(false);
      expect(r.confidence).toBe(r.x_confidence);
      expect(r.review_status).toBe(r.x_review_status);
      expect(r.e_factual_summary).toBe(r.factual_summary);
      expect(["published", "pending_review"]).toContain(r.review_status);
      const words = r.factual_summary.split(/\s+/).filter(Boolean).length;
      expect(words, `factual summary word count for "${r.headline}"`).toBeGreaterThanOrEqual(80);
      expect(words, `factual summary word count for "${r.headline}"`).toBeLessThanOrEqual(150);
    }
  });
});

describe("rejection — unknown stays null, unresolvable rejected", () => {
  it("rejects records with unmappable status or unresolvable entities", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctri-edge-"));
    const rec = (overrides: object) =>
      JSON.stringify({
        record_type: "ctri_trial_record",
        registration_date: "2026-09-20",
        last_updated: "2026-09-26",
        phase: "Phase 3",
        ...overrides,
      });
    // Unknown status → eventType null → rejected, never guessed.
    writeFileSync(
      join(dir, "a-unknown-status.json"),
      rec({
        ctri_number: "CTRI/2024/08/071902",
        source_url: "https://ctri.nic.in/Clinicaltrials/pmaindet2.php?trialid=071902&edge=a",
        recruitment_status: "Mystery Status",
        sponsor_name: "Sun Pharmaceutical Industries Ltd",
        intervention_name: "SUN-103",
        health_condition: "Psoriasis",
      }),
    );
    // Publishable shape but nothing resolves in the catalog → rejected.
    writeFileSync(
      join(dir, "b-unknown-entities.json"),
      rec({
        ctri_number: "CTRI/2099/99/999999",
        source_url: "https://ctri.nic.in/Clinicaltrials/pmaindet2.php?trialid=999999",
        recruitment_status: "Recruiting",
        sponsor_name: "Nonexistent Pharma Pvt Ltd",
        intervention_name: "FAKE-999",
        health_condition: "Fictional condition",
        public_title: "Fake trial that resolves to nothing",
      }),
    );
    try {
      const before = await eventCount();
      const metrics = await runIngestion(pool, new EdgeAdapter(dir));
      expect(metrics.status).toBe("success");
      expect(metrics.docsFetched).toBe(2);
      expect(metrics.docsChanged).toBe(2);
      expect(metrics.eventsCreated).toBe(0);
      expect(metrics.eventsRejected).toBe(2);
      expect(await eventCount()).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("health metrics (spec §20)", () => {
  it("reports last successful fetch, newest source ts, totals, and cursor", async () => {
    const health = await getSourceHealth(pool);
    const h = health.find((x) => x.sourceName === "ctri-fixture");
    expect(h).toBeDefined();
    expect(h!.lastRunStatus).toBe("success");
    expect(h!.lastSuccessfulFetch).not.toBeNull();
    expect(h!.newestSourceTimestamp).toBe("2026-09-28T00:00:00.000Z");
    expect(h!.docsFetched).toBeGreaterThanOrEqual(5);
    expect(h!.docsChanged).toBe(5);
    expect(h!.eventsCreated).toBe(5);
    expect(h!.eventsRejected).toBe(0);
    expect(h!.lastError).toBeNull();
    expect(h!.cursor).toBe("2026-09-28T00:00:00.000Z");
    expect(isSourceStale(h!)).toBe(false);
  });

  it("records failed runs without losing prior metrics", async () => {
    // A run whose adapter throws mid-fetch is recorded as failed.
    const boom = new CtriFixtureAdapter();
    boom.fetchSince = async () => {
      throw new Error("simulated fetch failure");
    };
    const metrics = await runIngestion(pool, boom);
    expect(metrics.status).toBe("failed");
    expect(metrics.error).toContain("simulated fetch failure");
    const health = await getSourceHealth(pool);
    const h = health.find((x) => x.sourceName === "ctri-fixture")!;
    expect(h.lastRunStatus).toBe("failed");
    expect(h.lastError).toContain("simulated fetch failure");
    // Prior success is still reported — a failure must not erase history.
    expect(h.lastSuccessfulFetch).not.toBeNull();
    expect(h.eventsCreated).toBe(5);
  });
});

describe("extraction wiring — ambiguous outcome (M4, spec §8.3)", () => {
  it("routes an ambiguous-outcome document to pending_review via extraction rules", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctri-amb-"));
    writeFileSync(
      join(dir, "ambiguous.json"),
      JSON.stringify({
        record_type: "ctri_trial_record",
        ctri_number: "CTRI/2024/08/071902",
        source_url: "https://ctri.nic.in/Clinicaltrials/pmaindet2.php?trialid=071902&edge=amb",
        recruitment_status: "Completed",
        sponsor_name: "Sun Pharmaceutical Industries Ltd",
        intervention_name: "SUN-103",
        health_condition: "Moderate-to-severe plaque psoriasis",
        phase: "Phase 3",
        public_title:
          "Phase 3 study of SUN-103: early results suggest an encouraging trend toward the primary endpoint",
        registration_date: "2024-08-14",
        last_updated: "2026-09-29",
      }),
    );
    try {
      const metrics = await runIngestion(pool, new EdgeAdapter(dir));
      expect(metrics.status).toBe("success");
      expect(metrics.eventsCreated).toBe(1);
      expect(metrics.extractionProvider).toBe("deterministic");
      const { rows } = await pool.query<{
        headline: string;
        review_status: string;
        outcome: string | null;
        confidence: number;
        fallback_used: boolean;
      }>(
        `SELECT e.headline, e.review_status, x.output->>'outcome' AS outcome,
                e.confidence, x.fallback_used
           FROM events e JOIN extractions x ON x.id = e.extraction_id
          WHERE e.fingerprint IS NOT NULL
            AND e.headline LIKE '%SUN-103%'
            AND e.review_status = 'pending_review'
          ORDER BY e.occurred_at DESC LIMIT 1`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].outcome).toBe("unknown"); // ambiguous → unknown, never guessed
      expect(rows[0].confidence).toBeLessThan(0.85);
      expect(rows[0].fallback_used).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("re-ingesting unchanged documents skips extraction entirely (spec §8.1)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ctri-cache-"));
    writeFileSync(
      join(dir, "record.json"),
      JSON.stringify({
        record_type: "ctri_trial_record",
        ctri_number: "CTRI/2025/02/080117",
        source_url: "https://ctri.nic.in/Clinicaltrials/pmaindet2.php?trialid=080117&edge=cache",
        recruitment_status: "Not yet recruiting",
        sponsor_name: "Cipla Ltd",
        intervention_name: "CPL-NEB",
        health_condition: "Moderate chronic obstructive pulmonary disease (COPD)",
        phase: "Phase 2",
        registration_date: "2025-02-11",
        last_updated: "2026-09-30",
      }),
    );
    try {
      const first = await runIngestion(pool, new EdgeAdapter(dir));
      expect(first.status).toBe("success");
      expect(first.docsChanged).toBe(1);
      expect(first.eventsCreated).toBe(1);
      expect(first.extractionsCached).toBe(0);
      // Reset cursor to force a full re-fetch of identical documents.
      await pool.query(
        "UPDATE ingestion_cursors SET cursor = '' WHERE source_name = 'ctri-fixture-edge'",
      );
      const second = await runIngestion(pool, new EdgeAdapter(dir));
      expect(second.status).toBe("success");
      expect(second.docsFetched).toBe(1);
      expect(second.docsChanged).toBe(0); // snapshot dedupe: never re-extracted
      expect(second.eventsCreated).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * Milestone 7 — multi-source ingestion, cross-source dedupe, and
 * downstream pipelines (alerts, market reaction) for the new sources.
 *
 * These describes run after the M3/M4 ones; they use only the new source
 * names (`bse-fixture`, `pubmed-fixture`), so the CTRI assertions above are
 * unaffected. The cross-source test runs first and cleans up after itself
 * (deletes its event + ingestion state) so the full multi-source run that
 * follows starts from a pristine cursor.
 */

const PAIR_TRIAL = { registry: "CTRI", registryTrialId: "CTRI/2023/11/059344" };
const PAIR_KEY = crossSourceKey(PAIR_TRIAL);

/** Copy the real cross-source pair fixtures into isolated temp dirs. */
function pairFixtureDirs(): { bseDir: string; pubDir: string } {
  const here = dirname(fileURLToPath(import.meta.url));
  const bseDir = mkdtempSync(join(tmpdir(), "m7-bse-pair-"));
  const pubDir = mkdtempSync(join(tmpdir(), "m7-pubmed-pair-"));
  copyFileSync(
    join(here, "adapters", "fixtures", "bse", "bse-2026-09-24-drreddys-drldenosumab-results.json"),
    join(bseDir, "pair.json"),
  );
  copyFileSync(
    join(here, "adapters", "fixtures", "pubmed", "pubmed-2026-09-29-drldenosumab-p3.json"),
    join(pubDir, "pair.json"),
  );
  return { bseDir, pubDir };
}

describe("cross-source dedupe (M7)", () => {
  it("merges the same trial readout from bse-fixture + pubmed-fixture into ONE event with both sources", async () => {
    const { bseDir, pubDir } = pairFixtureDirs();
    try {
      const before = await eventCount();

      // BSE first: creates the event (first writer wins on headline/type).
      const m1 = await runIngestion(pool, new BseFixtureAdapter(bseDir));
      expect(m1.status).toBe("success");
      expect(m1.docsFetched).toBe(1);
      expect(m1.eventsCreated).toBe(1);
      expect(m1.eventsMerged).toBe(0);

      // PubMed second: same trial → merges instead of creating a duplicate.
      const m2 = await runIngestion(pool, new PubmedFixtureAdapter(pubDir));
      expect(m2.status).toBe("success");
      expect(m2.docsFetched).toBe(1);
      expect(m2.docsChanged).toBe(1);
      expect(m2.eventsCreated).toBe(0);
      expect(m2.eventsMerged).toBe(1);

      expect(await eventCount()).toBe(before + 1);

      // ONE event row, with BOTH sources linked via event_sources.
      const { rows } = await pool.query<{
        id: string;
        event_type: string;
        headline: string;
        cross_source_key: string;
        source_name: string;
        canonical_url: string;
      }>(
        `SELECT e.id::text AS id, e.event_type, e.headline, e.cross_source_key,
                s.source_name, s.canonical_url
           FROM events e
           JOIN event_sources es ON es.event_id = e.id
           JOIN sources s ON s.id = es.source_id
          WHERE e.cross_source_key = $1`,
        [PAIR_KEY],
      );
      expect(rows.length).toBe(2); // one row per linked source
      const ids = new Set(rows.map((r) => r.id));
      expect(ids.size).toBe(1); // …but a single event
      const ev = rows[0];
      expect(ev.cross_source_key).toBe(PAIR_KEY);
      expect(ev.event_type).toBe("clinical_trial_result"); // BSE wrote first
      expect(ev.headline).toContain("Dr. Reddy's Laboratories Ltd");
      expect(rows.map((r) => r.source_name).sort()).toEqual(["bse-fixture", "pubmed-fixture"]);
      for (const r of rows) {
        expect(r.canonical_url).toMatch(/^https:\/\//);
      }

      // The merged event links the canonical company, drug, and trial.
      const linked = await pool.query<{ entity_type: string; canonical: string }>(
        `SELECT ee.entity_type,
                COALESCE(c.canonical_name, d.canonical_name, t.registry_trial_id) AS canonical
           FROM event_entities ee
           LEFT JOIN companies c ON ee.entity_type = 'company' AND c.id = ee.entity_id
           LEFT JOIN drugs d ON ee.entity_type = 'drug' AND d.id = ee.entity_id
           LEFT JOIN trials t ON ee.entity_type = 'trial' AND t.id = ee.entity_id
          WHERE ee.event_id = $1::uuid`,
        [ev.id],
      );
      const kinds = linked.rows.map((r) => `${r.entity_type}:${r.canonical}`);
      expect(kinds).toContain("company:Dr. Reddy's Laboratories Ltd");
      expect(kinds).toContain("drug:DRL-Denosumab");
      expect(kinds).toContain("trial:CTRI/2023/11/059344");
    } finally {
      // Restore pristine state so the full multi-source run below starts
      // from clean cursors/snapshots (event delete cascades to
      // event_sources, event_entities, and alerts).
      await pool.query("DELETE FROM events WHERE cross_source_key = $1", [PAIR_KEY]);
      await pool.query(
        "DELETE FROM raw_snapshots WHERE source_name IN ('bse-fixture','pubmed-fixture')",
      );
      await pool.query(
        "DELETE FROM ingestion_runs WHERE source_name IN ('bse-fixture','pubmed-fixture')",
      );
      await pool.query(
        "DELETE FROM ingestion_cursors WHERE source_name IN ('bse-fixture','pubmed-fixture')",
      );
      rmSync(bseDir, { recursive: true, force: true });
      rmSync(pubDir, { recursive: true, force: true });
    }
  });
});

describe("multi-source ingestion (M7)", () => {
  // Live adapters must not hit the network in tests:
  // stub global fetch to return empty result sets for their API shapes.
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      (async (url: unknown) => {
        const u = String(url);
        if (u.includes("clinicaltrials.gov")) {
          return { ok: true, json: async () => ({ studies: [] }) };
        }
        if (u.includes("gdeltproject.org")) {
          return { ok: true, json: async () => ({ articles: [] }) };
        }
        if (u.includes("sunpharma.com")) {
          return {
            ok: true,
            text: async () => `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`,
          };
        }
        if (u.includes("prnewswire.com")) {
          return {
            ok: true,
            text: async () => `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`,
          };
        }
        if (u.includes("api.fda.gov")) {
          return { ok: true, json: async () => ({ results: [] }) };
        }
        if (u.includes("eutils.ncbi.nlm.nih.gov")) {
          return { ok: true, json: async () => ({ esearchresult: { idlist: [] } }) };
        }
        if (u.includes("sebi.gov.in")) {
          return {
            ok: true,
            text: async () => `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`,
          };
        }
        if (u.includes("gov.uk") || u.includes("ema.europa.eu")) {
          return {
            ok: true,
            text: async () => `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`,
          };
        }
        throw new Error(`unexpected fetch in test: ${u}`);
      }) as unknown as typeof fetch,
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runAllIngestion runs every registered adapter with per-source metrics", async () => {
    expect(listSourceNames()).toEqual(["ctri-fixture", "bse-fixture", "pubmed-fixture", "ctgov", "gdelt", "press-rss", "prnewswire", "openfda", "pubmed", "sebi-rss", "mhra-rss", "ema-rss"]);
    const before = await eventCount();
    const all = await runAllIngestion(pool);
    expect(all).toHaveLength(12);
    const byName = Object.fromEntries(all.map((m) => [m.sourceName, m]));
    for (const m of all) {
      expect(m.status).toBe("success");
      expect(m.error).toBeNull();
    }
    // Live sources are stubbed to empty in tests — they succeed with no docs.
    for (const name of ["ctgov", "gdelt", "press-rss", "prnewswire", "openfda", "pubmed", "sebi-rss", "mhra-rss", "ema-rss"]) {
      expect(byName[name].docsFetched).toBe(0);
      expect(byName[name].eventsCreated).toBe(0);
    }
    // ctri-fixture was fully ingested by the earlier describes → idle run.
    expect(byName["ctri-fixture"].docsFetched).toBe(0);
    expect(byName["ctri-fixture"].eventsCreated).toBe(0);
    // bse-fixture: 5 docs → 5 events (the DRL pair creates its event here;
    // PubMed merges into it below).
    expect(byName["bse-fixture"].docsFetched).toBe(5);
    expect(byName["bse-fixture"].docsChanged).toBe(5);
    expect(byName["bse-fixture"].eventsCreated).toBe(5);
    expect(byName["bse-fixture"].eventsMerged).toBe(0);
    expect(byName["bse-fixture"].newestSourceTs).toBe("2026-09-25T11:15:00.000Z");
    // pubmed-fixture: 3 docs → 2 new events + 1 cross-source merge.
    expect(byName["pubmed-fixture"].docsFetched).toBe(3);
    expect(byName["pubmed-fixture"].docsChanged).toBe(3);
    expect(byName["pubmed-fixture"].eventsCreated).toBe(2);
    expect(byName["pubmed-fixture"].eventsMerged).toBe(1);
    expect(byName["pubmed-fixture"].newestSourceTs).toBe("2026-09-28T18:30:00.000Z");
    expect(await eventCount()).toBe(before + 7);
  });

  it("re-running all sources is idempotent (no duplicates, no new merges)", async () => {
    const before = await eventCount();
    const all = await runAllIngestion(pool);
    for (const m of all) {
      expect(m.status).toBe("success");
      expect(m.docsFetched).toBe(0);
      expect(m.eventsCreated).toBe(0);
      expect(m.eventsMerged).toBe(0);
    }
    expect(await eventCount()).toBe(before);
  });

  it("per-source health (spec §20) covers all three sources", async () => {
    const health = await getSourceHealth(pool);
    for (const name of ["ctri-fixture", "bse-fixture", "pubmed-fixture"]) {
      const h = health.find((x) => x.sourceName === name);
      expect(h, `health for ${name}`).toBeDefined();
      expect(h!.lastRunStatus).toBe("success");
      expect(h!.lastSuccessfulFetch).not.toBeNull();
      expect(h!.newestSourceTimestamp).not.toBeNull();
      expect(h!.cursor).toBeTruthy();
      expect(h!.lastError).toBeNull();
      expect(isSourceStale(h!)).toBe(false);
    }
    const bse = health.find((x) => x.sourceName === "bse-fixture")!;
    expect(bse.eventsCreated).toBe(5);
    expect(bse.eventsRejected).toBe(0);
    const pubmed = health.find((x) => x.sourceName === "pubmed-fixture")!;
    expect(pubmed.eventsCreated).toBe(2);
  });

  it("createAdapter resolves known sources and rejects unknown ones", () => {
    expect(createAdapter("ctri-fixture")?.sourceName).toBe("ctri-fixture");
    expect(createAdapter("bse-fixture")?.sourceName).toBe("bse-fixture");
    expect(createAdapter("pubmed-fixture")?.sourceName).toBe("pubmed-fixture");
    expect(createAdapter("no-such-source")).toBeNull();
  });

  it("new-source events carry provenance: URL, timestamps, hash, raw snapshot", async () => {
    for (const sourceName of ["bse-fixture", "pubmed-fixture"]) {
      const { rows } = await pool.query<{ id: string; headline: string }>(
        `SELECT e.id::text AS id, e.headline FROM events e
          WHERE e.id IN (
            SELECT es.event_id FROM event_sources es
            JOIN sources s ON s.id = es.source_id
            WHERE s.source_name = $1
          )`,
        [sourceName],
      );
      expect(rows.length, `${sourceName} events`).toBeGreaterThan(0);
      for (const e of rows) {
        const src = await pool.query<{
          url: string;
          published_at: Date | null;
          retrieved_at: Date | null;
          content_hash: string | null;
          source_name: string | null;
        }>(
          `SELECT s.url, s.published_at, s.retrieved_at, s.content_hash, s.source_name
             FROM event_sources es JOIN sources s ON s.id = es.source_id
            WHERE es.event_id = $1::uuid`,
          [e.id],
        );
        expect(src.rows.length, `event ${e.headline}`).toBeGreaterThanOrEqual(1);
        for (const s of src.rows) {
          expect(s.url).toMatch(/^https:\/\//);
          expect(s.retrieved_at).not.toBeNull();
          expect(s.published_at).not.toBeNull();
          expect(s.content_hash).toMatch(/^[0-9a-f]{64}$/);
        }
      }
      const snaps = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM raw_snapshots WHERE source_name = $1",
        [sourceName],
      );
      expect(snaps.rows[0].n, `${sourceName} snapshots`).toBeGreaterThan(0);
    }
  });

  it("new-source events carry extraction-driven review_status + summaries (M4 rules)", async () => {
    const { rows } = await pool.query<{ headline: string; review_status: string; provider: string }>(
      `SELECT e.headline, e.review_status, x.provider
         FROM events e
         JOIN extractions x ON x.id = e.extraction_id
         JOIN event_sources es ON es.event_id = e.id
         JOIN sources s ON s.id = es.source_id
        WHERE s.source_name IN ('bse-fixture','pubmed-fixture')
        GROUP BY e.headline, e.review_status, x.provider`,
    );
    expect(rows.length).toBe(7);
    for (const r of rows) {
      expect(r.provider).toBe("deterministic");
      expect(["published", "pending_review"]).toContain(r.review_status);
    }
  });
});

describe("alerts for new-source events (M6 pipeline, M7 sources)", () => {
  it("a watcher of the event's company gets exactly one alert when a bse-fixture event is published", async () => {
    // New BSE record (not in the static fixture set) so this run creates a
    // fresh event while the watcher exists.
    const dir = mkdtempSync(join(tmpdir(), "m7-bse-alert-"));
    writeFileSync(
      join(dir, "alert-test.json"),
      JSON.stringify({
        record_type: "exchange_announcement",
        announcement_id: "BSE-2026-0930-SUN-ALERT",
        exchange: "BSE",
        company_name: "Sun Pharmaceutical Industries Ltd",
        ticker_symbol: "SUNPHARMA",
        category: "regulatory_approval",
        announcement_date: "2026-09-30T09:00:00+05:30",
        published_at: "2026-09-30T09:00:00+05:30",
        public_title: "Sun Pharmaceutical Industries Ltd receives CDSCO marketing authorisation for SUN-103",
        drug_name: "SUN-103",
        indication: "Plaque psoriasis",
        source_url: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/fictional-sun-alert-test.pdf",
      }),
    );
    try {
      const user = (
        await pool.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, display_name)
           VALUES ('m7-alerts@example.com', 'not-a-real-hash', 'M7 Alerts')
           RETURNING id::text AS id`,
        )
      ).rows[0].id;
      const companyId = (
        await pool.query<{ id: string }>(
          "SELECT id::text AS id FROM companies WHERE canonical_name = 'Sun Pharmaceutical Industries Ltd'",
        )
      ).rows[0].id;
      await pool.query(
        `INSERT INTO watchlist_items (user_id, entity_type, entity_id)
         VALUES ($1::uuid, 'company', $2::uuid) ON CONFLICT DO NOTHING`,
        [user, companyId],
      );

      const metrics = await runIngestion(pool, new BseFixtureAdapter(dir));
      expect(metrics.status).toBe("success");
      expect(metrics.eventsCreated).toBe(1);
      expect(metrics.alertsCreated).toBe(1);

      const alerts = await pool.query<{ headline: string }>(
        `SELECT e.headline FROM alerts a JOIN events e ON e.id = a.event_id
          WHERE a.user_id = $1::uuid`,
        [user],
      );
      expect(alerts.rows).toHaveLength(1);
      expect(alerts.rows[0].headline).toContain("SUN-103");

      // Re-ingest (cursor reset forces a full re-fetch): snapshot dedupe
      // means no new event, and the alert hook never duplicates.
      await pool.query("UPDATE ingestion_cursors SET cursor = '' WHERE source_name = 'bse-fixture'");
      const again = await runIngestion(pool, new BseFixtureAdapter(dir));
      expect(again.status).toBe("success");
      expect(again.docsChanged).toBe(0);
      expect(again.alertsCreated).toBe(0);
      const still = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM alerts WHERE user_id = $1::uuid",
        [user],
      );
      expect(still.rows[0].n).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("market reaction for new-source events (M5 pipeline, M7 sources)", () => {
  it("computes §9 reactions for new-source events; nulls where fixture data is absent", async () => {
    // One event per linked company for the bse-fixture source.
    const { rows: events } = await pool.query<{ id: string; company: string }>(
      `SELECT DISTINCT ON (c.canonical_name) e.id::text AS id, c.canonical_name AS company
         FROM events e
         JOIN event_entities ee ON ee.event_id = e.id AND ee.entity_type = 'company'
         JOIN companies c ON c.id = ee.entity_id
         JOIN event_sources es ON es.event_id = e.id
         JOIN sources s ON s.id = es.source_id AND s.source_name = 'bse-fixture'
        WHERE e.review_status = 'published' AND e.occurred_at IS NOT NULL
        ORDER BY c.canonical_name, e.occurred_at DESC`,
    );
    const byCompany = Object.fromEntries(events.map((e) => [e.company, e.id]));
    expect(byCompany["Sun Pharmaceutical Industries Ltd"]).toBeDefined();
    expect(byCompany["Mankind Pharma Ltd"]).toBeDefined();

    const res = await computeAndStoreReactions(pool, new FixtureMarketDataProvider(), {
      eventIds: [byCompany["Sun Pharmaceutical Industries Ltd"], byCompany["Mankind Pharma Ltd"]],
    });
    expect(res.provider).toBe("fixture");
    expect(res.eventsScanned).toBe(2);

    // Sun Pharma: fixture prices exist → a real reaction row.
    const sun = await pool.query<{ pct_change: number | null; provider: string }>(
      `SELECT pct_change, provider FROM market_reactions WHERE event_id = $1::uuid`,
      [byCompany["Sun Pharmaceutical Industries Ltd"]],
    );
    expect(sun.rows).toHaveLength(1);
    expect(sun.rows[0].provider).toBe("fixture");
    expect(sun.rows[0].pct_change).not.toBeNull();

    // Mankind: deliberately absent from the fixture price series (M5
    // missing-data canary) → no row fabricated, counted instead.
    const mnk = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM market_reactions WHERE event_id = $1::uuid`,
      [byCompany["Mankind Pharma Ltd"]],
    );
    expect(mnk.rows[0].n).toBe(0);
    expect(res.securitiesWithoutData).toBeGreaterThanOrEqual(1);
  });
});
