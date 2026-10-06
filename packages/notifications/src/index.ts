/**
 * In-app notifications — Milestone 6 (spec §14).
 *
 * When a new *published* (high-confidence) catalyst event is ingested, every
 * user whose watchlist contains one of the event's linked companies/drugs
 * gets one in-app alert.
 *
 * Dedupe (spec §14, §17) is structural, not best-effort:
 * `UNIQUE (user_id, event_id, channel)` on the `alerts` table means the same
 * (event, user, channel) can never be inserted twice, even if ingestion
 * re-runs or two workers race — the INSERT is `ON CONFLICT DO NOTHING`.
 *
 * Unfollowing prevents new alerts because generation reads the watchlist at
 * ingest time; there is no persistent subscription row to go stale.
 * Email/push channels arrive in later milestones — M6 is in-app only.
 */
import type { Pool } from "pg";

/** M6 ships the in-app channel only. */
export const CHANNEL_IN_APP = "in_app";

export interface AlertRecord {
  id: string;
  userId: string;
  eventId: string;
  channel: string;
  status: string;
  readAt: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface GenerateAlertsResult {
  /** Number of alert rows newly created by this call. */
  created: number;
  /** Why no alerts were generated (when created === 0 and no error). */
  skipped?: "event_not_found" | "not_published" | "no_followers";
}

function rowToAlert(r: {
  id: string;
  user_id: string;
  event_id: string;
  channel: string;
  status: string;
  read_at: string | null;
  created_at: string;
  delivered_at: string | null;
}): AlertRecord {
  return {
    id: r.id,
    userId: r.user_id,
    eventId: r.event_id,
    channel: r.channel,
    status: r.status,
    readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
  };
}

/**
 * Create in-app alerts for one newly published event.
 *
 * Idempotent: safe to call any number of times for the same event (re-ingest,
 * retries, parallel runs) — the unique constraint absorbs duplicates.
 */
export async function generateAlertsForEvent(
  pool: Pool,
  eventId: string,
): Promise<GenerateAlertsResult> {
  const { rows: events } = await pool.query<{ review_status: string }>(
    "SELECT review_status FROM events WHERE id = $1::uuid",
    [eventId],
  );
  if (events.length === 0) return { created: 0, skipped: "event_not_found" };
  // Only published events alert. "Published" already encodes high confidence:
  // the M4 review gate auto-publishes only above PUBLISH_CONFIDENCE_THRESHOLD
  // (0.85); everything else sits in pending_review for manual approval.
  if (events[0].review_status !== "published") {
    return { created: 0, skipped: "not_published" };
  }

  const { rows } = await pool.query<{ created: number }>(
    `WITH followers AS (
       SELECT DISTINCT w.user_id
       FROM watchlist_items w
       JOIN event_entities ee
         ON ee.entity_type = w.entity_type
        AND ee.entity_id = w.entity_id
       WHERE ee.event_id = $1::uuid
         AND ee.entity_type IN ('company', 'drug')
     )
     INSERT INTO alerts (user_id, event_id, channel, status, delivered_at)
     SELECT f.user_id, $1::uuid, $2, 'delivered', now()
     FROM followers f
     ON CONFLICT (user_id, event_id, channel) DO NOTHING
     RETURNING 1`,
    [eventId, CHANNEL_IN_APP],
  );
  const created = rows.length;
  return created === 0 ? { created, skipped: "no_followers" } : { created };
}

export interface ListAlertsOptions {
  limit?: number;
  /** ISO cursor: return alerts created before this timestamp. */
  before?: string;
  /** When true, only unread alerts. */
  unreadOnly?: boolean;
}

export async function listAlerts(
  pool: Pool,
  userId: string,
  options: ListAlertsOptions = {},
): Promise<AlertRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const params: unknown[] = [userId];
  let where = "a.user_id = $1::uuid";
  if (options.before) {
    params.push(options.before);
    where += ` AND a.created_at < $${params.length}::timestamptz`;
  }
  if (options.unreadOnly) {
    where += " AND a.read_at IS NULL";
  }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT a.id::text AS id, a.user_id::text AS user_id, a.event_id::text AS event_id,
            a.channel, a.status, a.read_at::text AS read_at,
            a.created_at::text AS created_at, a.delivered_at::text AS delivered_at
     FROM alerts a
     WHERE ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(rowToAlert);
}

export async function getUnreadCount(pool: Pool, userId: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM alerts
     WHERE user_id = $1::uuid AND channel = $2 AND read_at IS NULL`,
    [userId, CHANNEL_IN_APP],
  );
  return rows[0].n;
}

export async function markAlertRead(
  pool: Pool,
  userId: string,
  alertId: string,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE alerts SET read_at = now()
     WHERE id = $1::uuid AND user_id = $2::uuid AND read_at IS NULL`,
    [alertId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function markAllAlertsRead(pool: Pool, userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE alerts SET read_at = now()
     WHERE user_id = $1::uuid AND channel = $2 AND read_at IS NULL`,
    [userId, CHANNEL_IN_APP],
  );
  return rowCount ?? 0;
}

export interface DigestEvent {
  alertId: string;
  eventId: string;
  headline: string;
  eventType: string;
  occurredAt: string | null;
  createdAt: string;
}

export interface DigestGroup {
  companyId: string;
  companyName: string;
  companySlug: string;
  events: DigestEvent[];
}

/**
 * Watchlist digest — the user's UNREAD in-app alerts grouped by followed
 * company, newest first within each group. This is the periodic summary:
 * everything that arrived since the user last marked their alerts read.
 * Marking all read (or reading individual alerts) resets it to empty.
 *
 * An event linked to two followed companies appears under both.
 */
export async function getDigest(pool: Pool, userId: string): Promise<DigestGroup[]> {
  const { rows } = await pool.query<{
    company_id: string;
    company_name: string;
    company_slug: string;
    alert_id: string;
    event_id: string;
    headline: string;
    event_type: string;
    occurred_at: string | null;
    created_at: string;
  }>(
    `SELECT c.id::text AS company_id, c.canonical_name AS company_name, c.slug AS company_slug,
            a.id::text AS alert_id, a.event_id::text AS event_id,
            e.headline, e.event_type,
            e.occurred_at::text AS occurred_at, a.created_at::text AS created_at
       FROM alerts a
       JOIN events e ON e.id = a.event_id
       JOIN event_entities ee ON ee.event_id = e.id AND ee.entity_type = 'company'
       JOIN companies c ON c.id = ee.entity_id
      WHERE a.user_id = $1::uuid
        AND a.channel = $2
        AND a.read_at IS NULL
      ORDER BY c.canonical_name ASC, a.created_at DESC`,
    [userId, CHANNEL_IN_APP],
  );
  const groups = new Map<string, DigestGroup>();
  for (const r of rows) {
    let g = groups.get(r.company_id);
    if (!g) {
      g = {
        companyId: r.company_id,
        companyName: r.company_name,
        companySlug: r.company_slug,
        events: [],
      };
      groups.set(r.company_id, g);
    }
    g.events.push({
      alertId: r.alert_id,
      eventId: r.event_id,
      headline: r.headline,
      eventType: r.event_type,
      occurredAt: r.occurred_at ? new Date(r.occurred_at).toISOString().slice(0, 10) : null,
      createdAt: new Date(r.created_at).toISOString(),
    });
  }
  return [...groups.values()];
}
