import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { markAllAlertsRead } from "@biocatalyst/notifications";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";

/**
 * POST /api/v1/alerts/read-all — mark every in-app alert as read.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUserForToken(getSessionToken(req));
  } catch (err) {
    return NextResponse.json(
      { error: "authentication required" },
      { status: (err as { status?: number }).status ?? 401 },
    );
  }
  const marked = await markAllAlertsRead(getPool(), user.id);
  return NextResponse.json({ ok: true, marked });
}
