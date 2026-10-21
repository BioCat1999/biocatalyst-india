import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listCompanies, listIndianCompaniesPage } from "@biocatalyst/data";
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
  searchParams: Promise<{ category?: string; cursor?: string; q?: string }>;
}) {
  const { category, cursor, q } = await searchParams;
  const active = category && isKnownCategory(category) ? category : "all";
  const query = q?.trim() ?? "";
  const page = active === "all"
    ? await listIndianCompaniesPage({ limit: 50, cursor, query })
    : null;
  const companies = page
    ? page.items
    : (await getCachedCompanies()).filter((c) => c.country === "India");
  const visible = active === "all"
      ? companies
      : companies.filter((c) =>
          categoriesForCompany(c.slug).some((cc) => cc.id === active),
        );
  const activeMeta = COMPANY_CATEGORIES.find((c) => c.id === active);
  const offset = Number.parseInt(cursor ?? "0", 10) || 0;
  const pageHref = (next: number | string) => {
    const values = new URLSearchParams();
    if (query) values.set("q", query);
    if (String(next) !== "0") values.set("cursor", String(next));
    const suffix = values.toString();
    return suffix ? `/companies?${suffix}` : "/companies";
  };

  return (
    <>
      <div className="page-head">
        <h1>Companies</h1>
        <p>
          {(page?.total ?? companies.length).toLocaleString()} tracked Indian life-sciences companies. Browse by
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

      {active === "all" && (
        <form action="/companies" method="get" style={{ marginBottom: 16 }}>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search Indian companies…"
            aria-label="Search Indian companies"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10 }}
          />
        </form>
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
        {page && page.total > 0 && (
          <nav
            aria-label="Indian company pages"
            style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}
          >
            {offset > 0 ? <Link href={pageHref(Math.max(0, offset - 50))}>← Previous</Link> : <span />}
            <span style={{ color: "var(--muted)" }}>
              {offset + 1}–{Math.min(offset + visible.length, page.total)} of {page.total.toLocaleString()}
            </span>
            {page.nextCursor ? <Link href={pageHref(page.nextCursor)}>Next →</Link> : <span />}
          </nav>
        )}
      </div>
    </>
  );
}
