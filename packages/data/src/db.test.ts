/**
 * Milestone 2 integration tests — data-access layer against PostgreSQL.
 *
 * Uses the `biocatalyst_test` database (see getTestDatabaseUrl): migrates and
 * reseeds it in beforeAll, so `pnpm test` is self-contained apart from a
 * running local Postgres with the test database present (`pnpm db:setup`
 * creates it). Encodes the spec §17 acceptance criteria that apply to M2:
 * dedupe-free ingestion, provenance on every event, entity linkage, search
 * resolution, pagination, and market-reaction transparency.
 */
import { Pool } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";
import {
  EVENT_TYPES,
  getCompany,
  getCompanyById,
  getDrug,
  getDrugById,
  getDrugsByIndications,
  getEvent,
  getEventsForCompany,
  getTrial,
  getTrialsByIndications,
  getUpcomingTrials,
  getRecentReactionsForCompany,
  getGlobalLinksForCompany,
  listCompanies,
  listDrugs,
  listEvents,
  listGlobalCompanies,
  listIpoPipeline,
  search,
  toEventCard,
} from "./index.js";
import { seedDatabase } from "./seed-db.js";
import { seedCompanies } from "./seed-companies.js";
import { companies as seedCompaniesList } from "./seed.js";
import { globalCompanies } from "./global-companies.js";
import { ipoCompanySeeds, ipoCatalog } from "./ipo-watchlist.js";

/** Full seeded catalog: Indian companies + global majors + IPO seeds. */
const allSeedCompanies = [...seedCompaniesList, ...globalCompanies, ...ipoCompanySeeds];

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: getTestDatabaseUrl(), max: 5 });
  // Point the data layer's singleton at the test DB for these tests.
  process.env.DATABASE_URL = getTestDatabaseUrl();
  await migrate(pool);
  await seedDatabase(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await closePool();
});

describe("seed volumes", () => {
  it("loads all seeded companies, 20 drugs, 20 trials, 30 events", async () => {
    const [c, d, t, e] = await Promise.all([
      pool.query("SELECT count(*)::int AS n FROM companies"),
      pool.query("SELECT count(*)::int AS n FROM drugs"),
      pool.query("SELECT count(*)::int AS n FROM trials"),
      pool.query("SELECT count(*)::int AS n FROM events"),
    ]);
    expect(c.rows[0].n).toBe(allSeedCompanies.length);
    expect(d.rows[0].n).toBe(20);
    expect(t.rows[0].n).toBe(20);
    expect(e.rows[0].n).toBe(30);
  });
});

describe("provenance (§1, §17)", () => {
  it("every event has at least one source with URL + timestamps", async () => {
    const { rows } = await pool.query(
      `SELECT e.id FROM events e
        WHERE NOT EXISTS (SELECT 1 FROM event_sources es WHERE es.event_id = e.id)`,
    );
    expect(rows).toHaveLength(0);

    const bad = await pool.query(
      `SELECT s.id FROM sources s
        WHERE s.url IS NULL OR s.url = ''
           OR s.retrieved_at IS NULL`,
    );
    expect(bad.rows).toHaveLength(0);
  });

  it("event types are all in the taxonomy", async () => {
    const { rows } = await pool.query<{ event_type: string }>(
      "SELECT DISTINCT event_type FROM events",
    );
    for (const r of rows) {
      expect((EVENT_TYPES as readonly string[]).includes(r.event_type)).toBe(true);
    }
  });

  it("unknown fields stay null instead of being guessed (§17)", async () => {
    // Events without a market reaction must come back without one.
    const page = await listEvents({}, undefined, 30);
    const without = page.items.filter((e) => !e.marketReaction);
    expect(without.length).toBeGreaterThan(0);
    for (const e of without) {
      expect(e.marketReaction).toBeUndefined();
    }
  });
});

describe("pagination", () => {
  it("pages newest-first with no overlap via cursor", async () => {
    const p1 = await listEvents({}, undefined, 10);
    expect(p1.items).toHaveLength(10);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await listEvents({}, p1.nextCursor!, 10);
    expect(p2.items).toHaveLength(10);
    const ids = new Set([...p1.items, ...p2.items].map((e) => e.id));
    expect(ids.size).toBe(20);

    const times = [...p1.items, ...p2.items].map((e) => e.occurredAt);
    const sorted = [...times].sort((a, b) => b.localeCompare(a));
    expect(times).toEqual(sorted);
  });

  it("unknown cursor returns the first page", async () => {
    const first = await listEvents({}, undefined, 5);
    const viaUnknown = await listEvents({}, "00000000-0000-0000-0000-000000000000", 5);
    expect(viaUnknown.items.map((e) => e.id)).toEqual(first.items.map((e) => e.id));
  });
});

