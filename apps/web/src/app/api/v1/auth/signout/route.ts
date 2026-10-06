import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getAuthProvider } from "@/lib/auth-server";

/**
 * POST /api/v1/auth/signout — destroy the current session.
 *
 * Idempotent: signing out with no/unknown session still clears the cookie.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    await getAuthProvider().signOut(token);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
