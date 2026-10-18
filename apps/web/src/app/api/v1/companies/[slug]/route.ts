import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getCompanyPageData } from "@biocatalyst/data";
import { slugSchema } from "@/lib/validate";

const getCachedCompanyDetail = unstable_cache(
  getCompanyPageData,
  ["company-api-detail-v2"],
  { revalidate: 300 },
);

/** GET /v1/companies/{slug} */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const detail = await getCachedCompanyDetail(slug);
  if (!detail) return NextResponse.json({ error: "company not found" }, { status: 404 });
  const { company, drugs, trials } = detail;
  return NextResponse.json(
    {
      ...company,
      drugs: drugs.map((d) => ({ id: d.id, slug: d.slug, canonicalName: d.canonicalName })),
      trials: trials.map((t) => ({
        id: t.id,
        registry: t.registry,
        registryTrialId: t.registryTrialId,
        phase: t.phase,
        status: t.status,
      })),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
