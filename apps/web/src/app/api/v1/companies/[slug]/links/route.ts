import { NextRequest, NextResponse } from "next/server";
import { getCompany, getGlobalLinksForCompany } from "@biocatalyst/data";
import { slugSchema } from "@/lib/validate";

/**
 * GET /v1/companies/{slug}/links — curated India-impact links between the
 * company and global pharma majors (licensing, patent-expiry opportunities,
 * competition). Anonymous.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!slugSchema.safeParse(slug).success) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const company = await getCompany(slug);
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });
  const links = getGlobalLinksForCompany(slug);
  return NextResponse.json({
    items: links.map(({ link, otherCompany }) => ({
      id: link.id,
      kind: link.kind,
      title: link.title,
      description: link.description,
      otherCompany,
    })),
  });
}
