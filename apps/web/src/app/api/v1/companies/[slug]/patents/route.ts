import { NextRequest, NextResponse } from "next/server";
import { getCompany, getPatentsForCompany } from "@biocatalyst/data";
import { slugSchema } from "@/lib/validate";

/**
 * GET /v1/companies/{slug}/patents — Orange Book patents where the
 * company is the listed applicant, soonest expiry first. Anonymous.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const company = await getCompany(slug);
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });
  const patents = await getPatentsForCompany(company.id);
  return NextResponse.json({
    items: patents.map((p) => ({
      patentNumber: p.patentNumber,
      applNo: p.applNo,
      productNo: p.productNo,
      tradeName: p.tradeName,
      applicant: p.applicant,
      activeIngredient: p.activeIngredient,
      expiryDate: p.expiryDate,
      drugSubstanceFlag: p.drugSubstanceFlag,
      drugProductFlag: p.drugProductFlag,
      delisted: p.delisted,
    })),
  });
}
