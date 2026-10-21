import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserForToken(getSessionToken(req));
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid monitor id" }, { status: 400 });
    const result = await getPool().query(
      "DELETE FROM monitor_rules WHERE id = $1::uuid AND user_id = $2::uuid",
      [id, user.id],
    );
    return result.rowCount
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "monitor not found" }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: "authentication required" }, { status: (err as { status?: number }).status ?? 401 });
  }
}
