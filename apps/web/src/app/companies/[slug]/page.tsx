import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import {
  getCompanyPageData,
  getGlobalLinksForCompany,
  listGlobalCompanies,
} from "@biocatalyst/data";
import { eventTypeLabel } from "@biocatalyst/types";
import { FollowButton } from "@/components/FollowButton";
import { Icon } from "@/components/Icon";
import { Avatar, HeroTile, PageHero, PanelTitle } from "@/components/PageParts";
import { TimeAgo } from "@/components/TimeAgo";
import { trialUrl } from "@/lib/urls";
import { CompanyMarketChart } from "@/components/CompanyMarketChart";
import { categoriesForCompany } from "@/lib/company-categories";
import { companyCategoryStyle, eventStyle, styleVars } from "@/lib/categories";

export const dynamic = "force-static";
export const revalidate = 300;

const getCachedCompanyPageData = unstable_cache(
  getCompanyPageData,
  ["company-detail-v2"],
  { revalidate: 300 },
);

// Global companies are the highest-latency detail clicks because their pages
// are commonly a user's first request to a fresh deployment. Generate those
// pages during deployment; if a local build has no database, Next can still
// generate them on demand.
export async function generateStaticParams() {
  try {
    return (await listGlobalCompanies()).map(({ slug }) => ({ slug }));
  } catch {
    return [];
  }
}

const GLOBAL_LINK_KIND_LABEL: Record<string, string> = {
  licensing: "Licensing",
  api_supply: "API supply",
  patent_expiry_opportunity: "Patent-expiry opportunity",
  competitor: "Competitor",
  subsidiary: "Subsidiary",
};

const PHASE_COLOR: Record<string, string> = {
  "Phase 1": "#6d4bd8",
  "Phase 2": "#1f63d6",
  "Phase 3": "#007f7a",
  "Phase 4": "#1c7a3d",
};

