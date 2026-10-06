import { NextRequest, NextResponse } from "next/server";
import { getUpcomingPatentExpiries, getPatentStats } from "@biocatalyst/data";

/**
 * GET /v1/patents?within= — upcoming Orange Book patent expiries,
 * soonest first. `within` is days (default 365, max 1825). Anonymous.
 */
export async function GET(req: NextRequest) {
  const within = req.nextUrl.searchParams.get("within");
  const withinDays = Math.min(Math.max(parseInt(within ?? "365", 10) || 365, 1), 1825);
  const [items, stats] = await Promise.all([
    getUpcomingPatentExpiries(undefined, { withinDays, limit: 300 }),
    getPatentStats(),
  ]);
  return NextResponse.json({
    stats,
    items: items.map((p) => ({
      patentNumber: p.patentNumber,
      applNo: p.applNo,
      productNo: p.productNo,
      tradeName: p.tradeName,
      applicant: p.applicant,
      activeIngredient: p.activeIngredient,
      expiryDate: p.expiryDate,
      daysToExpiry: p.daysToExpiry,
      drugSubstanceFlag: p.drugSubstanceFlag,
      drugProductFlag: p.drugProductFlag,
      company: p.companySlug
        ? { slug: p.companySlug, canonicalName: p.companyName }
        : null,
    })),
  });
}
