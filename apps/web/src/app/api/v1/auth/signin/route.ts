import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@biocatalyst/auth";
import {
  SESSION_COOKIE,
  getAuthProvider,
  sessionCookieAttributes,
} from "@/lib/auth-server";
import { authCredentialsSchema } from "@/lib/validate";

/**
 * POST /api/v1/auth/signin — start a session.
 *
 * Body: { email, password }. Wrong email and wrong password produce the same
 * 401 (no account enumeration). The session token is delivered only in the
 * httpOnly cookie; the response body carries the public profile.
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
    const { token, session } = await getAuthProvider().signIn(
      parsed.data.email,
      parsed.data.password,
    );
    const res = NextResponse.json({ user: session.user });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieAttributes(session.expiresAt));
    return res;
  } catch (err) {
    if (err instanceof AuthError && err.code === "INVALID_CREDENTIALS") {
      return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
    }
    throw err;
  }
}
