#!/usr/bin/env node
/** CLI: `pnpm --filter @biocatalyst/db migrate` — apply pending migrations. */
import { getPool, closePool } from "./client.js";
import { migrate } from "./migrate.js";

const pool = getPool();
try {
  const applied = await migrate(pool);
  if (applied.length === 0) {
    console.log("migrations: already up to date");
  } else {
    for (const v of applied) console.log(`migrations: applied ${v}`);
  }
} finally {
  await closePool();
}
