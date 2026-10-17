import { NextRequest, NextResponse } from "next/server";
import { getDrug, getCompaniesForDrug, getTrialsForDrug } from "@biocatalyst/data";
import { slugSchema } from "@/lib/validate";

/** GET /v1/drugs/{slug} */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const drug = await getDrug(slug);
  if (!drug) return NextResponse.json({ error: "drug not found" }, { status: 404 });
  const [companies, trials] = await Promise.all([
    getCompaniesForDrug(drug),
    getTrialsForDrug(drug.id),
  ]);
  return NextResponse.json(
    {
      ...drug,
      companies: companies.map((c) => ({
        id: c.id,
        slug: c.slug,
        canonicalName: c.canonicalName,
      })),
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
