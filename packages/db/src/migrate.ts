/**
 * Minimal SQL migration runner.
 *
 * Applies `migrations/*.sql` in filename order, one transaction per file,
 * recording applied versions in `schema_migrations`. Re-runnable: already
 * applied versions are skipped. Boring on purpose — no ORM, no framework.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Pool } from "pg";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

export async function migrate(pool: Pool): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error(`no migrations found in ${MIGRATIONS_DIR}`);

  const applied: string[] = [];
  const client = await pool.connect();
  try {
    // Bootstrap the bookkeeping table if this is a fresh database.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations",
    );
    const done = new Set(rows.map((r) => r.version));

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (done.has(version)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [version],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${version} failed: ${(err as Error).message}`);
      }
      applied.push(version);
    }
  } finally {
    client.release();
  }
  return applied;
}
