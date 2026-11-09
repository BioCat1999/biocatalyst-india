import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { YahooFinanceProvider, computeAndStoreReactions } from "@biocatalyst/market-data";
import { isAdminRequest } from "@/lib/admin";

// One Yahoo Finance request per listed company in the window.
export const maxDuration = 300;

const DEFAULT_SINCE_DAYS = 45;
// Leave headroom under maxDuration; unfinished events are picked up next run.
const RUN_BUDGET_MS = 240_000;
const MAX_SINCE_DAYS = 3650;

/**
 * POST /api/v1/admin/market-reactions — compute post-event stock moves.
 *
 * Measures the share-price move around each published event from the last
 * `?sinceDays=` days (default 45, so moves keep updating until the window
 * after the event has closed) using delayed Yahoo Finance prices, and upserts
 * them into `market_reactions`. Re-runs refresh rows rather than duplicate
 * them. Admin-gated: requires `Authorization: Bearer <ADMIN_TOKEN>`.
 */
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "forbidden — admin token required" }, { status: 403 });
  }
  const raw = req.nextUrl.searchParams.get("sinceDays");
  const sinceDays = raw === null ? DEFAULT_SINCE_DAYS : Number.parseInt(raw, 10);
  if (!Number.isInteger(sinceDays) || sinceDays < 1 || sinceDays > MAX_SINCE_DAYS) {
    return NextResponse.json(
      { error: `sinceDays must be an integer from 1 to ${MAX_SINCE_DAYS}` },
      { status: 400 },
    );
  }
  try {
    const metrics = await computeAndStoreReactions(getPool(), new YahooFinanceProvider(), {
      sinceDays,
      budgetMs: RUN_BUDGET_MS,
    });
    return NextResponse.json(
      { sinceDays, ...metrics },
      { status: metrics.errors.length > 0 ? 500 : 200 },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
