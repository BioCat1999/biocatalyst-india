import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, getAuthProvider, getSessionToken, getUserForToken } from "@/lib/auth-server";

/**
 * DELETE /api/v1/auth/account — permanently delete the signed-in account.
 *
 * Required by Apple App Store Guideline 5.1.1(v) for apps with account
 * creation: deletion must be completable in-app, not only by contacting
 * support. Deleting the users row cascades to sessions, watchlist items,
 * alerts and push tokens (FK ON DELETE CASCADE), and the session cookie
 * is cleared on the way out. Anonymous callers get a 401; there is no
 * way to delete another user's account (the id comes from the session).
 */
export async function DELETE(req: NextRequest) {
  const user = await getUserForToken(getSessionToken(req));
  if (!user) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  await getAuthProvider().deleteAccount(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
