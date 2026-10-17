import { NextRequest, NextResponse } from "next/server";
import { AuthError, verifyGoogleIdToken } from "@biocatalyst/auth";
import {
  SESSION_COOKIE,
  getAuthProvider,
  sessionCookieAttributes,
} from "@/lib/auth-server";
import { googleIdTokenSchema } from "@/lib/validate";

/**
 * POST /api/v1/auth/google — verify Google identity, create/link the local
 * account, and issue the same first-party session used by password login.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = googleIdTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Google ID token is required" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "Google sign-in is not configured" }, { status: 503 });
  }

  try {
    const identity = await verifyGoogleIdToken(parsed.data.idToken, clientId);
    const { token, session } = await getAuthProvider().signInWithGoogle(identity);
    const res = NextResponse.json({ user: session.user });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieAttributes(session.expiresAt));
    return res;
  } catch (err) {
    if (err instanceof AuthError && err.code === "INVALID_IDENTITY") {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }
}
