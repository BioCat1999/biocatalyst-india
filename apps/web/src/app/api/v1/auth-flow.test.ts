/**
 * Milestone 6 — web API integration tests (spec §12, §14, §17).
 *
 * DB-backed against `biocatalyst_test`: signup/login/logout flow, session
 * cookie behaviour, watchlist follow/unfollow API + auth-gating, alerts API
 * auth-gating, stricter auth rate limiting (middleware), and anonymous
 * access to the public feed API. Route handlers are exercised directly (no
 * dev server needed).
 */
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";

import { POST as signup } from "./auth/signup/route.js";
import { POST as signin } from "./auth/signin/route.js";
import { POST as signout } from "./auth/signout/route.js";
import { GET as getSession } from "./auth/session/route.js";
import {
  GET as listWatchlist,
  POST as follow,
} from "./watchlist/route.js";
import { DELETE as unfollow } from "./watchlist/[entityType]/[entityId]/route.js";
import { GET as listAlerts } from "./alerts/route.js";
import { GET as listEvents } from "./events/route.js";
import { middleware } from "../../../middleware.js";

let pool: Pool;

/**
 * Isolated test database — same pattern as ingestion's
 * `biocatalyst_ingestion_test`: the web route tests never touch the shared
 * `biocatalyst_test` DB that the data package's seed-volume tests use, so
 * parallel `turbo run test` can't interfere.
 */
function getWebTestDatabaseUrl(): string {
  if (process.env.WEB_TEST_DATABASE_URL) return process.env.WEB_TEST_DATABASE_URL;
  return getTestDatabaseUrl().replace(/\/[^/]*$/, "/biocatalyst_web_test");
}

function jsonReq(url: string, body: unknown, cookie?: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function getReq(url: string, cookie?: string): NextRequest {
  return new NextRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

/** Extract the bc_session cookie value from a Set-Cookie response. */
function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/bc_session=([^;]+)/);
  if (!m) throw new Error(`no bc_session in Set-Cookie: ${setCookie}`);
  return `bc_session=${m[1]}`;
}

async function signedUp(email: string): Promise<string> {
  const res = await signup(
    jsonReq("http://localhost/api/v1/auth/signup", { email, password: "correct-horse-9" }),
  );
  expect(res.status).toBe(201);
  return sessionCookie(res);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: getWebTestDatabaseUrl(), max: 5 });
  process.env.DATABASE_URL = getWebTestDatabaseUrl();
  await migrate(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await closePool();
});

beforeEach(async () => {
  await pool.query("DELETE FROM alerts");
  await pool.query("DELETE FROM watchlist_items");
  await pool.query("DELETE FROM sessions");
  await pool.query("DELETE FROM users");
});

describe("auth flow (spec §14)", () => {
  it("signup → session → signout → session gone", async () => {
    const cookie = await signedUp("flow@example.com");

    const me = await getSession(getReq("http://localhost/api/v1/auth/session", cookie));
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe("flow@example.com");

    const out = await signout(
      new NextRequest("http://localhost/api/v1/auth/signout", {
        method: "POST",
        headers: { Cookie: cookie },
      }),
    );
    expect(out.status).toBe(200);

    const after = await getSession(getReq("http://localhost/api/v1/auth/session", cookie));
    expect(after.status).toBe(401);
  });

  it("rejects invalid credentials and duplicate signup", async () => {
    await signedUp("dup2@example.com");
    const dup = await signup(
      jsonReq("http://localhost/api/v1/auth/signup", {
        email: "dup2@example.com",
        password: "correct-horse-9",
      }),
    );
    expect(dup.status).toBe(409);

    const bad = await signin(
      jsonReq("http://localhost/api/v1/auth/signin", {
        email: "dup2@example.com",
        password: "wrong-password",
      }),
    );
    expect(bad.status).toBe(401);
    expect((await bad.json()).error).toBe("invalid email or password");
  });

  it("session endpoint is 401 when anonymous", async () => {
    const res = await getSession(getReq("http://localhost/api/v1/auth/session"));
    expect(res.status).toBe(401);
  });

  it("auth responses never contain a password or hash", async () => {
    const res = await signup(
      jsonReq("http://localhost/api/v1/auth/signup", {
        email: "leak@example.com",
        password: "correct-horse-9",
      }),
    );
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("correct-horse-9");
    expect(text).not.toContain("password_hash");
    expect(text).not.toContain("scrypt$");

    const cookie = sessionCookie(res);
    const me = await getSession(getReq("http://localhost/api/v1/auth/session", cookie));
    expect(JSON.stringify(await me.json())).not.toContain("scrypt$");
  });
});

