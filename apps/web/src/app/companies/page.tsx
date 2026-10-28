import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listCompanies, listIndianCompaniesPage } from "@biocatalyst/data";
import { FollowButton } from "@/components/FollowButton";
import { Icon } from "@/components/Icon";
import { Avatar, HeroTile, PageHero } from "@/components/PageParts";
import {
  COMPANY_CATEGORIES,
  categoriesForCompany,
  isKnownCategory,
} from "@/lib/company-categories";
import { companyCategoryStyle, styleVars } from "@/lib/categories";

export const dynamic = "force-dynamic";
export const metadata = { title: "Companies — Biocatalyst India" };

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
    ? await listIndianCompaniesPage({ limit: 48, cursor, query })
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
  const total = page?.total ?? companies.length;
  const listed = visible.filter((c) => c.securities.length > 0).length;

  return (
    <>
      <PageHero
        kicker="COMPANY DIRECTORY"
        title="Indian life-sciences companies"
        accent="#1f63d6"
        aside={
          <div className="hero-tiles">
            <HeroTile icon="building" value={total.toLocaleString("en-IN")} label={query ? "Matches" : "Tracked"} color="#8fb6ff" />
            <HeroTile icon="chart" value={`${listed}/${visible.length}`} label="Listed (shown)" color="#7eeede" />
          </div>
        }
      >
        <p>Browse by category, open a company for its catalysts, drugs, trials and patents, or follow it to get alerts.</p>
        <form action="/companies" method="get" className="hero-search" role="search">
          <Icon name="search" size={17} />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name or ticker — e.g. Sun Pharma, CIPLA…"
            aria-label="Search Indian companies"
          />
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
      </PageHero>

      <div className="filters">
        <div className="chips" role="group" aria-label="Company categories">
          <Link className="chip" aria-pressed={active === "all"} href="/companies">
            <Icon name="grid" size={14} /> All
          </Link>
          {COMPANY_CATEGORIES.map((c) => {
            const s = companyCategoryStyle(c.id);
            return (
              <Link
                key={c.id}
                className="chip chip-cat"
                style={styleVars(s)}
                aria-pressed={active === c.id}
                href={`/companies?category=${c.id}`}
                title={c.blurb}
              >
                <Icon name={s.icon} size={14} /> {c.label}
              </Link>
            );
          })}
        </div>
        {activeMeta && <p className="filter-blurb">{activeMeta.blurb}</p>}
        {query && (
          <p className="filter-blurb">
            Showing results for “{query}” · <Link href="/companies">Clear search</Link>
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon"><Icon name="building" size={24} /></span>
          <p>{query ? `No companies match “${query}”.` : "No companies in this category yet."}</p>
          <Link href="/companies" className="btn">Show all companies</Link>
        </div>
      ) : (
        <div className="company-grid">
          {visible.map((c) => {
            const cats = categoriesForCompany(c.slug);
            const sec = c.securities[0];
            return (
              <article key={c.id} className="company-card">
                <div className="company-card-head">
                  <Avatar name={c.canonicalName} />
                  <div className="company-card-name">
                    <h2>
                      <Link href={`/companies/${c.slug}`} className="stretched">{c.canonicalName}</Link>
                    </h2>
                    {sec ? (
                      <span className="ev-ticker">{sec.ticker}<small>{sec.exchange}</small></span>
                    ) : (
                      <span className="unlisted">Unlisted</span>
                    )}
                  </div>
                  <span className="company-follow">
                    <FollowButton compact entityType="company" entityId={c.id} label={c.canonicalName} />
                  </span>
                </div>
                {c.description && <p className="company-desc">{c.description}</p>}
                {cats.length > 0 && (
                  <div className="company-tags">
                    {cats.map((cc) => {
                      const s = companyCategoryStyle(cc.id);
                      return (
                        <span key={cc.id} className="cat-tag" style={styleVars(s)}>
                          <Icon name={s.icon} size={11} /> {cc.label}
                        </span>
                      );
                    })}
                  </div>
                )}
                <span className="company-open" aria-hidden="true">
                  View profile <Icon name="arrow-right" size={13} />
                </span>
              </article>
            );
          })}
        </div>
      )}

      {page && page.total > 0 && (
        <nav aria-label="Company pages" className="pager">
          {offset > 0 ? (
            <Link className="btn" href={pageHref(Math.max(0, offset - 48))}><Icon name="chevron-left" size={15} /> Previous</Link>
          ) : <span />}
          <span className="muted">
            {offset + 1}–{Math.min(offset + visible.length, page.total)} of {page.total.toLocaleString("en-IN")}
          </span>
          {page.nextCursor ? (
            <Link className="btn" href={pageHref(page.nextCursor)}>Next <Icon name="chevron-right" size={15} /></Link>
          ) : <span />}
        </nav>
      )}
    </>
  );
}
