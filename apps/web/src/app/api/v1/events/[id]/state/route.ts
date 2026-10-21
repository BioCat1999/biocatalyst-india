import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@biocatalyst/db";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";

const updateSchema = z.object({
  saved: z.boolean().optional(),
  note: z.string().max(5000).nullable().optional(),
  markRead: z.boolean().optional(),
});

async function auth(req: NextRequest) { return requireUserForToken(getSessionToken(req)); }

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await auth(req);
    const { id } = await context.params;
    const { rows } = await getPool().query(
      `SELECT saved_at::text AS saved_at, note,
              first_read_at::text AS first_read_at, last_read_at::text AS last_read_at
         FROM user_event_state WHERE user_id = $1::uuid AND event_id = $2::uuid`,
      [user.id, id],
    );
    const row = rows[0];
    return NextResponse.json({
      saved: Boolean(row?.saved_at), note: row?.note ?? "",
      firstReadAt: row?.first_read_at ?? null, lastReadAt: row?.last_read_at ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: "authentication required" }, { status: (err as { status?: number }).status ?? 401 });
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await auth(req);
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid event state" }, { status: 400 });
    const input = parsed.data;
    const { rows } = await getPool().query(
      `INSERT INTO user_event_state
         (user_id, event_id, saved_at, note, first_read_at, last_read_at)
       VALUES ($1::uuid,$2::uuid,
         CASE WHEN $3::boolean THEN now() ELSE NULL END,
         NULLIF($4::text,''),
         CASE WHEN $5::boolean THEN now() ELSE NULL END,
         CASE WHEN $5::boolean THEN now() ELSE NULL END)
       ON CONFLICT (user_id, event_id) DO UPDATE SET
         saved_at = CASE WHEN $6::boolean THEN CASE WHEN $3::boolean THEN COALESCE(user_event_state.saved_at, now()) ELSE NULL END ELSE user_event_state.saved_at END,
         note = CASE WHEN $7::boolean THEN NULLIF($4::text,'') ELSE user_event_state.note END,
         first_read_at = CASE WHEN $5::boolean THEN COALESCE(user_event_state.first_read_at, now()) ELSE user_event_state.first_read_at END,
         last_read_at = CASE WHEN $5::boolean THEN now() ELSE user_event_state.last_read_at END,
         updated_at = now()
       RETURNING saved_at::text AS saved_at, note,
                 first_read_at::text AS first_read_at, last_read_at::text AS last_read_at`,
      [user.id, id, input.saved ?? false, input.note ?? "", input.markRead ?? false,
        input.saved !== undefined, input.note !== undefined],
    );
    const row = rows[0];
    return NextResponse.json({
      saved: Boolean(row.saved_at), note: row.note ?? "",
      firstReadAt: row.first_read_at, lastReadAt: row.last_read_at,
    });
  } catch (err) {
    return NextResponse.json({ error: "could not update event workspace" }, { status: (err as { status?: number }).status ?? 500 });
  }
}
