import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { listPendingReview } from "@biocatalyst/data";
import { isAdminRequest } from "@/lib/admin";

/**
 * GET /api/v1/admin/review-queue — confidence-threshold review queue
 * (Milestone 4, spec §8.3).
 *
 * Events with review_status = 'pending_review' (low-confidence or
 * fallback extractions, never auto-published endpoint claims), lowest
 * confidence first, with extraction provenance. `?limit=` (1–200,
 * default 50). Requires `Authorization: Bearer <ADMIN_TOKEN>` (see
 * src/lib/admin.ts), because the queue holds unpublished events.
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "forbidden — admin token required" }, { status: 403 });
  }
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const queue = await listPendingReview(Number.isNaN(limit) ? 50 : limit);
    return NextResponse.json({
      status: "ok",
      service: "biocatalyst-india-web",
      ...queue,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        service: "biocatalyst-india-web",
        error: (err as Error).message,
      },
      { status: 503 },
    );
  }
}
