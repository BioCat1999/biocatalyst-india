import { NextResponse } from "next/server";
import { listIpoPipeline } from "@biocatalyst/data";

/**
 * GET /v1/ipos — the IPO pipeline: curated IPO catalog with status
 * (in_pipeline / listed / watchlist), curated milestone dates, and the
 * latest detected IPO event per company. Anonymous.
 */
export async function GET() {
  const entries = await listIpoPipeline();
  return NextResponse.json({
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
  });
}
