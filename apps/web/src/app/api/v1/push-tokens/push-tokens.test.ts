/**
 * Milestone 10 — push-token registration API tests (spec §14).
 *
 * POST /api/v1/push-tokens: 401 without a session, Zod validation (400 on
 * bad input), 201 + row round-trip on valid input, idempotent
 * re-registration (no duplicate rows), and per-user isolation.
 *
 * DB-backed against `biocatalyst_web_test` — same isolated pattern as
 * issues.test.ts / auth-flow.test.ts. Route handlers exercised directly.
 */
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";

import { POST as registerToken } from "./route.js";
import { POST as signup } from "../auth/signup/route.js";

let pool: Pool;

function getWebTestDatabaseUrl(): string {
  if (process.env.WEB_TEST_DATABASE_URL) return process.env.WEB_TEST_DATABASE_URL;
  return getTestDatabaseUrl().replace(/\/[^/]*$/, "/biocatalyst_web_test");
}

function postReq(url: string, body: unknown, cookie?: string): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/bc_session=([^;]+)/);
  if (!m) throw new Error(`no bc_session in Set-Cookie: ${setCookie}`);
  return `bc_session=${m[1]}`;
}

async function signedUp(email: string): Promise<string> {
  const res = await signup(
    new NextRequest("http://localhost/api/v1/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correct-horse-9" }),
    }),
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
  await pool.query("DELETE FROM push_tokens");
  await pool.query("DELETE FROM alerts");
  await pool.query("DELETE FROM watchlist_items");
  await pool.query("DELETE FROM sessions");
  await pool.query("DELETE FROM users");
});

describe("POST /api/v1/push-tokens", () => {
  it("requires authentication (401 without a session)", async () => {
    const res = await registerToken(
      postReq("http://localhost/api/v1/push-tokens", { token: "abc", platform: "expo" }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("authentication required");
  });

  it("registers a token and returns 201 with no token value echoed", async () => {
    const cookie = await signedUp("push1@example.com");
    const res = await registerToken(
      postReq("http://localhost/api/v1/push-tokens", { token: "device-token-1", platform: "expo" }, cookie),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { status: string; pushToken: { id: string; platform: string } };
    expect(data.status).toBe("registered");
    expect(data.pushToken.platform).toBe("expo");
    // Token values are secrets — the response must not echo them back.
    expect(JSON.stringify(data)).not.toContain("device-token-1");

    const { rows } = await pool.query(
      "SELECT user_id::text AS user_id, token, platform FROM push_tokens",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe("device-token-1");
    expect(rows[0].platform).toBe("expo");
  });

  it("is idempotent: re-registering the same token creates no duplicate row", async () => {
    const cookie = await signedUp("push2@example.com");
    const body = { token: "dup-token", platform: "expo" as const };
    const url = "http://localhost/api/v1/push-tokens";
    const r1 = await registerToken(postReq(url, body, cookie));
    const r2 = await registerToken(postReq(url, body, cookie));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM push_tokens");
    expect(rows[0].n).toBe(1);
  });

  it("isolates tokens per user (same token, two users → two rows)", async () => {
    const c1 = await signedUp("push3@example.com");
    const c2 = await signedUp("push4@example.com");
    const url = "http://localhost/api/v1/push-tokens";
    const body = { token: "shared-device-token", platform: "expo" as const };
    await registerToken(postReq(url, body, c1));
    await registerToken(postReq(url, body, c2));
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM push_tokens");
    expect(rows[0].n).toBe(2);
  });

  it("rejects invalid bodies with 400", async () => {
    const cookie = await signedUp("push5@example.com");
    const url = "http://localhost/api/v1/push-tokens";
    for (const bad of [
      { token: "", platform: "expo" }, // empty token
      { token: "x", platform: "apns2" }, // unknown platform
      { platform: "expo" }, // missing token
      { token: "ok" }, // missing platform
    ]) {
      const res = await registerToken(postReq(url, bad, cookie));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid push token");
    }
  });

  it("rejects a non-JSON body with 400", async () => {
    const cookie = await signedUp("push6@example.com");
    const res = await registerToken(
      new NextRequest("http://localhost/api/v1/push-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: "not-json{",
      }),
    );
    expect(res.status).toBe(400);
  });
});