function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  return Math.round((new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getCachedCompanyPageData(slug);
  if (!data) notFound();
  const { company, drugs, trials, events, patents, patentCount } = data;
  const globalLinks = getGlobalLinksForCompany(slug);
  const cats = categoriesForCompany(company.slug);

  return (
    <>
      <PageHero
        kicker={company.country === "India" ? "INDIAN COMPANY" : "GLOBAL COMPANY"}
        accent="#00b5a6"
        breadcrumb={<><Link href="/">Feed</Link> / <Link href="/companies">Companies</Link> / {company.canonicalName}</>}
        title={
          <span className="company-hero-title">
            <Avatar name={company.canonicalName} size={56} />
            <span>{company.canonicalName}</span>
          </span>
        }
        aside={
          <div className="hero-tiles">
            <HeroTile icon="activity" value={events.length} label="Catalysts" color="#7eeede" />
            <HeroTile icon="pill" value={drugs.length} label="Drugs" color="#8fb6ff" />
            <HeroTile icon="flask" value={trials.length} label="Trials" color="#c4b5fd" />
            <HeroTile icon="key" value={patentCount} label="US patents" color="#fcd34d" />
          </div>
        }
      >
        <div className="company-hero-meta">
          {company.securities.map((s) => (
            <span key={s.exchange} className="ev-ticker">{s.ticker}<small>{s.exchange}</small></span>
          ))}
          {cats.map((cc) => {
            const s = companyCategoryStyle(cc.id);
            return (
              <span key={cc.id} className="cat-tag" style={styleVars(s)}>
                <Icon name={s.icon} size={11} /> {cc.label}
              </span>
            );
          })}
        </div>
        {company.description && <p>{company.description}</p>}
        <div className="hero-actions">
          <FollowButton entityType="company" entityId={company.id} label="company" />
          {company.website && (
            <a className="btn btn-ghost-light" href={company.website} target="_blank" rel="noopener noreferrer">
              <Icon name="globe" size={15} /> {company.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          )}
          <Link className="btn btn-ghost-light" href={`/compare?a=${company.slug}`}>
            <Icon name="layers" size={15} /> Compare
          </Link>
        </div>
      </PageHero>

      <div className="detail-grid">
        <div>
          {company.securities.length > 0 && <CompanyMarketChart slug={company.slug} />}
          <section className="panel" aria-label="Recent catalysts">
            <PanelTitle icon="activity" color="#007f7a" soft="#dcf8f2" right={<span className="count-pill">{events.length}</span>}>
              Recent catalysts
            </PanelTitle>
            {events.length === 0 ? (
              <p className="muted">No catalyst events yet. Follow this company to be alerted when one lands.</p>
            ) : (
              <ol className="catalyst-timeline">
                {events.map((e) => {
                  const s = eventStyle(e.eventType);
                  return (
                    <li key={e.id} style={styleVars(s)}>
                      <span className="tl-icon"><Icon name={s.icon} size={14} /></span>
                      <div>
                        <span className="tl-meta">
                          <strong>{eventTypeLabel(e.eventType)}</strong> · <TimeAgo iso={e.occurredAt} />
                        </span>
                        <Link href={`/events/${e.id}`} className="tl-title">{e.headline}</Link>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
        <aside>
          {drugs.length > 0 && (
            <section className="panel" aria-label="Drugs">
              <PanelTitle icon="pill" color="#1f63d6" soft="#e6efff" right={<span className="count-pill">{drugs.length}</span>}>Drugs</PanelTitle>
              <ul className="mini-list">
                {drugs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/drugs/${d.slug}`}><strong>{d.canonicalName}</strong></Link>
                    {d.indications.length > 0 && <span>{d.indications.join(" · ")}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {trials.length > 0 && (
            <section className="panel" aria-label="Trials">
              <PanelTitle icon="flask" color="#6d4bd8" soft="#efeafd" right={<span className="count-pill">{trials.length}</span>}>Trials</PanelTitle>
              <ul className="mini-list">
                {trials.map((t) => (
                  <li key={t.id}>
                    <Link href={trialUrl(t)}><strong>{t.registryTrialId}</strong></Link>
                    <span>
                      <i className="phase-dot" style={{ background: PHASE_COLOR[t.phase] ?? "#64748b" }} />
                      {t.phase} · {t.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {company.globalFootprint && (
            <section className="panel" aria-label="Global footprint">
              <PanelTitle icon="globe" color="#12406b" soft="#eef2f6">Global footprint</PanelTitle>
              <p className="prose" style={{ fontSize: 14, margin: 0 }}>{company.globalFootprint}</p>
            </section>
          )}
          {patents.length > 0 && (
            <section className="panel" aria-label="Patents">
              <PanelTitle icon="key" color="#9a6a00" soft="#fdf3dd" right={<span className="count-pill">{patentCount}</span>}>US patents</PanelTitle>
              <p className="muted" style={{ margin: "0 0 10px" }}>
                Orange Book listings where {company.canonicalName} is the applicant.
              </p>
              <ul className="mini-list">
                {patents.map((p) => {
                  const d = daysUntil(p.expiryDate);
                  return (
                    <li key={`${p.patentNumber}-${p.applNo}-${p.productNo}`}>
                      <span className="patent-row-top">
                        <strong>{p.tradeName}</strong>
                        {d !== null && d >= 0 && (
                          <span className={`urgency ${d <= 90 ? "u-hot" : d <= 365 ? "u-warm" : "u-cool"}`}>
                            {d <= 365 ? `${d}d` : `${Math.round(d / 365)}y`}
                          </span>
                        )}
                      </span>
                      <span>US {p.patentNumber} · {p.activeIngredient} · expires {p.expiryDate ?? "—"}</span>
                    </li>
                  );
                })}
              </ul>
              {patentCount > patents.length && <p className="muted">+ {patentCount - patents.length} more</p>}
              <Link href="/patents" className="side-link">Patent cliff tracker <Icon name="arrow-right" size={14} /></Link>
            </section>
          )}
          {globalLinks.length > 0 && (
            <section className="panel" aria-label="Global links">
              <PanelTitle icon="link" color="#c2335f" soft="#fdeaf0" right={<span className="count-pill">{globalLinks.length}</span>}>Global links</PanelTitle>
              <ul className="mini-list">
                {globalLinks.map(({ link, otherCompany }) => (
                  <li key={link.id}>
                    <span className="link-kind">{GLOBAL_LINK_KIND_LABEL[link.kind] ?? link.kind}</span>
                    {otherCompany && (
                      <Link href={`/companies/${otherCompany.slug}`}><strong>{otherCompany.canonicalName}</strong></Link>
                    )}
                    <span style={{ color: "var(--ink)" }}>{link.title}</span>
                    <span>{link.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
