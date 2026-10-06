import { NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { getSourceHealth } from "@biocatalyst/ingestion";
import { listPendingReview } from "@biocatalyst/data";

/**
 * GET /api/v1/admin/health — ingestion + source health (spec §20).
 *
 * Reports per-source: last successful fetch, newest source timestamp,
 * docs fetched/changed, events created/rejected, last run status/error,
 * and the persisted cursor. M4 adds the confidence-threshold review queue
 * (spec §8.3): pending count plus the lowest-confidence items awaiting
 * manual review, with extraction provenance (provider, prompt/schema
 * versions, fallback flag).
 *
 * Read-only and secret-free, so it is not token-gated; a failing database
 * degrades to 503 instead of crashing.
 */
export async function GET() {
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    const [sources, reviewQueue] = await Promise.all([
      getSourceHealth(pool),
      listPendingReview(10),
    ]);
    return NextResponse.json({
      status: "ok",
      service: "biocatalyst-india-web",
      milestone: 7,
      database: "ok",
      sources,
      reviewQueue,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        service: "biocatalyst-india-web",
        database: "unreachable",
        sources: [],
        reviewQueue: { pendingCount: 0, items: [] },
        error: (err as Error).message,
      },
      { status: 503 },
    );
  }
}
