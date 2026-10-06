import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { getCompanyById, getDrugById } from "@biocatalyst/data";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";
import { watchlistCreateSchema } from "@/lib/validate";

/**
 * GET /v1/watchlist — list the signed-in user's followed companies/drugs
 * (spec §12). Auth required; anonymous requests get 401.
 */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUserForToken(getSessionToken(req));
  } catch (err) {
    return NextResponse.json(
      { error: "authentication required" },
      { status: (err as { status?: number }).status ?? 401 },
    );
  }
  const { rows } = await getPool().query<{
    entity_type: "company" | "drug";
    entity_id: string;
    created_at: string;
    name: string | null;
    href: string | null;
  }>(
    `SELECT w.entity_type, w.entity_id::text AS entity_id,
            w.created_at::text AS created_at,
            COALESCE(c.canonical_name, d.canonical_name) AS name,
            CASE WHEN c.id IS NOT NULL THEN '/companies/' || c.slug
                 WHEN d.id IS NOT NULL THEN '/drugs/' || d.slug END AS href
     FROM watchlist_items w
     LEFT JOIN companies c ON w.entity_type = 'company' AND c.id = w.entity_id
     LEFT JOIN drugs d ON w.entity_type = 'drug' AND d.id = w.entity_id
     WHERE w.user_id = $1::uuid
     ORDER BY w.created_at DESC`,
    [user.id],
  );
  return NextResponse.json({
    items: rows.map((r) => ({
      entityType: r.entity_type,
      entityId: r.entity_id,
      createdAt: new Date(r.created_at).toISOString(),
      name: r.name,
      href: r.href,
    })),
  });
}

/**
 * POST /v1/watchlist — follow a company or drug (spec §12).
 * Body: { entity_type: "company"|"drug", entity_id: <uuid> }.
 * 201 on create, 200 when already followed (idempotent), 404 for unknown
 * entities, 401 when anonymous.
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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = watchlistCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "entity_type must be company|drug and entity_id a UUID" },
      { status: 400 },
    );
  }
  const { entity_type, entity_id } = parsed.data;
  const exists =
    entity_type === "company"
      ? await getCompanyById(entity_id)
      : await getDrugById(entity_id);
  if (!exists) {
    return NextResponse.json({ error: `${entity_type} not found` }, { status: 404 });
  }
  const { rows } = await getPool().query<{ created_at: string }>(
    `INSERT INTO watchlist_items (user_id, entity_type, entity_id)
     VALUES ($1::uuid, $2, $3::uuid)
     ON CONFLICT (user_id, entity_type, entity_id) DO NOTHING
     RETURNING created_at::text AS created_at`,
    [user.id, entity_type, entity_id],
  );
  if (rows.length === 0) {
    const { rows: existing } = await getPool().query<{ created_at: string }>(
      `SELECT created_at::text AS created_at FROM watchlist_items
       WHERE user_id = $1::uuid AND entity_type = $2 AND entity_id = $3::uuid`,
      [user.id, entity_type, entity_id],
    );
    return NextResponse.json(
      {
        entityType: entity_type,
        entityId: entity_id,
        createdAt: new Date(existing[0].created_at).toISOString(),
        alreadyFollowed: true,
      },
      { status: 200 },
    );
  }
  return NextResponse.json(
    {
      entityType: entity_type,
      entityId: entity_id,
      createdAt: new Date(rows[0].created_at).toISOString(),
    },
    { status: 201 },
  );
}
