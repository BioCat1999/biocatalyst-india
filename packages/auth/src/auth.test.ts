/**
 * Milestone 6 — local auth provider tests (spec §14, §17).
 *
 * DB-backed against `biocatalyst_test` (migration 006): signup/login/logout
 * flow, session persistence across provider instances, session expiry,
 * invalid credentials rejected, duplicate emails rejected, and the password
 * never being stored or returned in plaintext.
 */
import { Pool } from "pg";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";
import {
  AuthError,
  LocalAuthProvider,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "./index.js";

let pool: Pool;

/**
 * Isolated test database — same pattern as ingestion's
 * `biocatalyst_ingestion_test`: the auth suite never shares a database with
 * another package's tests, so parallel `turbo run test` can't interfere.
 */
function getAuthTestDatabaseUrl(): string {
  if (process.env.AUTH_TEST_DATABASE_URL) return process.env.AUTH_TEST_DATABASE_URL;
  return getTestDatabaseUrl().replace(/\/[^/]*$/, "/biocatalyst_auth_test");
}

beforeAll(async () => {
  pool = new Pool({ connectionString: getAuthTestDatabaseUrl(), max: 5 });
  process.env.DATABASE_URL = getAuthTestDatabaseUrl();
  await migrate(pool);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await closePool();
});

beforeEach(async () => {
  await pool.query("DELETE FROM sessions");
  await pool.query("DELETE FROM users");
});

const provider = () =>
  new LocalAuthProvider(pool, { sessionTtlDays: 30 });

describe("signUp", () => {
  it("creates a user with a normalized email", async () => {
    const user = await provider().signUp("Ada@Example.COM ", "correct-horse-9");
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.email).toBe("ada@example.com");
    expect(new Date(user.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("rejects duplicate emails (case-insensitive)", async () => {
    await provider().signUp("dupe@example.com", "correct-horse-9");
    await expect(provider().signUp("DUPE@example.com", "another-pass-1")).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
    });
  });

  it("rejects invalid emails", async () => {
    await expect(provider().signUp("not-an-email", "correct-horse-9")).rejects.toMatchObject({
      code: "INVALID_EMAIL",
    });
  });

  it("rejects weak passwords", async () => {
    await expect(
      provider().signUp("weak@example.com", "short"),
    ).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    await expect(
      provider().signUp("weak2@example.com", "x".repeat(MAX_PASSWORD_LENGTH + 1)),
    ).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });

  it("never stores the plaintext password", async () => {
    await provider().signUp("plain@example.com", "correct-horse-9");
    const { rows } = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = 'plain@example.com'",
    );
    expect(rows[0].password_hash).not.toContain("correct-horse-9");
    expect(rows[0].password_hash.startsWith("scrypt$")).toBe(true);
  });
});

describe("signIn / verifyToken / signOut", () => {
  it("signs in with correct credentials and returns a usable token", async () => {
    const p = provider();
    await p.signUp("login@example.com", "correct-horse-9");
    const { token, session } = await p.signIn("login@example.com", "correct-horse-9");
    expect(token.length).toBeGreaterThan(20);
    expect(session.user.email).toBe("login@example.com");
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const verified = await p.verifyToken(token);
    expect(verified?.user.email).toBe("login@example.com");
  });

  it("rejects wrong passwords and unknown emails identically", async () => {
    const p = provider();
    await p.signUp("victim@example.com", "correct-horse-9");
    await expect(p.signIn("victim@example.com", "wrong-password")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(p.signIn("nobody@example.com", "wrong-password")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("verifyToken returns null for garbage tokens", async () => {
    expect(await provider().verifyToken("not-a-real-token")).toBeNull();
    expect(await provider().verifyToken("")).toBeNull();
  });

  it("signOut invalidates the session", async () => {
    const p = provider();
    await p.signUp("out@example.com", "correct-horse-9");
    const { token } = await p.signIn("out@example.com", "correct-horse-9");
    expect(await p.verifyToken(token)).not.toBeNull();
    await p.signOut(token);
    expect(await p.verifyToken(token)).toBeNull();
  });

  it("deleteAccount removes the user and cascades the session away", async () => {
    const p = provider();
    const user = await p.signUp("gone@example.com", "correct-horse-9");
    const { token } = await p.signIn("gone@example.com", "correct-horse-9");
    expect(await p.verifyToken(token)).not.toBeNull();
    await p.deleteAccount(user.id);
    expect(await p.verifyToken(token)).toBeNull();
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM users");
    expect(rows[0].n).toBe(0);
    // The same email can sign up again after deletion.
    await expect(p.signUp("gone@example.com", "correct-horse-9")).resolves.toBeDefined();
  });

  it("sessions persist across provider instances (DB-backed)", async () => {
    const p1 = provider();
    await p1.signUp("persist@example.com", "correct-horse-9");
    const { token } = await p1.signIn("persist@example.com", "correct-horse-9");
    // A brand-new provider instance (new process equivalent) still honors it.
    expect(await provider().verifyToken(token)).not.toBeNull();
    // The DB stores only the token hash, never the raw token.
    const { rows } = await pool.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(rows[0].token_hash).not.toBe(token);
    expect(rows[0].token_hash).toHaveLength(64); // sha256 hex
  });

  it("expired sessions are rejected and cleaned up", async () => {
    const short = new LocalAuthProvider(pool, { sessionTtlDays: 30 });
    await short.signUp("exp@example.com", "correct-horse-9");
    const { token } = await short.signIn("exp@example.com", "correct-horse-9");
    // Force expiry in the past.
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    expect(await short.verifyToken(token)).toBeNull();
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM sessions");
    expect(rows[0].n).toBe(0);
  });
});
