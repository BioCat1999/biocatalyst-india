/**
 * Admin gating for the health, review-queue and market-reactions endpoints.
 *
 * Without the admin token: health returns only overall status (no source
 * errors or unpublished events), review-queue and market-reactions refuse
 * with 403. With the token, health returns the full report.
 *
 * DB-backed against `biocatalyst_web_test`, like the issue-report tests.
 */
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";

import { GET as health } from "./health/route.js";
import { GET as reviewQueue } from "./review-queue/route.js";
import { POST as marketReactions } from "./market-reactions/route.js";

const TOKEN = "test-admin-token-gating";
let pool: Pool;

function webTestDatabaseUrl(): string {
  if (process.env.WEB_TEST_DATABASE_URL) return process.env.WEB_TEST_DATABASE_URL;
  return getTestDatabaseUrl().replace(/\/[^/]*$/, "/biocatalyst_web_test");
}

function req(url: string, opts: { token?: string; method?: string } = {}): NextRequest {
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
  });
}

beforeAll(async () => {
  pool = new Pool({ connectionString: webTestDatabaseUrl() });
  await migrate(pool);
  process.env.DATABASE_URL = webTestDatabaseUrl();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await pool.end();
  await closePool();
});

describe("admin endpoint gating", () => {
  it("health without a token reports status only", async () => {
    vi.stubEnv("ADMIN_TOKEN", TOKEN);
    vi.stubEnv("NODE_ENV", "production");
    const res = await health(req("http://localhost/api/v1/admin/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", service: "biocatalyst-india-web", database: "ok" });
  });

  it("health with the admin token returns the full report", async () => {
    vi.stubEnv("ADMIN_TOKEN", TOKEN);
    vi.stubEnv("NODE_ENV", "production");
    const res = await health(req("http://localhost/api/v1/admin/health", { token: TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("sources");
    expect(body).toHaveProperty("reviewQueue");
    // Fixture sources are not reported in production.
    for (const s of body.sources as { sourceName: string }[]) {
      expect(s.sourceName).not.toMatch(/-fixture$/);
    }
  });

  it("review-queue refuses requests without the admin token", async () => {
    vi.stubEnv("ADMIN_TOKEN", TOKEN);
    vi.stubEnv("NODE_ENV", "production");
    const res = await reviewQueue(req("http://localhost/api/v1/admin/review-queue"));
    expect(res.status).toBe(403);
    const wrong = await reviewQueue(
      req("http://localhost/api/v1/admin/review-queue", { token: "wrong" }),
    );
    expect(wrong.status).toBe(403);
  });

  it("market-reactions refuses requests without the admin token", async () => {
    vi.stubEnv("ADMIN_TOKEN", TOKEN);
    vi.stubEnv("NODE_ENV", "production");
    const res = await marketReactions(
      req("http://localhost/api/v1/admin/market-reactions", { method: "POST" }),
    );
    expect(res.status).toBe(403);
  });

  it("market-reactions rejects a bad sinceDays", async () => {
    vi.stubEnv("ADMIN_TOKEN", TOKEN);
    vi.stubEnv("NODE_ENV", "production");
    const res = await marketReactions(
      req("http://localhost/api/v1/admin/market-reactions?sinceDays=0", {
        method: "POST",
        token: TOKEN,
      }),
    );
    expect(res.status).toBe(400);
  });
});
