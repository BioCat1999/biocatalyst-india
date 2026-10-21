import { NextRequest, NextResponse } from "next/server";
import { listCompanies, listGlobalCompaniesPage, listIndianCompaniesPage } from "@biocatalyst/data";

/**
 * GET /v1/companies?scope= — company directory for mobile clients.
 * scope=global → non-Indian pharma majors; scope=india → Indian catalog;
 * omitted → everything. Anonymous. Compact shape (no drugs/trials).
 */
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope");
  if (scope === "global") {
    const limit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
    const page = await listGlobalCompaniesPage({
      limit: Number.isFinite(limit) ? limit : 50,
      cursor: req.nextUrl.searchParams.get("cursor"),
      query: req.nextUrl.searchParams.get("q") ?? "",
    });
    return NextResponse.json(
      { ...page, items: page.items.map(compactCompany) },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
    );
  }
  if (scope === "india") {
    const limit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
    const page = await listIndianCompaniesPage({
      limit: Number.isFinite(limit) ? limit : 50,
      cursor: req.nextUrl.searchParams.get("cursor"),
      query: req.nextUrl.searchParams.get("q") ?? "",
    });
    return NextResponse.json(
      { ...page, items: page.items.map(compactCompany) },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
    );
  }
  const companies =
    await listCompanies();
  return NextResponse.json(
    {
      items: companies.map(compactCompany),
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}

function compactCompany(c: Awaited<ReturnType<typeof listCompanies>>[number]) {
  return {
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
  };
}
