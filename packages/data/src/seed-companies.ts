/**
 * Additively seed companies from the fixtures (seed.ts) into an existing
 * database.
 *
 * Unlike `seed:db` (which TRUNCATEs every domain table), this inserts only
 * companies missing by slug — company row, securities, and curated aliases —
 * so it is safe to run on a database that already holds live-ingested data
 * (trials, news, market reactions). Re-running is a no-op for existing rows.
 *
 * Usage: `pnpm --filter @biocatalyst/data seed:companies`
 * (DATABASE_URL must point at the target database).
 */
import type { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { getPool, closePool, migrate } from "@biocatalyst/db";
import { companies } from "./seed.js";
import { globalCompanies } from "./global-companies.js";
import { ipoCompanySeeds } from "./ipo-watchlist.js";
import type { Company } from "@biocatalyst/types";

export interface SeedCompaniesResult {
  added: number;
  skipped: number;
}

export async function seedCompanies(pool: Pool): Promise<SeedCompaniesResult> {
  let added = 0;
  let skipped = 0;
  // Indian catalog + global pharma + IPO watchlist (unlisted, no securities).
  const all: Company[] = [...companies, ...globalCompanies, ...ipoCompanySeeds];
  for (const c of all) {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO companies (legacy_id, canonical_name, slug, description, country, website)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id::text AS id`,
      [c.id, c.canonicalName, c.slug, c.description, c.country, c.website],
    );
    if (rows.length === 0) {
      skipped++;
      continue;
    }
    const uuid = rows[0].id;
    for (const s of c.securities) {
      await pool.query(
        `INSERT INTO securities (company_id, exchange, ticker, isin, currency)
         VALUES ($1::uuid,$2,$3,$4,$5)
         ON CONFLICT (company_id, exchange, ticker) DO NOTHING`,
        [uuid, s.exchange, s.ticker, s.isin ?? null, s.currency],
      );
    }
    for (const alias of c.aliases) {
      await pool.query(
        `INSERT INTO company_aliases (company_id, alias, alias_type)
         VALUES ($1::uuid,$2,'curated')
         ON CONFLICT DO NOTHING`,
        [uuid, alias],
      );
    }
    added++;
  }
  return { added, skipped };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const pool = getPool();
  try {
    await migrate(pool);
    console.log(JSON.stringify(await seedCompanies(pool)));
  } finally {
    await closePool();
  }
}