describe("filters", () => {
  it("filters by event_type", async () => {
    const r = await listEvents({ eventType: "regulatory_approval" }, undefined, 30);
    expect(r.items.length).toBeGreaterThan(0);
    for (const e of r.items) expect(e.eventType).toBe("regulatory_approval");
  });

  it("filters by company", async () => {
    const company = await getCompany("sun-pharma");
    expect(company).toBeDefined();
    const r = await listEvents({ companyId: company!.id }, undefined, 30);
    expect(r.items.length).toBeGreaterThan(0);
    for (const e of r.items) expect(e.companyIds).toContain(company!.id);
    // Cross-check with the dedicated getter.
    const viaGetter = await getEventsForCompany(company!.id);
    expect(viaGetter.map((e) => e.id).sort()).toEqual(r.items.map((e) => e.id).sort());
  });

  it("filters by phase and indication substring", async () => {
    const byPhase = await listEvents({ phase: "Phase 3" }, undefined, 30);
    expect(byPhase.items.length).toBeGreaterThan(0);
    for (const e of byPhase.items) expect(e.phase).toBe("Phase 3");

    const byInd = await listEvents({ indication: "psoriasis" }, undefined, 30);
    expect(byInd.items.length).toBeGreaterThan(0);
    for (const e of byInd.items) {
      expect((e.indication ?? "").toLowerCase()).toContain("psoriasis");
    }
  });

  it("filters by date range", async () => {
    const r = await listEvents(
      { from: "2026-09-28T00:00:00+05:30", to: "2026-09-29T00:00:00+05:30" },
      undefined,
      30,
    );
    expect(r.items.length).toBeGreaterThan(0);
    for (const e of r.items) {
      expect(e.occurredAt >= "2026-09-28T00:00:00+05:30").toBe(true);
      expect(e.occurredAt <= "2026-09-29T00:00:00+05:30").toBe(true);
    }
  });
});

