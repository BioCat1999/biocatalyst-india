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
    `WITH watchlist_followers AS (
       SELECT DISTINCT w.user_id
       FROM watchlist_items w
       JOIN event_entities ee
         ON ee.entity_type = w.entity_type
        AND ee.entity_id = w.entity_id
       WHERE ee.event_id = $1::uuid
         AND ee.entity_type IN ('company', 'drug')
     ), monitor_followers AS (
       SELECT DISTINCT m.user_id
         FROM monitor_rules m
         JOIN events e ON e.id = $1::uuid
        WHERE m.enabled
          AND (m.keyword IS NULL OR CONCAT_WS(' ', e.headline, e.factual_summary, e.catalyst_summary, e.indication) ILIKE '%' || m.keyword || '%')
          AND (cardinality(m.event_types) = 0 OR e.event_type = ANY(m.event_types))
          AND (cardinality(m.indications) = 0 OR e.indication = ANY(m.indications))
          AND (cardinality(m.phases) = 0 OR e.phase = ANY(m.phases))
          AND (cardinality(m.countries) = 0 OR EXISTS (
            SELECT 1 FROM event_entities country_ee
            JOIN companies country_company ON country_company.id = country_ee.entity_id
            WHERE country_ee.event_id = e.id
              AND country_ee.entity_type = 'company'
              AND country_company.country = ANY(m.countries)
          ))
     ), followers AS (
       SELECT user_id FROM watchlist_followers
       UNION
       SELECT user_id FROM monitor_followers
     )
     INSERT INTO alerts (user_id, event_id, channel, status, delivered_at)
     SELECT f.user_id, $1::uuid, $2, 'delivered', now()
     FROM followers f
     ON CONFLICT (user_id, event_id, channel) DO NOTHING
     RETURNING 1`,
    [eventId, CHANNEL_IN_APP],
  );
  const created = rows.length;
  // Durable outbox: only users with an Expo token are queued. Delivery is
  // performed by a separate worker so provider latency never blocks ingest.
  await pool.query(
    `INSERT INTO notification_outbox (alert_id, user_id, event_id)
     SELECT DISTINCT a.id, a.user_id, a.event_id
       FROM alerts a
       JOIN push_tokens p ON p.user_id = a.user_id AND p.platform = 'expo'
      WHERE a.event_id = $1::uuid AND a.channel = $2
     ON CONFLICT (alert_id) DO NOTHING`,
    [eventId, CHANNEL_IN_APP],
  );
  return created === 0 ? { created, skipped: "no_followers" } : { created };
}

export interface PushDeliveryResult {
  claimed: number;
  delivered: number;
  failed: number;
}

/** Deliver one bounded outbox batch through Expo Push Service. */
export async function deliverPendingPushNotifications(
  pool: Pool,
  fetchImpl: typeof fetch = globalThis.fetch,
  limit = 100,
): Promise<PushDeliveryResult> {
  const boundedLimit = Math.min(100, Math.max(1, limit));
  const { rows } = await pool.query<{
    id: string; token: string; event_id: string; headline: string;
  }>(
    `WITH claimed AS (
       SELECT o.id
         FROM notification_outbox o
        WHERE o.status IN ('pending','failed')
          AND o.next_attempt <= now() AND o.attempts < 6
        ORDER BY o.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
     ), updated AS (
       UPDATE notification_outbox o
          SET status = 'processing', attempts = attempts + 1, updated_at = now()
         FROM claimed c WHERE o.id = c.id
       RETURNING o.id, o.user_id, o.event_id
     )
     SELECT u.id::text AS id, p.token, u.event_id::text AS event_id, e.headline
       FROM updated u
       JOIN LATERAL (
         SELECT token FROM push_tokens
          WHERE user_id = u.user_id AND platform = 'expo'
          ORDER BY updated_at DESC LIMIT 1
       ) p ON true
       JOIN events e ON e.id = u.event_id`,
    [boundedLimit],
  );
  if (rows.length === 0) return { claimed: 0, delivered: 0, failed: 0 };

  try {
    const response = await fetchImpl("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
      body: JSON.stringify(rows.map((row) => ({
        to: row.token,
        sound: "default",
        title: "BioCatalyst alert",
        body: row.headline.slice(0, 180),
        data: { eventId: row.event_id },
      }))),
    });
    const payload = await response.json() as { data?: Array<{ status?: string; message?: string }> };
    if (!response.ok || !Array.isArray(payload.data)) throw new Error(`Expo push HTTP ${response.status}`);
    let delivered = 0;
    let failed = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const ticket = payload.data[index];
      const ok = ticket?.status === "ok";
      delivered += ok ? 1 : 0;
      failed += ok ? 0 : 1;
      await pool.query(
        `UPDATE notification_outbox SET status = $2,
           next_attempt = CASE WHEN $2 = 'failed' THEN now() + (interval '5 minutes' * attempts) ELSE next_attempt END,
           last_error = $3, updated_at = now() WHERE id = $1::uuid`,
        [rows[index].id, ok ? "delivered" : "failed", ok ? null : (ticket?.message ?? "push rejected")],
      );
    }
    return { claimed: rows.length, delivered, failed };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "push delivery failed";
    await pool.query(
      `UPDATE notification_outbox SET status = 'failed',
         next_attempt = now() + (interval '5 minutes' * attempts),
         last_error = $2, updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [rows.map((row) => row.id), message],
    );
    return { claimed: rows.length, delivered: 0, failed: rows.length };
  }
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
