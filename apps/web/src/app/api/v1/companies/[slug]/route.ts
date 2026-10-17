import { NextRequest, NextResponse } from "next/server";
import { getCompany, getDrugsForCompany, getTrialsForCompany } from "@biocatalyst/data";
import { slugSchema } from "@/lib/validate";

/** GET /v1/companies/{slug} */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const company = await getCompany(slug);
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });
  const [drugs, trials] = await Promise.all([
    getDrugsForCompany(company.id),
    getTrialsForCompany(company.id),
  ]);
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