describe("watchlist API (spec §12)", () => {
  async function makeCompany(): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO companies (canonical_name, slug, active)
       VALUES ($1, $2, true) RETURNING id::text AS id`,
      ["WebTestCo " + randomUUID().slice(0, 8), "webtestco-" + randomUUID().slice(0, 8)],
    );
    return rows[0].id;
  }

  it("is 401 for anonymous callers", async () => {
    expect(
      (await listWatchlist(getReq("http://localhost/api/v1/watchlist"))).status,
    ).toBe(401);
    const post = await follow(
      jsonReq("http://localhost/api/v1/watchlist", {
        entity_type: "company",
        entity_id: randomUUID(),
      }),
    );
    expect(post.status).toBe(401);
    const del = await unfollow(
      new NextRequest("http://localhost/api/v1/watchlist/company/" + randomUUID(), {
        method: "DELETE",
      }),
      { params: Promise.resolve({ entityType: "company", entityId: randomUUID() }) },
    );
    expect(del.status).toBe(401);
  });

  it("follow → list → unfollow → list empty", async () => {
    const cookie = await signedUp("watch@example.com");
    const companyId = await makeCompany();

    const created = await follow(
      jsonReq(
        "http://localhost/api/v1/watchlist",
        { entity_type: "company", entity_id: companyId },
        cookie,
      ),
    );
    expect(created.status).toBe(201);

    const listed = await listWatchlist(getReq("http://localhost/api/v1/watchlist", cookie));
    expect(listed.status).toBe(200);
    const data = await listed.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].entityId).toBe(companyId);
    expect(data.items[0].name).toContain("WebTestCo");
    expect(data.items[0].href).toContain("/companies/");

    // Following again is idempotent (200, not 409).
    const again = await follow(
      jsonReq(
        "http://localhost/api/v1/watchlist",
        { entity_type: "company", entity_id: companyId },
        cookie,
      ),
    );
    expect(again.status).toBe(200);

    const gone = await unfollow(
      new NextRequest(`http://localhost/api/v1/watchlist/company/${companyId}`, {
        method: "DELETE",
        headers: { Cookie: cookie },
      }),
      { params: Promise.resolve({ entityType: "company", entityId: companyId }) },
    );
    expect(gone.status).toBe(204);

    const relisted = await listWatchlist(getReq("http://localhost/api/v1/watchlist", cookie));
    expect((await relisted.json()).items).toHaveLength(0);
  });

  it("rejects unknown entities and invalid ids", async () => {
    const cookie = await signedUp("watch2@example.com");
    const missing = await follow(
      jsonReq(
        "http://localhost/api/v1/watchlist",
        { entity_type: "company", entity_id: randomUUID() },
        cookie,
      ),
    );
    expect(missing.status).toBe(404);

    const bad = await follow(
      jsonReq(
        "http://localhost/api/v1/watchlist",
        { entity_type: "company", entity_id: "nope" },
        cookie,
      ),
    );
    expect(bad.status).toBe(400);
  });
});

describe("alerts API auth-gating (spec §14)", () => {
  it("is 401 for anonymous callers", async () => {
    expect((await listAlerts(getReq("http://localhost/api/v1/alerts"))).status).toBe(401);
  });
});

describe("auth rate limiting (spec §21)", () => {
  it("limits /api/v1/auth/* more strictly than the general API budget", async () => {
    // Fresh IP per assertion via x-forwarded-for.
    const hit = (path: string, ip: string) =>
      middleware(
        new NextRequest(`http://localhost${path}`, {
          headers: { "x-forwarded-for": ip },
        }),
      );

    // General budget: 120/min.
    let blockedAt = -1;
    for (let i = 1; i <= 130; i++) {
      const res = await hit("/api/v1/events", "10.9.9.1");
      if (res.status === 429) {
        blockedAt = i;
        break;
      }
    }
    expect(blockedAt).toBe(121);

    // Auth budget: 20/min.
    blockedAt = -1;
    for (let i = 1; i <= 30; i++) {
      const res = await hit("/api/v1/auth/signin", "10.9.9.2");
      if (res.status === 429) {
        blockedAt = i;
        break;
      }
    }
    expect(blockedAt).toBe(21);

    // A 429 carries Retry-After.
    const limited = await hit("/api/v1/auth/signin", "10.9.9.2");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("anonymous browsing still works (spec §14)", () => {
  it("public events API is 200 without auth", async () => {
    const res = await listEvents(new NextRequest("http://localhost/api/v1/events?limit=5"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
  });
});
