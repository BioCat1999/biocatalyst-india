import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { getSourceHealth, listSourceNames } from "@biocatalyst/ingestion";
import { listPendingReview } from "@biocatalyst/data";
import { isAdminRequest } from "@/lib/admin";

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
 * Without the admin token it returns only overall status, so uptime checks
 * keep working without exposing source errors or unreviewed events. The full
 * report needs `Authorization: Bearer <ADMIN_TOKEN>`. A failing database
 * degrades to 503 instead of crashing.
 */
export async function GET(req: NextRequest) {
  const admin = isAdminRequest(req);
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    if (!admin) {
      return NextResponse.json({ status: "ok", service: "biocatalyst-india-web", database: "ok" });
    }
    // Only report sources that still run here (fixture sources are skipped in
    // production, so their old failed runs are not current problems).
    const active = new Set(listSourceNames());
    const [allSources, reviewQueue] = await Promise.all([
      getSourceHealth(pool),
      listPendingReview(10),
    ]);
    const sources = allSources.filter((s) => active.has(s.sourceName));
    return NextResponse.json({
      status: "ok",
      service: "biocatalyst-india-web",
      milestone: 7,
      database: "ok",
      sources,
      reviewQueue,
    });
  } catch (err) {
    if (!admin) {
      return NextResponse.json(
        { status: "degraded", service: "biocatalyst-india-web", database: "unreachable" },
        { status: 503 },
      );
    }
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
