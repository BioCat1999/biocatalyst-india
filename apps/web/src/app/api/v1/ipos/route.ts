import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { listIpoPipeline } from "@biocatalyst/data";

const getCachedIpoPipeline = unstable_cache(listIpoPipeline, ["ipo-pipeline-v1"], {
  revalidate: 300,
  tags: ["ipo-pipeline"],
});

/**
 * GET /v1/ipos — the IPO pipeline: curated IPO catalog with status
 * (in_pipeline / listed / watchlist), curated milestone dates, and the
 * latest detected IPO event per company. Anonymous.
 */
export async function GET() {
  const entries = await getCachedIpoPipeline();
  return NextResponse.json(
    {
      items: entries.map((e) => ({
        company: {
          id: e.company.id,
          slug: e.company.slug,
          canonicalName: e.company.canonicalName,
          description: e.company.description,
          country: e.company.country,
        },
        status: e.status,
        milestone: e.milestone,
        latestEvent: e.latestEvent,
      })),
    },
    {
      headers: {
        // The catalog changes infrequently. Serve a fresh edge-cached response
        // for five minutes and keep the previous response available while the
        // cache refreshes, rather than making a phone wait on a cold database.
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
