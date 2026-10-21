import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserForToken(getSessionToken(req));
    const mode = req.nextUrl.searchParams.get("mode") === "history" ? "history" : "saved";
    const predicate = mode === "history" ? "s.last_read_at IS NOT NULL" : "s.saved_at IS NOT NULL";
    const order = mode === "history" ? "s.last_read_at" : "s.saved_at";
    const { rows } = await getPool().query(
      `SELECT e.id::text AS id, e.headline, e.event_type,
              e.occurred_at::text AS occurred_at,
              s.saved_at::text AS saved_at, s.last_read_at::text AS last_read_at,
              s.note
         FROM user_event_state s JOIN events e ON e.id = s.event_id
        WHERE s.user_id = $1::uuid AND ${predicate}
        ORDER BY ${order} DESC LIMIT 200`,
      [user.id],
    );
    return NextResponse.json({
      items: rows.map((row) => ({
        id: row.id, headline: row.headline, eventType: row.event_type,
        occurredAt: row.occurred_at, savedAt: row.saved_at,
        lastReadAt: row.last_read_at, note: row.note ?? "",
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: "authentication required" }, { status: (err as { status?: number }).status ?? 401 });
  }
}
