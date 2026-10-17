/**
 * Auth provider interface + local self-hostable implementation — Milestone 6
 * (spec §14).
 *
 * The interface is deliberately provider-shaped: signUp / signIn / federated
 * sign-in / signOut / verifyToken. Passwords and sessions remain fully local
 * (scrypt, random tokens, Postgres); Google is an optional identity proof.
 * Google ID tokens are verified server-side before a local session is issued.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { BinaryLike } from "node:crypto";
import type { Pool } from "pg";
import { OAuth2Client } from "google-auth-library";

// scrypt's options-overload callback form, promisified by hand (util.promisify
// only exposes the 3-argument overload in the Node typings).
function scryptKey(
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  params: { N: number; r: number; p: number } = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, params, (err, key) => {
      if (err) reject(err);
      else resolve(key as Buffer);
    });
  });
}

/** Public user profile — never carries a password hash or session token. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

/** A verified session, as returned by verifyToken. */
export interface AuthSession {
  token: string;
  user: AuthUser;
  createdAt: string;
  expiresAt: string;
}

/** Errors thrown by the provider. `code` is stable for API mapping. */
export class AuthError extends Error {
  constructor(
    public readonly code:
      | "EMAIL_TAKEN"
      | "INVALID_CREDENTIALS"
      | "INVALID_EMAIL"
      | "INVALID_IDENTITY"
      | "WEAK_PASSWORD"
      | "UNKNOWN_SESSION",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Pluggable auth contract. signIn/signUp return the raw session token once;
 * the caller is responsible for delivering it (httpOnly cookie) and never
 * logging it.
 */
export interface AuthProvider {
  readonly providerName: string;
  signUp(email: string, password: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<{ token: string; session: AuthSession }>;
  signInWithGoogle(identity: GoogleIdentity): Promise<{ token: string; session: AuthSession }>;
  signOut(token: string): Promise<void>;
  /**
   * Permanently delete a user account. The users row delete cascades to
   * sessions, watchlist items, alerts and push tokens (FK ON DELETE
   * CASCADE), so no per-table cleanup is needed here.
   */
  deleteAccount(userId: string): Promise<void>;
  /** Returns the session for a live token, or null for unknown/expired. */
  verifyToken(token: string): Promise<AuthSession | null>;
}

export interface GoogleIdentity {
  subject: string;
  email: string;
  displayName: string | null;
}

export interface LocalAuthOptions {
  /** Session lifetime. Default 30 days; env AUTH_SESSION_TTL_DAYS. */
  sessionTtlDays?: number;
}

/** Minimum password length enforced by the local provider. */
export const MIN_PASSWORD_LENGTH = 8;
/** Maximum password length (DoS guard on scrypt input). */
export const MAX_PASSWORD_LENGTH = 128;

// scrypt parameters: OWASP-recommended interactive-login settings.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): void {
  const normalized = normalizeEmail(email);
  if (normalized.length > 254 || !EMAIL_RE.test(normalized)) {
    throw new AuthError("INVALID_EMAIL", "invalid email address");
  }
}

/** Verify a Google ID token before its identity reaches account storage. */
export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
): Promise<GoogleIdentity> {
  if (!idToken || !audience) {
    throw new AuthError("INVALID_IDENTITY", "Google sign-in is not configured");
  }
  try {
    const ticket = await new OAuth2Client().verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new AuthError("INVALID_IDENTITY", "Google account email is not verified");
    }
    return {
      subject: payload.sub,
      email: normalizeEmail(payload.email),
      displayName: payload.name?.trim() || null,
    };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("INVALID_IDENTITY", "invalid Google identity token");
  }
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError(
      "WEAK_PASSWORD",
      `password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters`,
    );
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptKey(password, salt, KEY_BYTES);
  // Self-describing format so parameters can evolve later.
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptKey(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Local self-hostable auth provider.
 *
 * - Passwords: scrypt (N=16384, r=8, p=1), random 16-byte salt, stored as a
 *   self-describing hash. Never logged, never returned.
 * - Sessions: 32-byte random tokens; only the SHA-256 hash is stored in the
 *   `sessions` table (migration 006). Tokens expire after `sessionTtlDays`.
 * - All comparisons of secrets use timing-safe equality.
 */
export class LocalAuthProvider implements AuthProvider {
  readonly providerName = "local";
  private readonly sessionTtlMs: number;

  constructor(
    private readonly pool: Pool,
    options: LocalAuthOptions = {},
  ) {
    const days = options.sessionTtlDays ?? Number(process.env.AUTH_SESSION_TTL_DAYS ?? 30);
    this.sessionTtlMs = Math.max(1, days) * 24 * 60 * 60 * 1000;
  }

  async signUp(email: string, password: string): Promise<AuthUser> {
    const normalized = normalizeEmail(email);
    validateEmail(normalized);
    validatePassword(password);
    const passwordHash = await hashPassword(password);
    try {
      const { rows } = await this.pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, NULL)
         RETURNING id::text AS id, email, display_name, created_at::text AS created_at`,
        [normalized, passwordHash],
      );
      return toAuthUser(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new AuthError("EMAIL_TAKEN", "an account with this email already exists");
      }
      throw err;
    }
  }

  async signIn(
    email: string,
    password: string,
  ): Promise<{ token: string; session: AuthSession }> {
    const normalized = normalizeEmail(email);
    const { rows } = await this.pool.query<UserRow & { password_hash: string | null }>(
      `SELECT id::text AS id, email, display_name, created_at::text AS created_at, password_hash
       FROM users WHERE email = $1`,
      [normalized],
    );
    const row = rows[0];
    if (!row || !row.password_hash || !(await verifyPassword(password, row.password_hash))) {
      // Identical error for unknown email vs wrong password (no enumeration).
      throw new AuthError("INVALID_CREDENTIALS", "invalid email or password");
    }
    return this.createSession(row);
  }

  async signInWithGoogle(
    identity: GoogleIdentity,
  ): Promise<{ token: string; session: AuthSession }> {
    const email = normalizeEmail(identity.email);
    validateEmail(email);
    if (!identity.subject.trim()) {
      throw new AuthError("INVALID_IDENTITY", "invalid Google account identifier");
    }

    const bySubject = await this.pool.query<UserRow>(
      `SELECT id::text AS id, email, display_name, created_at::text AS created_at
       FROM users WHERE google_sub = $1`,
      [identity.subject],
    );
    let user = bySubject.rows[0];

    if (!user) {
      const byEmail = await this.pool.query<UserRow & { google_sub: string | null }>(
        `SELECT id::text AS id, email, display_name, created_at::text AS created_at, google_sub
         FROM users WHERE email = $1`,
        [email],
      );
      const existing = byEmail.rows[0];
      if (existing) {
        if (existing.google_sub && existing.google_sub !== identity.subject) {
          throw new AuthError("INVALID_IDENTITY", "email is linked to another Google account");
        }
        const linked = await this.pool.query<UserRow>(
          `UPDATE users
           SET google_sub = $1,
               display_name = COALESCE(display_name, $2),
               email_verified_at = COALESCE(email_verified_at, now())
           WHERE id = $3::uuid
           RETURNING id::text AS id, email, display_name, created_at::text AS created_at`,
          [identity.subject, identity.displayName, existing.id],
        );
        user = linked.rows[0];
      } else {
        const inserted = await this.pool.query<UserRow>(
          `INSERT INTO users (email, password_hash, display_name, email_verified_at, google_sub)
           VALUES ($1, NULL, $2, now(), $3)
           RETURNING id::text AS id, email, display_name, created_at::text AS created_at`,
          [email, identity.displayName, identity.subject],
        );
        user = inserted.rows[0];
      }
    }

    return this.createSession(user);
  }

  private async createSession(userRow: UserRow): Promise<{ token: string; session: AuthSession }> {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTtlMs);
    const { rows: srows } = await this.pool.query<{ created_at: string }>(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1::uuid, $2, $3::timestamptz)
       RETURNING created_at::text AS created_at`,
      [userRow.id, hashToken(token), expiresAt.toISOString()],
    );
    const user = toAuthUser(userRow);
    return {
      token,
      session: {
        token,
        user,
        createdAt: new Date(srows[0].created_at).toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  async signOut(token: string): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM users WHERE id = $1", [userId]);
  }

  async verifyToken(token: string): Promise<AuthSession | null> {
    if (!token) return null;
    const { rows } = await this.pool.query<
      UserRow & { created_at_session: string; expires_at: string }
    >(
      `SELECT u.id::text AS id, u.email, u.display_name,
              u.created_at::text AS created_at,
              s.created_at::text AS created_at_session,
              s.expires_at::text AS expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      // Opportunistic cleanup of the expired session.
      await this.pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
      return null;
    }
    // Sliding last-seen (cheap, no extra round trip for the caller).
    await this.pool.query("UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1", [
      hashToken(token),
    ]);
    return {
      token,
      user: toAuthUser(row),
      createdAt: new Date(row.created_at_session).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }
}
