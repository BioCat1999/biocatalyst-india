/**
 * Milestone 6 — in-app alert tests (spec §14, §17 acceptance):
 *
 * - an alert is created for a follower when a new published high-confidence
 *   event is ingested for a followed company/drug;
 * - ingesting the same event twice produces exactly one alert (strict
 *   (event_id, user_id, channel) dedupe);
 * - unfollowing an entity prevents new alerts for that entity;
 * - non-published (pending_review) events never alert.
 */
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";
import { LocalAuthProvider } from "@biocatalyst/auth";
import {
  generateAlertsForEvent,
  getDigest,
  getUnreadCount,
  listAlerts,
  markAlertRead,
  markAllAlertsRead,
} from "./index.js";

let pool: Pool;
let auth: LocalAuthProvider;

/**
 * Isolated test database — same pattern as ingestion's
 * `biocatalyst_ingestion_test`: parallel `turbo run test` can't interfere.
 */
function getNotificationsTestDatabaseUrl(): string {
  if (process.env.NOTIFICATIONS_TEST_DATABASE_URL)
    return process.env.NOTIFICATIONS_TEST_DATABASE_URL;
  return getTestDatabaseUrl().replace(/\/[^/]*$/, "/biocatalyst_notifications_test");
}

async function makeUser(email: string): Promise<string> {
  const user = await auth.signUp(email, "correct-horse-9");
  return user.id;
}

async function makeCompany(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO companies (canonical_name, slug, active)
     VALUES ($1, $2, true) RETURNING id::text AS id`,
    [name, name.toLowerCase().replace(/\s+/g, "-") + "-" + randomUUID().slice(0, 8)],
  );
  return rows[0].id;
}

/** Inserts an event with the given review status linked to entity ids. */
async function makeEvent(opts: {
  reviewStatus: "published" | "pending_review";
  entities: { type: "company" | "drug"; id: string }[];
}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO events (event_type, occurred_at, headline, confidence, review_status, fingerprint)
     VALUES ('trial_readout', now(), 'fixture event', 0.9, $1, $2)
     RETURNING id::text AS id`,
    [opts.reviewStatus, randomUUID()],
  );
  const eventId = rows[0].id;
  for (const e of opts.entities) {
    await pool.query(
      `INSERT INTO event_entities (event_id, entity_type, entity_id)
       VALUES ($1::uuid, $2, $3::uuid)`,
      [eventId, e.type, e.id],
    );
  }
  return eventId;
}

async function follow(userId: string, entityType: "company" | "drug", entityId: string) {
  await pool.query(
    `INSERT INTO watchlist_items (user_id, entity_type, entity_id)
     VALUES ($1::uuid, $2, $3::uuid) ON CONFLICT DO NOTHING`,
    [userId, entityType, entityId],
  );
}

