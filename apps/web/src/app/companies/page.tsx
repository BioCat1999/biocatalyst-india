import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listCompanies } from "@biocatalyst/data";
import { FollowButton } from "@/components/FollowButton";
import {
  COMPANY_CATEGORIES,
  categoriesForCompany,
  isKnownCategory,
} from "@/lib/company-categories";

export const dynamic = "force-dynamic";

const getCachedCompanies = unstable_cache(listCompanies, ["company-directory"], {
  revalidate: 300,
});

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const active = category && isKnownCategory(category) ? category : "all";
  const companies = await getCachedCompanies();
  const visible =
    active === "all"
      ? companies
      : companies.filter((c) =>
          categoriesForCompany(c.slug).some((cc) => cc.id === active),
        );
  const activeMeta = COMPANY_CATEGORIES.find((c) => c.id === active);

  return (
    <>
      <div className="page-head">
        <h1>Companies</h1>
        <p>
          {companies.length} tracked India-linked pharma companies. Browse by
          category, or follow the ones you care about to get alerts.
        </p>
      </div>

      <div className="chips" role="group" aria-label="Company categories">
        <Link className="chip" aria-pressed={active === "all"} href="/companies">
          All
        </Link>
        {COMPANY_CATEGORIES.map((c) => (
          <Link
            key={c.id}
            className="chip"
            aria-pressed={active === c.id}
            href={`/companies?category=${c.id}`}
            title={c.blurb}
          >
            {c.label}
          </Link>
        ))}
      </div>
      {activeMeta && (
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: -8 }}>
          {activeMeta.blurb}
        </p>
      )}

      <div style={{ paddingBottom: 48 }}>
        {visible.length === 0 && (
          <div className="empty">
            <p>No companies in this category yet.</p>
          </div>
        )}
        {visible.map((c) => {
          const cats = categoriesForCompany(c.slug);
          const sec = c.securities[0];
          return (
            <div
              key={c.id}
              className="result-row"
              style={{ display: "flex", alignItems: "center", gap: 12 }}
            >
              <Link
                href={`/companies/${c.slug}`}
                style={{ flex: 1, minWidth: 0, color: "inherit" }}
              >
                <strong>{c.canonicalName}</strong>{" "}
                {sec && (
                  <span className="tag ticker">
                    {sec.ticker} · {sec.exchange}
                  </span>
                )}
                {cats.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {cats.map((cc) => (
                      <span key={cc.id} className="tag neutral">
                        {cc.label}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                  {c.description}
                </div>
              </Link>
              <FollowButton
                compact
                entityType="company"
                entityId={c.id}
                label={c.canonicalName}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
