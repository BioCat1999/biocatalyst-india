import { NextRequest, NextResponse } from "next/server";
import { getCatalystCalendar } from "@biocatalyst/data";

/**
 * Unified forward calendar for mobile and web. It intentionally reads the
 * canonical tables at request time: no duplicated trial/patent calendar rows
 * can drift stale. `catalyst_milestones` supplies regulatory and corporate
 * dates that have no natural canonical table.
 */
export async function GET(req: NextRequest) {
  const parsedLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);
  const limit = Math.min(250, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 100));
  const country = (req.nextUrl.searchParams.get("country") ?? "").trim().slice(0, 100);
  const kind = (req.nextUrl.searchParams.get("kind") ?? "").trim().slice(0, 50);
  const items = await getCatalystCalendar({ country, kind, limit });
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      items,
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
