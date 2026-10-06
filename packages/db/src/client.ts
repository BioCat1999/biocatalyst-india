/**
 * Database client for @biocatalyst/db.
 *
 * Single `pg` Pool per process, configured from DATABASE_URL.
 * Importing this module never connects — the pool connects lazily on the
 * first query, so `next build` / `vitest` collection don't need a live DB
 * until a query actually runs.
 */
import { Pool } from "pg";

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env or run `pnpm db:setup` " +
        "to create the local Postgres role/databases.",
    );
  }
  return url;
}

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      // Small pool: single Next.js server / CLI process.
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (err) => {
      // Don't crash the process on idle-client errors; surface loudly.
      console.error("[db] unexpected pool error:", err);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** Test-database URL. Defaults to the conventional local test database created
 *  by `pnpm db:setup` (override with TEST_DATABASE_URL). Never the dev DB. */
export function getTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  return "postgresql://biocatalyst:biocatalyst@localhost:5432/biocatalyst_test";
}
