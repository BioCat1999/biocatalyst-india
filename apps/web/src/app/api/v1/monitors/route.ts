import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@biocatalyst/db";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";

const monitorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  keyword: z.string().trim().max(100).optional(),
  eventTypes: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  countries: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  indications: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  phases: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
}).refine(
  (value) => Boolean(value.keyword) || value.eventTypes.length > 0 || value.countries.length > 0 || value.indications.length > 0 || value.phases.length > 0,
  "at least one monitor condition is required",
);

async function userFor(req: NextRequest) {
  return requireUserForToken(getSessionToken(req));
}

export async function GET(req: NextRequest) {
  try {
    const user = await userFor(req);
    const { rows } = await getPool().query(
      `SELECT id::text AS id, name, keyword, event_types, countries,
              indications, phases, enabled, created_at::text AS created_at
         FROM monitor_rules WHERE user_id = $1::uuid
        ORDER BY created_at DESC`,
      [user.id],
    );
    return NextResponse.json({
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        keyword: row.keyword,
        eventTypes: row.event_types,
        countries: row.countries,
        indications: row.indications,
        phases: row.phases,
        enabled: row.enabled,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: "authentication required" }, { status: (err as { status?: number }).status ?? 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await userFor(req);
    const parsed = monitorSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid monitor" }, { status: 400 });
    const count = await getPool().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM monitor_rules WHERE user_id = $1::uuid",
      [user.id],
    );
    if ((count.rows[0]?.n ?? 0) >= 25) return NextResponse.json({ error: "monitor limit reached" }, { status: 409 });
    const value = parsed.data;
    const { rows } = await getPool().query(
      `INSERT INTO monitor_rules
         (user_id, name, keyword, event_types, countries, indications, phases)
       VALUES ($1::uuid,$2,$3,$4::text[],$5::text[],$6::text[],$7::text[])
       ON CONFLICT (user_id, name) DO UPDATE SET
         keyword = EXCLUDED.keyword, event_types = EXCLUDED.event_types,
         countries = EXCLUDED.countries, indications = EXCLUDED.indications,
         phases = EXCLUDED.phases, enabled = true, updated_at = now()
       RETURNING id::text AS id, name, keyword, event_types, countries,
                 indications, phases, enabled, created_at::text AS created_at`,
      [user.id, value.name, value.keyword || null, value.eventTypes, value.countries, value.indications, value.phases],
    );
    const row = rows[0];
    return NextResponse.json({
      id: row.id, name: row.name, keyword: row.keyword,
      eventTypes: row.event_types, countries: row.countries,
      indications: row.indications, phases: row.phases,
      enabled: row.enabled, createdAt: new Date(row.created_at).toISOString(),
    }, { status: 201 });
  } catch (err) {
    if (err instanceof SyntaxError) return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    return NextResponse.json({ error: "authentication required" }, { status: (err as { status?: number }).status ?? 401 });
  }
}
