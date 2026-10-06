/**
 * Server-side session helpers — Milestone 6 (spec §14).
 *
 * The session token lives in an httpOnly, SameSite=Lax cookie
 * (`bc_session`; Secure in production). It is never exposed to client JS,
 * never logged, and verified against the DB-backed sessions table on every
 * authenticated request. Anonymous browsing needs none of this: public
 * pages and public API routes never call these helpers.
 *
 * The token is read from the request's cookies (not next/headers), so the
 * same helpers work in route handlers, server components, and tests.
 */
import type { NextRequest } from "next/server";
import { getPool } from "@biocatalyst/db";
import { LocalAuthProvider, type AuthProvider, type AuthUser } from "@biocatalyst/auth";

export const SESSION_COOKIE = "bc_session";

let provider: AuthProvider | null = null;

/** Local self-hostable provider (spec §14; pluggable — see docs/decisions.md). */
export function getAuthProvider(): AuthProvider {
  if (!provider) provider = new LocalAuthProvider(getPool());
  return provider;
}

/** Extract the raw session token from a request, if present. */
export function getSessionToken(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

/** The signed-in user for a session token, or null when anonymous/invalid. */
export async function getUserForToken(token: string | null): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await getAuthProvider().verifyToken(token);
  return session?.user ?? null;
}

/** Like getUserForToken, but throws a 401-shaped error when anonymous. */
export async function requireUserForToken(token: string | null): Promise<AuthUser> {
  const user = await getUserForToken(token);
  if (!user) {
    const err = new Error("authentication required") as Error & { status: number };
    err.status = 401;
    throw err;
  }
  return user;
}

/** Cookie attributes shared by sign-in/sign-up responses. */
export function sessionCookieAttributes(expiresAt: string) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  };
}
