import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { markAlertRead } from "@biocatalyst/notifications";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";
import { alertReadSchema } from "@/lib/validate";

/**
 * POST /api/v1/alerts/{id}/read — mark one alert as read.
 * 404 when the alert doesn't belong to the signed-in user.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireUserForToken(getSessionToken(_req));
  } catch (err) {
    return NextResponse.json(
      { error: "authentication required" },
      { status: (err as { status?: number }).status ?? 401 },
    );
  }
  const { id } = await params;
  const parsed = alertReadSchema.safeParse({ alert_id: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "alert_id must be a UUID" }, { status: 400 });
  }
  const ok = await markAlertRead(getPool(), user.id, parsed.data.alert_id);
  if (!ok) return NextResponse.json({ error: "alert not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
