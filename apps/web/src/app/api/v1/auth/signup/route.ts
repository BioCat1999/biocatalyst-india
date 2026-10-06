import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@biocatalyst/auth";
import {
  SESSION_COOKIE,
  getAuthProvider,
  sessionCookieAttributes,
} from "@/lib/auth-server";
import { authCredentialsSchema } from "@/lib/validate";

/**
 * POST /api/v1/auth/signup — create an account and start a session.
 *
 * Body: { email, password }. Local auth only (no third-party providers).
 * Stricter rate limiting applies to /api/v1/auth/* (see middleware.ts).
 * Passwords are never logged and never appear in responses.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = authCredentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }
  try {
    const provider = getAuthProvider();
    const user = await provider.signUp(parsed.data.email, parsed.data.password);
    // Auto sign-in on signup: one fewer round trip for the user.
    const { token, session } = await provider.signIn(parsed.data.email, parsed.data.password);
    const res = NextResponse.json({ user }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieAttributes(session.expiresAt));
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "EMAIL_TAKEN" ? 409 : err.code === "WEAK_PASSWORD" ? 422 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
