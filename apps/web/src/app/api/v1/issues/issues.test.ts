/**
 * Milestone 8 — issue-report API tests (spec §21 data-correction mechanism).
 *
 * POST /api/v1/issues: Zod validation (400 on bad input), storage of a valid
 * report in `issue_reports` (201 + row round-trips), 400 on unknown event_id.
 * GET /api/v1/admin/issues: admin gating (403 without token) and listing.
 *
 * DB-backed against `biocatalyst_web_test` — same isolated pattern as
 * auth-flow.test.ts. Route handlers are exercised directly (no server needed).
 */
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";

import { POST as reportIssue } from "./route.js";
import { GET as listAdminIssues } from "../admin/issues/route.js";

let pool: Pool;

function getWebTestDatabaseUrl(): string {
  if (process.env.WEB_TEST_DATABASE_URL) return process.env.WEB_TEST_DATABASE_URL;
  return getTestDatabaseUrl().replace(/\/[^/]*$/, "/biocatalyst_web_test");
}

function postReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(url: string, token?: string): NextRequest {
  return new NextRequest(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/** Insert a minimal event row so reports have a valid FK target. */
async function seedEvent(): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO events (id, event_type, occurred_at, headline)
     VALUES ($1, 'regulatory_approval', now(), 'Test event for issue reporting')`,
    [id],
  );
  return id;
}

beforeAll(async () => {
  pool = new Pool({ connectionString: getWebTestDatabaseUrl() });
  await migrate(pool);
  // Route handlers use the shared pool from DATABASE_URL — point it at the
  // same isolated test database (same approach as auth-flow.test.ts).
  process.env.DATABASE_URL = getWebTestDatabaseUrl();
});

afterAll(async () => {
  await pool.end();
  await closePool();
});

beforeEach(async () => {
  await pool.query("DELETE FROM issue_reports");
  await pool.query("DELETE FROM event_sources");
  await pool.query("DELETE FROM events");
});

describe("POST /api/v1/issues", () => {
  it("stores a valid report and returns 201", async () => {
    const eventId = await seedEvent();
    const res = await reportIssue(
      postReq("http://localhost/api/v1/issues", {
        event_id: eventId,
        category: "incorrect_fact",
        description: "The headline names the wrong company entirely.",
        contact: "reporter@example.com",
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { status: string; report: { id: string } };
    expect(data.status).toBe("received");
    expect(data.report.id).toBeTruthy();

    const { rows } = await pool.query(
      "SELECT event_id::text AS event_id, category, description, contact, status FROM issue_reports WHERE id = $1",
      [data.report.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].event_id).toBe(eventId);
    expect(rows[0].category).toBe("incorrect_fact");
    expect(rows[0].contact).toBe("reporter@example.com");
    expect(rows[0].status).toBe("open");
  });

  it("accepts a report without contact info", async () => {
    const eventId = await seedEvent();
    const res = await reportIssue(
      postReq("http://localhost/api/v1/issues", {
        event_id: eventId,
        category: "other",
        description: "Something looks off here, please double check.",
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { report: { id: string } };
    const { rows } = await pool.query("SELECT contact FROM issue_reports WHERE id = $1", [
      data.report.id,
    ]);
    expect(rows[0].contact).toBeNull();
  });

  it("rejects invalid input with 400 (bad uuid, bad category, short description)", async () => {
    const eventId = await seedEvent();
    const badBodies = [
      { event_id: "not-a-uuid", category: "incorrect_fact", description: "Long enough description." },
      { event_id: eventId, category: "bogus", description: "Long enough description." },
      { event_id: eventId, category: "other", description: "short" },
      { event_id: eventId, category: "other" }, // missing description
      "not-json-at-all",
    ];
    for (const body of badBodies) {
      const res = await reportIssue(postReq("http://localhost/api/v1/issues", body));
      expect(res.status).toBe(400);
    }
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM issue_reports");
    expect(rows[0].n).toBe(0);
  });

  it("rejects an unknown event_id with 400, not 500", async () => {
    const res = await reportIssue(
      postReq("http://localhost/api/v1/issues", {
        event_id: randomUUID(),
        category: "stale_data",
        description: "This event does not exist in the database.",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/admin/issues", () => {
  it("is forbidden without an admin token", async () => {
    const saved = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    try {
      const res = await listAdminIssues(getReq("http://localhost/api/v1/admin/issues"));
      expect(res.status).toBe(403);
    } finally {
      if (saved !== undefined) process.env.ADMIN_TOKEN = saved;
    }
  });

  it("lists reports newest-first when the token is valid", async () => {
    const eventId = await seedEvent();
    const first = await reportIssue(
      postReq("http://localhost/api/v1/issues", {
        event_id: eventId,
        category: "missing_source",
        description: "The primary source link is missing for this event.",
      }),
    );
    expect(first.status).toBe(201);
    // Ensure distinct created_at ordering.
    await new Promise((r) => setTimeout(r, 15));
    const second = await reportIssue(
      postReq("http://localhost/api/v1/issues", {
        event_id: eventId,
        category: "other",
        description: "A second, newer report for ordering checks.",
      }),
    );
    expect(second.status).toBe(201);

    const saved = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = "test-admin-token-m8";
    try {
      const res = await listAdminIssues(
        getReq("http://localhost/api/v1/admin/issues", "test-admin-token-m8"),
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        status: string;
        reports: { category: string }[];
      };
      expect(data.status).toBe("ok");
      expect(data.reports).toHaveLength(2);
      expect(data.reports[0].category).toBe("other"); // newest first
      expect(data.reports[1].category).toBe("missing_source");
    } finally {
      if (saved === undefined) delete process.env.ADMIN_TOKEN;
      else process.env.ADMIN_TOKEN = saved;
    }
  });

  it("rejects an invalid status filter with 400", async () => {
    const saved = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = "test-admin-token-m8";
    try {
      const res = await listAdminIssues(
        getReq("http://localhost/api/v1/admin/issues?status=bogus", "test-admin-token-m8"),
      );
      expect(res.status).toBe(400);
    } finally {
      if (saved === undefined) delete process.env.ADMIN_TOKEN;
      else process.env.ADMIN_TOKEN = saved;
    }
  });
});
