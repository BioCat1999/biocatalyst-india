#!/usr/bin/env node
/**
 * Ingestion CLI — Milestone 3, extended in Milestone 7 for multi-source runs.
 *
 *   pnpm ingest                        # one pass of EVERY registered adapter
 *   pnpm ingest --source bse-fixture   # one pass of a single adapter
 *
 * Runs against DATABASE_URL, prints the run metrics as JSON (an array when
 * running all sources). Migrations are applied first (idempotent).
 *
 * Network: the live adapters (`ctgov`, `gdelt`) call free, keyless public
 * APIs (ClinicalTrials.gov, GDELT) over HTTPS; the `*-fixture` adapters are
 * offline by design (see docs/decisions.md).
 */
import { getPool, closePool, migrate } from "@biocatalyst/db";
import { createAdapter, listSourceNames, runAllIngestion } from "./registry.js";
import { runIngestion } from "./run.js";

function parseSourceArg(): string | null {
  const idx = process.argv.indexOf("--source");
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) {
    console.error("error: --source requires a value");
    process.exit(2);
  }
  return value;
}

const pool = getPool();
try {
  await migrate(pool);
  const only = parseSourceArg();
  if (only === null) {
    const all = await runAllIngestion(pool);
    console.log(JSON.stringify(all, null, 2));
    if (all.some((m) => m.status !== "success")) process.exitCode = 1;
  } else {
    const adapter = createAdapter(only);
    if (!adapter) {
      console.error(
        `error: unknown source "${only}" — known sources: ${listSourceNames().join(", ")}`,
      );
      process.exit(2);
    }
    const metrics = await runIngestion(pool, adapter);
    console.log(JSON.stringify(metrics, null, 2));
    if (metrics.status !== "success") process.exitCode = 1;
  }
} finally {
  await closePool();
}
