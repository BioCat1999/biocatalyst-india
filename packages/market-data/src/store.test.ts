/**
 * Pipeline wiring tests — Milestone 5.
 *
 * Runs against an ISOLATED `biocatalyst_market_test` database (never the
 * shared `biocatalyst_test`), following the ingestion/extraction packages'
 * pattern. Verifies: reaction upsert for priced securities, the MANKIND
 * missing-data canary (no row fabricated), window/provider/license metadata
 * on every row, and idempotent recompute (a second run changes no rows).
 */
import { Pool } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";
import { FixtureMarketDataProvider, computeAndStoreReactions } from "./index.js";

function marketTestDatabaseUrl(): string {
  // Isolated DB for market-data tests — see scripts/db-setup.sh.
  if (process.env.MARKET_TEST_DATABASE_URL) return process.env.MARKET_TEST_DATABASE_URL;
  const base = getTestDatabaseUrl();
  return base.replace(/\/[^/]*$/, "/biocatalyst_market_test");
}

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: marketTestDatabaseUrl(), max: 5 });
  await migrate(pool);
  // Minimal fixture graph: two companies with NSE securities, one event each.
  await pool.query(`TRUNCATE market_reactions, market_prices, event_entities,
    events, securities, companies RESTART IDENTITY CASCADE`);
  await pool.query(`
    INSERT INTO companies (id, canonical_name, slug) VALUES
      ('11111111-1111-1111-1111-111111111111', 'Sun Pharmaceutical Industries Ltd', 'sun-pharma'),
      ('22222222-2222-2222-2222-222222222222', 'Mankind Pharma Ltd', 'mankind')
    ON CONFLICT (id) DO NOTHING`);
  await pool.query(`
    INSERT INTO securities (company_id, exchange, ticker) VALUES
      ('11111111-1111-1111-1111-111111111111', 'NSE', 'SUNPHARMA'),
      ('22222222-2222-2222-2222-222222222222', 'NSE', 'MANKIND')
    ON CONFLICT DO NOTHING`);
  await pool.query(`
    INSERT INTO events (id, event_type, occurred_at, review_status) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'regulatory_approval',
       '2026-09-29T08:15:00+05:30', 'published'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'regulatory_approval',
       '2026-09-29T08:15:00+05:30', 'published')
    ON CONFLICT (id) DO NOTHING`);
  await pool.query(`
    INSERT INTO event_entities (event_id, entity_type, entity_id) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'company', '11111111-1111-1111-1111-111111111111'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'company', '22222222-2222-2222-2222-222222222222')
    ON CONFLICT DO NOTHING`);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await closePool();
});

const REACTION_COLS = `event_id::text AS event_id, security_id::text AS security_id,
  price_before, price_after, pct_change, benchmark_name, benchmark_pct_change,
  relative_change, window_definition, window_start, window_end, provider,
  license_metadata`;

describe("computeAndStoreReactions", () => {
  it("upserts a §9 reaction for a priced security", async () => {
    const metrics = await computeAndStoreReactions(pool, new FixtureMarketDataProvider());
    expect(metrics.eventsScanned).toBe(2);
    expect(metrics.reactionsUpserted).toBe(1);
    expect(metrics.securitiesWithoutData).toBe(1); // MANKIND
    expect(metrics.errors).toEqual([]);

    const { rows } = await pool.query(
      `SELECT ${REACTION_COLS} FROM market_reactions`,
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.event_id).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(r.provider).toBe("fixture");
    expect(r.license_metadata).toContain("not real market data");
    expect(r.window_definition).toContain("2026-09-28");
    expect(r.window_definition).toContain("2026-09-29");
    expect(r.window_start).not.toBeNull();
    expect(r.window_end).not.toBeNull();
    // §9 math cross-check against the provider's own bars.
    const bars = await new FixtureMarketDataProvider().getPrices(
      { exchange: "NSE", ticker: "SUNPHARMA" },
      "2026-09-01",
      "2026-10-10",
    );
    const before = bars.find((b) => b.date === "2026-09-28")!.close;
    const after = bars.find((b) => b.date === "2026-09-29")!.close;
    expect(r.price_before).toBe(before);
    expect(r.price_after).toBe(after);
    expect(r.pct_change).toBe(Math.round(((after / before - 1) * 100) * 100) / 100);
    expect(r.benchmark_name).toBe("NIFTY Pharma (fixture)");
    expect(r.relative_change).toBeCloseTo(r.pct_change - r.benchmark_pct_change, 2);
  });

  it("MANKIND (no fixture prices) gets no row — missing data is not fabricated", async () => {
    const { rows } = await pool.query(
      `SELECT mr.event_id FROM market_reactions mr
         JOIN securities s ON s.id = mr.security_id
        WHERE s.ticker = 'MANKIND'`,
    );
    expect(rows).toHaveLength(0);
  });

  it("recompute is idempotent: a second run changes no rows", async () => {
    const before = await pool.query(
      `SELECT ${REACTION_COLS} FROM market_reactions ORDER BY event_id, security_id`,
    );
    const metrics = await computeAndStoreReactions(pool, new FixtureMarketDataProvider());
    const after = await pool.query(
      `SELECT ${REACTION_COLS} FROM market_reactions ORDER BY event_id, security_id`,
    );
    expect(after.rows).toEqual(before.rows);
    expect(metrics.reactionsUpserted).toBe(before.rows.length);
  });

  it("market_prices holds the fixture bars the reactions were measured from", async () => {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM market_prices WHERE source_provider = 'fixture'`,
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
