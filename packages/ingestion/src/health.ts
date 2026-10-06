/**
 * Ingestion health reporting — spec §20.
 *
 * All metrics are derived from the persisted `ingestion_runs` /
 * `ingestion_cursors` tables (migration 003), so health survives process
 * restarts and is identical for the CLI, the admin API, and tests.
 */
import type { Pool } from "pg";

export interface SourceHealth {
  sourceName: string;
  /** ISO timestamp of the last run that finished successfully, or null. */
  lastSuccessfulFetch: string | null;
  /** Newest source `published_at` seen across runs, or null. */
  newestSourceTimestamp: string | null;
  /** Lifetime totals across all runs for this source. */
  docsFetched: number;
  docsChanged: number;
  eventsCreated: number;
  eventsRejected: number;
  /** Status of the most recent run. */
  lastRunStatus: "running" | "success" | "failed" | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastError: string | null;
  /** Current persisted cursor (opaque string owned by the adapter). */
  cursor: string | null;
}

interface HealthRow {
  source_name: string;
  last_successful_fetch: Date | null;
  newest_source_ts: Date | null;
  docs_fetched: number;
  docs_changed: number;
  events_created: number;
  events_rejected: number;
  last_run_status: "running" | "success" | "failed" | null;
  last_run_started_at: Date | null;
  last_run_finished_at: Date | null;
  last_error: string | null;
  cursor: string | null;
}

export async function getSourceHealth(pool: Pool): Promise<SourceHealth[]> {
  const { rows } = await pool.query<HealthRow>(
    `SELECT
       r.source_name,
       MAX(r.finished_at) FILTER (WHERE r.status = 'success') AS last_successful_fetch,
       MAX(r.newest_source_ts) AS newest_source_ts,
       COALESCE(SUM(r.docs_fetched), 0)::int AS docs_fetched,
       COALESCE(SUM(r.docs_changed), 0)::int AS docs_changed,
       COALESCE(SUM(r.events_created), 0)::int AS events_created,
       COALESCE(SUM(r.events_rejected), 0)::int AS events_rejected,
       (SELECT status FROM ingestion_runs r2
         WHERE r2.source_name = r.source_name ORDER BY r2.started_at DESC LIMIT 1) AS last_run_status,
       (SELECT started_at FROM ingestion_runs r2
         WHERE r2.source_name = r.source_name ORDER BY r2.started_at DESC LIMIT 1) AS last_run_started_at,
       (SELECT finished_at FROM ingestion_runs r2
         WHERE r2.source_name = r.source_name ORDER BY r2.started_at DESC LIMIT 1) AS last_run_finished_at,
       (SELECT error FROM ingestion_runs r2
         WHERE r2.source_name = r.source_name ORDER BY r2.started_at DESC LIMIT 1) AS last_error,
       (SELECT cursor FROM ingestion_cursors c WHERE c.source_name = r.source_name) AS cursor
     FROM ingestion_runs r
     GROUP BY r.source_name
     ORDER BY r.source_name`,
  );
  return rows.map((r) => ({
    sourceName: r.source_name,
    lastSuccessfulFetch: r.last_successful_fetch?.toISOString() ?? null,
    newestSourceTimestamp: r.newest_source_ts?.toISOString() ?? null,
    docsFetched: r.docs_fetched,
    docsChanged: r.docs_changed,
    eventsCreated: r.events_created,
    eventsRejected: r.events_rejected,
    lastRunStatus: r.last_run_status,
    lastRunStartedAt: r.last_run_started_at?.toISOString() ?? null,
    lastRunFinishedAt: r.last_run_finished_at?.toISOString() ?? null,
    lastError: r.last_error,
    cursor: r.cursor,
  }));
}

/** A source with no successful run yet is stale by definition (spec §20). */
export function isSourceStale(health: SourceHealth): boolean {
  return health.lastSuccessfulFetch === null;
}
