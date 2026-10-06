import { NextRequest, NextResponse } from "next/server";
import { listCompanies, listGlobalCompanies } from "@biocatalyst/data";

/**
 * GET /v1/companies?scope= — company directory for mobile clients.
 * scope=global → non-Indian pharma majors; scope=india → Indian catalog;
 * omitted → everything. Anonymous. Compact shape (no drugs/trials).
 */
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope");
  const companies =
    scope === "global"
      ? await listGlobalCompanies()
      : scope === "india"
        ? (await listCompanies()).filter((c) => c.country === "India")
        : await listCompanies();
  return NextResponse.json({
    items: companies.map((c) => ({
      id: c.id,
      slug: c.slug,
      canonicalName: c.canonicalName,
      description: c.description,
      country: c.country,
      website: c.website,
      securities: c.securities.map((s) => ({
        exchange: s.exchange,
        ticker: s.ticker,
        currency: s.currency,
      })),
    })),
  });
}
