import { NextRequest, NextResponse } from "next/server";
import { getSessionToken, getUserForToken } from "@/lib/auth-server";

/**
 * GET /api/v1/auth/session — who is signed in (for the header/nav).
 *
 * 200 { user } when a live session cookie is present, 401 { user: null }
 * when anonymous. No session token is ever returned here.
 */
export async function GET(req: NextRequest) {
  const user = await getUserForToken(getSessionToken(req));
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