beforeAll(async () => {
  pool = new Pool({ connectionString: getNotificationsTestDatabaseUrl(), max: 5 });
  process.env.DATABASE_URL = getNotificationsTestDatabaseUrl();
  await migrate(pool);
  auth = new LocalAuthProvider(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await closePool();
});

beforeEach(async () => {
  await pool.query("DELETE FROM alerts");
  await pool.query("DELETE FROM watchlist_items");
  await pool.query("DELETE FROM event_entities");
  await pool.query("DELETE FROM events");
  await pool.query("DELETE FROM companies");
  await pool.query("DELETE FROM sessions");
  await pool.query("DELETE FROM users");
});

describe("generateAlertsForEvent", () => {
  it("alerts followers of the event's company (published event)", async () => {
    const u1 = await makeUser("follower@example.com");
    const u2 = await makeUser("other@example.com");
    const companyId = await makeCompany("AlertCo");
    await follow(u1, "company", companyId);

    const eventId = await makeEvent({
      reviewStatus: "published",
      entities: [{ type: "company", id: companyId }],
    });
    const res = await generateAlertsForEvent(pool, eventId);
    expect(res.created).toBe(1);

    expect(await getUnreadCount(pool, u1)).toBe(1);
    expect(await getUnreadCount(pool, u2)).toBe(0);
    const alerts = await listAlerts(pool, u1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].eventId).toBe(eventId);
    expect(alerts[0].channel).toBe("in_app");
  });

  it("is idempotent: ingesting the same event twice yields one alert (spec §17)", async () => {
    const u1 = await makeUser("idem@example.com");
    const companyId = await makeCompany("IdemCo");
    await follow(u1, "company", companyId);
    const eventId = await makeEvent({
      reviewStatus: "published",
      entities: [{ type: "company", id: companyId }],
    });

    expect((await generateAlertsForEvent(pool, eventId)).created).toBe(1);
    expect((await generateAlertsForEvent(pool, eventId)).created).toBe(0);
    // Even racing parallel calls can't duplicate (unique constraint).
    const results = await Promise.all([
      generateAlertsForEvent(pool, eventId),
      generateAlertsForEvent(pool, eventId),
      generateAlertsForEvent(pool, eventId),
    ]);
    expect(results.every((r) => r.created === 0)).toBe(true);
    expect(await getUnreadCount(pool, u1)).toBe(1);
  });

  it("unfollow prevents new alerts for that entity (spec §17)", async () => {
    const u1 = await makeUser("unfollow@example.com");
    const companyId = await makeCompany("UnfollowCo");
    await follow(u1, "company", companyId);

    const e1 = await makeEvent({
      reviewStatus: "published",
      entities: [{ type: "company", id: companyId }],
    });
    expect((await generateAlertsForEvent(pool, e1)).created).toBe(1);

    // Unfollow — instantly stops future alerts for this entity.
    await pool.query(
      `DELETE FROM watchlist_items
       WHERE user_id = $1::uuid AND entity_type = 'company' AND entity_id = $2::uuid`,
      [u1, companyId],
    );

    const e2 = await makeEvent({
      reviewStatus: "published",
      entities: [{ type: "company", id: companyId }],
    });
    expect((await generateAlertsForEvent(pool, e2)).created).toBe(0);
    expect(await getUnreadCount(pool, u1)).toBe(1); // only the first event's alert
  });

  it("never alerts for non-published events", async () => {
    const u1 = await makeUser("pending@example.com");
    const companyId = await makeCompany("PendingCo");
    await follow(u1, "company", companyId);
    const eventId = await makeEvent({
      reviewStatus: "pending_review",
      entities: [{ type: "company", id: companyId }],
    });
    const res = await generateAlertsForEvent(pool, eventId);
    expect(res.created).toBe(0);
    expect(res.skipped).toBe("not_published");
    expect(await getUnreadCount(pool, u1)).toBe(0);
  });

  it("one alert per follower even with multiple linked entities", async () => {
    const u1 = await makeUser("multi@example.com");
    const c1 = await makeCompany("MultiCo One");
    const c2 = await makeCompany("MultiCo Two");
    await follow(u1, "company", c1);
    await follow(u1, "company", c2);
    const eventId = await makeEvent({
      reviewStatus: "published",
      entities: [
        { type: "company", id: c1 },
        { type: "company", id: c2 },
      ],
    });
    expect((await generateAlertsForEvent(pool, eventId)).created).toBe(1);
  });
});

describe("read state", () => {
  it("marks alerts read individually and in bulk", async () => {
    const u1 = await makeUser("read@example.com");
    const companyId = await makeCompany("ReadCo");
    await follow(u1, "company", companyId);
    const e1 = await makeEvent({
      reviewStatus: "published",
      entities: [{ type: "company", id: companyId }],
    });
    const e2 = await makeEvent({
      reviewStatus: "published",
      entities: [{ type: "company", id: companyId }],
    });
    await generateAlertsForEvent(pool, e1);
    await generateAlertsForEvent(pool, e2);
    expect(await getUnreadCount(pool, u1)).toBe(2);

    const [first] = await listAlerts(pool, u1, { unreadOnly: true });
    expect(await markAlertRead(pool, u1, first.id)).toBe(true);
    expect(await getUnreadCount(pool, u1)).toBe(1);

    expect(await markAllAlertsRead(pool, u1)).toBe(1);
    expect(await getUnreadCount(pool, u1)).toBe(0);
    // Another user's alerts are untouched.
    expect(await markAlertRead(pool, randomUUID(), first.id)).toBe(false);
  });
});

