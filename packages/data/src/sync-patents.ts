/**
 * Sync FDA Orange Book patents into the `patents` table.
 *
 * Downloads the monthly Orange Book snapshot ZIP, parses patent.txt +
 * products.txt, resolves applicants to tracked companies, and upserts.
 * Idempotent — safe to re-run (monthly refresh).
 *
 * Usage: `pnpm --filter @biocatalyst/data sync:patents`
 * (DATABASE_URL must point at the target database).
 */
import { pathToFileURL } from "node:url";
import { getPool, closePool, migrate } from "@biocatalyst/db";
import { syncOrangeBookPatents } from "./patents.js";

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const pool = getPool();
  try {
    await migrate(pool);
    console.log(JSON.stringify(await syncOrangeBookPatents(pool)));
  } finally {
    await closePool();
  }
}
