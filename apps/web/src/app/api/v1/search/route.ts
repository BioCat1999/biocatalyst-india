import { NextRequest, NextResponse } from "next/server";
import { search } from "@biocatalyst/data";
import { parseQuery, searchQuerySchema } from "@/lib/validate";

/** GET /v1/search?q= */
export async function GET(req: NextRequest) {
  const parsed = parseQuery(searchQuerySchema, req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const r = await search(parsed.data.q);
  return NextResponse.json(
    {
      companies: r.companies.map((c) => ({ id: c.id, slug: c.slug, canonicalName: c.canonicalName })),
      drugs: r.drugs.map((d) => ({ id: d.id, slug: d.slug, canonicalName: d.canonicalName })),
      trials: r.trials.map((t) => ({
        id: t.id,
        registry: t.registry,
        registryTrialId: t.registryTrialId,
        title: t.title,
      })),
      events: r.events.map((e) => ({ id: e.id, headline: e.headline, occurredAt: e.occurredAt })),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
