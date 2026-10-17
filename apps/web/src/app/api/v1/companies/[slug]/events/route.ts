import { NextRequest, NextResponse } from "next/server";
import { getCompany, getEventsForCompany, toEventCards } from "@biocatalyst/data";
import { slugSchema } from "@/lib/validate";

/** GET /v1/companies/{slug}/events */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const company = await getCompany(slug);
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });
  const events = await getEventsForCompany(company.id);
  return NextResponse.json(
    {
      company: { id: company.id, slug: company.slug, canonicalName: company.canonicalName },
      items: await toEventCards(events),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
