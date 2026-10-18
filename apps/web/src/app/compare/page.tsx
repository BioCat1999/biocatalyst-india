import { unstable_cache } from "next/cache";
import { getCompanyComparison, listCompanies } from "@biocatalyst/data";
import ComparePickers from "./ComparePickers";
import CompareColumn from "./CompareColumn";

export const dynamic = "force-dynamic";

const getCachedCompanies = unstable_cache(listCompanies, ["compare-company-directory"], {
  revalidate: 300,
});
const getCachedComparison = unstable_cache(getCompanyComparison, ["company-comparison"], {
  revalidate: 300,
});

/**
 * Company compare — side-by-side pipeline, events, and market moves for two
 * companies. Companies are chosen via `?a=slug&b=slug`; defaults are the
 * first two in the catalog.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const [companies, params] = await Promise.all([getCachedCompanies(), searchParams]);
  const aSlug =
    companies.some((c) => c.slug === params.a) ? (params.a as string) : (companies[0]?.slug ?? "");
  const bSlug =
    companies.some((c) => c.slug === params.b) ? (params.b as string) : (companies[1]?.slug ?? aSlug);
  const aCompany = companies.find((company) => company.slug === aSlug);
  const bCompany = companies.find((company) => company.slug === bSlug);
  const [aData, bData] = await Promise.all([
    aCompany ? getCachedComparison(aCompany.id) : Promise.resolve(null),
    bCompany ? getCachedComparison(bCompany.id) : Promise.resolve(null),
  ]);

  return (
    <>
      <div className="page-head">
        <h1>Compare companies</h1>
        <p>
          Pipeline, recent events, and market moves side by side. Pick any two
          tracked companies.
        </p>
      </div>

      <ComparePickers
        companies={companies.map((c) => ({ slug: c.slug, canonicalName: c.canonicalName }))}
        aSlug={aSlug}
        bSlug={bSlug}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          paddingBottom: 48,
        }}
      >
        <CompareColumn company={aCompany} data={aData} slug={aSlug} />
        <CompareColumn company={bCompany} data={bData} slug={bSlug} />
      </div>
    </>
  );
}
