import Link from "next/link";
import { listGlobalCompaniesPage } from "@biocatalyst/data";
import { FollowButton } from "@/components/FollowButton";

export const dynamic = "force-dynamic";

/**
 * Global section: non-Indian pharma majors tracked for their India impact —
 * FDA approvals, trial readouts, patent expiries and partnerships that move
 * Indian pharma as competitors, licensors, or customers of Indian
 * manufacturers. Quotes are on each company page (delayed Yahoo Finance).
 */
export default async function GlobalPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = await listGlobalCompaniesPage({
    limit: 50,
    cursor: params.cursor,
    query,
  });
  const companies = page.items;
  const offset = Number.parseInt(params.cursor ?? "0", 10) || 0;
  const previous = Math.max(0, offset - 50);
  const pageHref = (cursor: number | string) => {
    const values = new URLSearchParams();
    if (query) values.set("q", query);
    if (String(cursor) !== "0") values.set("cursor", String(cursor));
    const suffix = values.toString();
    return suffix ? `/global?${suffix}` : "/global";
  };

  return (
    <>
      <div className="page-head">
        <h1>Global pharma</h1>
        <p>
          {page.total.toLocaleString()} clinical-industry companies tracked worldwide.
          Browse in fast pages of 50; curated leaders include deeper India-impact,
          market and patent intelligence.
        </p>
      </div>

      <form action="/global" method="get" className="search-form" style={{ marginBottom: 16 }}>
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search global companies…"
          aria-label="Search global companies"
          style={{ width: "100%", padding: "12px 14px", borderRadius: 10 }}
        />
      </form>

      <div style={{ paddingBottom: 48 }}>
        {companies.length === 0 && (
          <div className="empty">
            <p>No global companies tracked yet.</p>
          </div>
        )}
        {companies.map((c) => {
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
                <span className="tag neutral">{c.country}</span>{" "}
                {sec && (
                  <span className="tag ticker">
                    {sec.ticker} · {sec.exchange}
                  </span>
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
        {page.total > 0 && (
          <nav
            aria-label="Global company pages"
            style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}
          >
            {offset > 0 ? <Link href={pageHref(previous)}>← Previous</Link> : <span />}
            <span style={{ color: "var(--muted)" }}>
              {offset + 1}–{Math.min(offset + companies.length, page.total)} of {page.total.toLocaleString()}
            </span>
            {page.nextCursor ? <Link href={pageHref(page.nextCursor)}>Next →</Link> : <span />}
          </nav>
        )}
      </div>
    </>
  );
}
