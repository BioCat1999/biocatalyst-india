import { NextRequest, NextResponse } from "next/server";
import { getCompanyById, getDrugById } from "@biocatalyst/data";
import { parseQuery, resolveQuerySchema } from "@/lib/validate";

/**
 * GET /v1/resolve?entity_type=company|drug&entity_id={uuid}
 * Resolves a watchlist entity id to its display name + link. Used by the
 * client-side watchlist page (ids live in localStorage).
 */
export async function GET(req: NextRequest) {
  const parsed = parseQuery(resolveQuerySchema, req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { entity_type, entity_id } = parsed.data;
  if (entity_type === "company") {
    const c = await getCompanyById(entity_id);
    if (!c) return NextResponse.json({ error: "company not found" }, { status: 404 });
    return NextResponse.json({
      entityType: "company",
      entityId: c.id,
      name: c.canonicalName,
      href: `/companies/${c.slug}`,
      kind: "Company",
    });
  }
  const d = await getDrugById(entity_id);
  if (!d) return NextResponse.json({ error: "drug not found" }, { status: 404 });
  return NextResponse.json({
    entityType: "drug",
    entityId: d.id,
    name: d.canonicalName,
    href: `/drugs/${d.slug}`,
    kind: "Drug",
  });
}
