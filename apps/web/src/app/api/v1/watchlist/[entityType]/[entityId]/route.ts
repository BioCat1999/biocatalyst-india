import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";
import { watchlistPathSchema } from "@/lib/validate";

/**
 * DELETE /v1/watchlist/{entity_type}/{entity_id} — unfollow (spec §12).
 *
 * Instant and permanent: because alert generation reads the live watchlist
 * at ingest time, unfollowing immediately stops new alerts for that entity
 * (spec §17 acceptance). 204 on success (or when already absent —
 * idempotent), 401 when anonymous.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> },
) {
  let user;
  try {
    user = await requireUserForToken(getSessionToken(req));
  } catch (err) {
    return NextResponse.json(
      { error: "authentication required" },
      { status: (err as { status?: number }).status ?? 401 },
    );
  }
  const { entityType, entityId } = await params;
  const parsed = watchlistPathSchema.safeParse({
    entity_type: entityType,
    entity_id: entityId,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "entity_type must be company|drug and entity_id a UUID" },
      { status: 400 },
    );
  }
  await getPool().query(
    `DELETE FROM watchlist_items
     WHERE user_id = $1::uuid AND entity_type = $2 AND entity_id = $3::uuid`,
    [user.id, parsed.data.entity_type, parsed.data.entity_id],
  );
  return new NextResponse(null, { status: 204 });
}