describe("search (§4.6, §17)", () => {
  it("resolves a company by canonical name, ticker, and alias", async () => {
    const byName = await search("Sun Pharmaceutical");
    expect(byName.companies.some((c) => c.slug === "sun-pharma")).toBe(true);

    const byTicker = await search("SUNPHARMA");
    expect(byTicker.companies.some((c) => c.slug === "sun-pharma")).toBe(true);

    const byAlias = await search("DRL");
    expect(byAlias.companies.some((c) => c.slug === "dr-reddys")).toBe(true);
  });

  it("resolves drugs by name/alias and trials by registry id", async () => {
    const drug = await search("SUN-103");
    expect(drug.drugs.some((d) => d.slug === "sun-103")).toBe(true);

    const trial = await search("CTRI/2024/08/071902");
    expect(trial.trials.some((t) => t.registryTrialId === "CTRI/2024/08/071902")).toBe(true);
  });

  it("finds events by headline text", async () => {
    const r = await search("psoriasis");
    expect(r.events.length).toBeGreaterThan(0);
  });

  it("returns empty groups for blank queries", async () => {
    const r = await search("   ");
    expect(r).toEqual({ companies: [], drugs: [], trials: [], events: [] });
  });

  it("lists all seeded companies alphabetically via listCompanies", async () => {
    const companies = await listCompanies();
    expect(companies).toHaveLength(allSeedCompanies.length);
    const names = companies.map((c) => c.canonicalName);
    expect([...names].sort()).toEqual(names);
    expect(names).toContain("Sun Pharmaceutical Industries Ltd");
  });

  it("toEventCard carries company id + slug for watchlist actions", async () => {
    const { items } = await listEvents({}, undefined, 1);
    expect(items.length).toBeGreaterThan(0);
    const card = await toEventCard(items[0]);
    expect(card.company).toBeDefined();
    expect(card.company!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(card.company!.slug).toBeTruthy();
    const byId = await getCompanyById(card.company!.id);
    expect(byId?.slug).toBe(card.company!.slug);
  });
});

describe("explore data functions", () => {
  it("listDrugs returns all 20 drugs alphabetically", async () => {
    const drugs = await listDrugs();
    expect(drugs).toHaveLength(20);
    const names = drugs.map((d) => d.canonicalName);
    expect([...names].sort()).toEqual(names);
  });

  it("getDrugsByIndications matches drugs on any of the indications", async () => {
    const drugs = await getDrugsByIndications(["Type 2 diabetes"]);
    expect(drugs.length).toBeGreaterThan(0);
    for (const d of drugs) {
      expect(d.indications).toContain("Type 2 diabetes");
    }
    expect(await getDrugsByIndications([])).toEqual([]);
  });

  it("getTrialsByIndications returns trials linked to the indications", async () => {
    const trials = await getTrialsByIndications(["Type 2 diabetes", "Obesity"]);
    expect(trials.length).toBeGreaterThan(0);
    expect(await getTrialsByIndications([])).toEqual([]);
  });

  it("seedCompanies is a no-op on an already-seeded database", async () => {
    const result = await seedCompanies(pool);
    expect(result).toEqual({ added: 0, skipped: allSeedCompanies.length });
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM companies");
    expect(rows[0].n).toBe(allSeedCompanies.length);
  });
});

describe("catalyst calendar + compare", () => {
  it("getUpcomingTrials returns future completions soonest-first", async () => {
    // Far-future trial so the test doesn't age out with the seed dates.
    await pool.query(
      `INSERT INTO trials (registry, registry_trial_id, title, phase, status, primary_completion_date)
       VALUES ('CTRI', 'CTRI-CAL-TEST', 'Calendar test trial', 'Phase 3', 'Recruiting', DATE '2030-01-15')
       ON CONFLICT (registry, registry_trial_id) DO NOTHING`,
    );
    const trials = await getUpcomingTrials(100);
    const found = trials.find((t) => t.registryTrialId === "CTRI-CAL-TEST");
    expect(found).toBeDefined();
    expect(found!.primaryCompletionDate).toBe("2030-01-15");
    const today = new Date().toISOString().slice(0, 10);
    const dates = trials.map((t) => t.primaryCompletionDate!);
    for (const d of dates) expect(d >= today).toBe(true);
    expect([...dates].sort()).toEqual(dates);
  });

  it("getRecentReactionsForCompany returns newest-first market moves", async () => {
    const companies = await listCompanies();
    const withMoves = [];
    for (const c of companies) {
      const moves = await getRecentReactionsForCompany(c.id, 5);
      if (moves.length > 0) withMoves.push({ company: c, moves });
    }
    expect(withMoves.length).toBeGreaterThan(0);
    for (const { moves } of withMoves.slice(0, 3)) {
      for (const m of moves) {
        expect(m.eventId.length).toBeGreaterThan(0);
        expect(m.headline.length).toBeGreaterThan(0);
        expect(typeof m.pctChange).toBe("number");
        expect(m.ticker.length).toBeGreaterThan(0);
      }
      const dates = moves.map((m) => m.occurredAt ?? "");
      expect([...dates].sort().reverse()).toEqual(dates);
    }
    expect(
      await getRecentReactionsForCompany("00000000-0000-0000-0000-000000000000", 5),
    ).toEqual([]);
  });
});

describe("entity linkage (§17)", () => {
  it("an event can link to multiple entity types", async () => {
    const page = await listEvents({}, undefined, 30);
    const multi = page.items.filter(
      (e) => e.companyIds.length + e.drugIds.length + e.trialIds.length >= 2,
    );
    expect(multi.length).toBeGreaterThan(0);
  });

  it("company/drug/trial pages resolve with relations", async () => {
    const company = await getCompany("sun-pharma");
    expect(company?.securities.some((s) => s.ticker === "SUNPHARMA")).toBe(true);
    expect(company?.aliases).toContain("Sun Pharma");

    const drug = await getDrug("sun-103");
    expect(drug?.indications).toContain("Plaque psoriasis");
    expect(drug?.companyLinks.some((l) => l.relationshipType === "originator")).toBe(true);

    const trial = await getTrial("CTRI", "CTRI/2024/08/071902");
    expect(trial?.phase).toBe("Phase 3");
    expect(trial?.primaryEndpoints?.length).toBeGreaterThan(0);
    expect(trial?.drugIds.length).toBeGreaterThan(0);
  });

  it("unknown event id returns undefined", async () => {
    expect(await getEvent("00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });
});

describe("market reaction (§9, §17)", () => {
  it("exposes the exact measurement window and provider", async () => {
    const page = await listEvents({}, undefined, 30);
    const withMr = page.items.filter((e) => e.marketReaction);
    expect(withMr.length).toBeGreaterThan(0);
    for (const e of withMr) {
      const mr = e.marketReaction!;
      expect(mr.windowDefinition.length).toBeGreaterThan(0);
      expect(mr.provider.length).toBeGreaterThan(0);
    }
  });

  it("pct math is consistent (nulls stay null, never fabricated)", async () => {
    const { rows } = await pool.query<{
      price_before: number | null;
      price_after: number | null;
      pct_change: number | null;
    }>(
      `SELECT price_before, price_after, pct_change FROM market_reactions
        WHERE price_before IS NOT NULL AND price_after IS NOT NULL
          AND pct_change IS NOT NULL`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const expected = +((r.price_after! / r.price_before! - 1) * 100).toFixed(2);
      expect(Math.abs(r.pct_change! - expected)).toBeLessThan(0.011);
    }
  });
});

describe("review queue (M4, spec §8.3)", () => {
  it("listPendingReview returns pending events lowest-confidence-first with extraction provenance", async () => {
    const { listPendingReview } = await import("./index.js");
    // Seed two pending_review events: one with an extraction row, one without.
    // Random document hash: seedDatabase does not truncate `extractions`, so
    // a fixed hash would collide with rows from previous test runs.
    const { randomBytes } = await import("node:crypto");
    const docHash = randomBytes(32).toString("hex");
    const x = await pool.query<{ id: string }>(
      `INSERT INTO extractions
         (document_hash, provider, prompt_version, schema_version, output,
          factual_summary, catalyst_summary, confidence, review_status, fallback_used)
       VALUES ($1,'deterministic','m4-v1','1.0.0','{}',
               'A factual summary.','A catalyst summary.',0.5,'pending_review',true)
       RETURNING id::text AS id`,
      [docHash],
    );
    await pool.query(
      `INSERT INTO events
         (event_type, occurred_at, published_at, headline, factual_summary,
          catalyst_summary, confidence, review_status, extraction_id)
       VALUES
         ('clinical_trial_result','2026-09-29T00:00:00Z','2026-09-29T00:00:00Z',
          'Low-confidence result event','facts','catalyst',0.5,'pending_review',$1::uuid),
         ('clinical_trial_started','2026-09-30T00:00:00Z','2026-09-30T00:00:00Z',
          'High-confidence started event','facts','catalyst',0.95,'published',NULL)`,
      [x.rows[0].id],
    );
    const queue = await listPendingReview(50);
    expect(queue.pendingCount).toBeGreaterThanOrEqual(1);
    const item = queue.items.find((i) => i.headline === "Low-confidence result event");
    expect(item).toBeDefined();
    expect(item!.confidence).toBe(0.5);
    expect(item!.extractionId).toBe(x.rows[0].id);
    expect(item!.extractionProvider).toBe("deterministic");
    expect(item!.promptVersion).toBe("m4-v1");
    expect(item!.schemaVersion).toBe("1.0.0");
    expect(item!.fallbackUsed).toBe(true);
    // Published events never appear in the queue.
    expect(queue.items.some((i) => i.headline === "High-confidence started event")).toBe(false);
    // Lowest confidence first.
    const confidences = queue.items.map((i) => i.confidence);
    expect([...confidences].sort((a, b) => a - b)).toEqual(confidences);
  });
});

describe("global section data functions", () => {
  it("listGlobalCompanies returns the 19 non-Indian majors", async () => {
    const globals = await listGlobalCompanies();
    expect(globals).toHaveLength(globalCompanies.length);
    for (const c of globals) {
      expect(c.country).not.toBe("India");
      expect(c.securities.length).toBeGreaterThan(0);
    }
    const names = globals.map((c) => c.canonicalName);
    expect(names).toContain("Pfizer Inc");
    expect(names).toContain("Novo Nordisk A/S");
  });

  it("getCompany merges the curated global footprint", async () => {
    const sun = await getCompany("sun-pharma");
    expect(sun?.globalFootprint).toContain("Taro");
    const pfizer = await getCompany("pfizer");
    expect(pfizer?.globalFootprint).toBeUndefined();
  });

  it("getGlobalLinksForCompany resolves both directions", async () => {
    const sunLinks = getGlobalLinksForCompany("sun-pharma");
    expect(sunLinks.length).toBeGreaterThan(0);
    expect(sunLinks.some((l) => l.otherCompany?.slug === "novo-nordisk")).toBe(true);
    // From the global side.
    const novoLinks = getGlobalLinksForCompany("novo-nordisk");
    expect(novoLinks.some((l) => l.otherCompany?.slug === "sun-pharma")).toBe(true);
  });

  it("listIpoPipeline follows the curated catalog with correct initial statuses", async () => {
    const entries = await listIpoPipeline();
    expect(entries).toHaveLength(ipoCatalog.length);
    const bySlug = new Map(entries.map((e) => [e.company.slug, e]));
    // Curated statuses hold when no IPO events are seeded.
    expect(bySlug.get("claroid-pharmaceuticals")?.status).toBe("in_pipeline");
    expect(bySlug.get("hindustan-laboratories")?.status).toBe("in_pipeline");
    expect(bySlug.get("claroid-pharmaceuticals")?.milestone.drhpDate).toBe("2026-09");
    // Injecto already listed — must not start as "watchlist".
    expect(bySlug.get("injecto-polymers")?.status).toBe("listed");
    expect(bySlug.get("injecto-polymers")?.milestone.listingDate).toBe("2026-09-21");
    // Recently listed companies from the main catalog are included.
    expect(bySlug.get("rubicon-research")?.status).toBe("listed");
    expect(bySlug.get("symbiotec")?.status).toBe("listed");
    expect(bySlug.get("rubicon-research")?.company.securities.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(["in_pipeline", "listed", "watchlist"]).toContain(e.status);
      expect(e.latestEvent).toBeNull(); // no IPO events seeded
    }
  });
});