describe("getDigest", () => {
  it("groups unread alerts by company, newest first", async () => {
    const u1 = await makeUser("digest@example.com");
    const coA = await makeCompany("DigestCo A");
    const coB = await makeCompany("DigestCo B");
    await follow(u1, "company", coA);
    await follow(u1, "company", coB);

    const e1 = await makeEvent({ reviewStatus: "published", entities: [{ type: "company", id: coA }] });
    const e2 = await makeEvent({ reviewStatus: "published", entities: [{ type: "company", id: coA }] });
    const e3 = await makeEvent({ reviewStatus: "published", entities: [{ type: "company", id: coB }] });
    await generateAlertsForEvent(pool, e1);
    await generateAlertsForEvent(pool, e2);
    await generateAlertsForEvent(pool, e3);

    const digest = await getDigest(pool, u1);
    expect(digest).toHaveLength(2);
    expect(digest[0].companyName).toBe("DigestCo A");
    expect(digest[0].events).toHaveLength(2);
    expect(digest[1].companyName).toBe("DigestCo B");
    expect(digest[1].events).toHaveLength(1);
    // Newest alert first within a group.
    const created = digest[0].events.map((e) => e.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
  });

  it("an event linked to two followed companies appears under both", async () => {
    const u1 = await makeUser("dupe@example.com");
    const coA = await makeCompany("DupeCo A");
    const coB = await makeCompany("DupeCo B");
    await follow(u1, "company", coA);
    await follow(u1, "company", coB);
    const e1 = await makeEvent({
      reviewStatus: "published",
      entities: [
        { type: "company", id: coA },
        { type: "company", id: coB },
      ],
    });
    await generateAlertsForEvent(pool, e1);

    const digest = await getDigest(pool, u1);
    expect(digest).toHaveLength(2);
    for (const g of digest) {
      expect(g.events).toHaveLength(1);
      expect(g.events[0].eventId).toBe(e1);
    }
  });

  it("reading alerts shrinks the digest; mark-all-read empties it", async () => {
    const u1 = await makeUser("shrink@example.com");
    const coA = await makeCompany("ShrinkCo");
    await follow(u1, "company", coA);
    const e1 = await makeEvent({ reviewStatus: "published", entities: [{ type: "company", id: coA }] });
    const e2 = await makeEvent({ reviewStatus: "published", entities: [{ type: "company", id: coA }] });
    await generateAlertsForEvent(pool, e1);
    await generateAlertsForEvent(pool, e2);

    expect((await getDigest(pool, u1))[0].events).toHaveLength(2);
    const [first] = await listAlerts(pool, u1, { unreadOnly: true });
    await markAlertRead(pool, u1, first.id);
    expect((await getDigest(pool, u1))[0].events).toHaveLength(1);
    await markAllAlertsRead(pool, u1);
    expect(await getDigest(pool, u1)).toEqual([]);
  });

  it("ignores other users' alerts", async () => {
    const u1 = await makeUser("mine@example.com");
    const u2 = await makeUser("theirs@example.com");
    const coA = await makeCompany("OtherCo");
    await follow(u1, "company", coA);
    await follow(u2, "company", coA);
    const e1 = await makeEvent({ reviewStatus: "published", entities: [{ type: "company", id: coA }] });
    await generateAlertsForEvent(pool, e1);
    await markAllAlertsRead(pool, u1);

    expect(await getDigest(pool, u1)).toEqual([]);
    expect((await getDigest(pool, u2))[0].events).toHaveLength(1);
  });
});
