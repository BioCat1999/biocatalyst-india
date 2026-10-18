import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompany,
  getDrugsForCompany,
  getTrialsForCompany,
  getEventsForCompany,
  getGlobalLinksForCompany,
  getPatentsForCompany,
} from "@biocatalyst/data";
import { FollowButton } from "@/components/FollowButton";
import { EventTypeTag } from "@/components/EventTypeTag";
import { formatDateTime } from "@/lib/format";
import { trialUrl } from "@/lib/urls";
import { CompanyMarketChart } from "@/components/CompanyMarketChart";

export const dynamic = "force-static";

const GLOBAL_LINK_KIND_LABEL: Record<string, string> = {
  licensing: "Licensing",
  api_supply: "API supply",
  patent_expiry_opportunity: "Patent-expiry opportunity",
  competitor: "Competitor",
  subsidiary: "Subsidiary",
};

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getCompany(slug);
  if (!company) notFound();

  const [drugs, trials, events, patents] = await Promise.all([
    getDrugsForCompany(company.id),
    getTrialsForCompany(company.id),
    getEventsForCompany(company.id),
    getPatentsForCompany(company.id),
  ]);
  const globalLinks = getGlobalLinksForCompany(slug);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Feed</Link> / Companies / {company.canonicalName}
      </nav>
      <div className="page-head">
        <div className="entity-head">
          <div>
            <h1>{company.canonicalName}</h1>
            <p>
              {company.securities.map((s) => (
                <span key={s.exchange} className="tag ticker" style={{ marginRight: 6 }}>
                  {s.ticker} · {s.exchange}
                </span>
              ))}
            </p>
            <p style={{ maxWidth: 640 }}>{company.description}</p>
            <p>
              <a href={company.website} target="_blank" rel="noopener noreferrer">
                {company.website.replace("https://", "")}
              </a>{" "}
              · {company.country}
            </p>
          </div>
          <FollowButton entityType="company" entityId={company.id} label="company" />
        </div>
      </div>

      <div className="detail-grid">
        <div>
          {company.securities.length > 0 && <CompanyMarketChart slug={company.slug} />}
          <section className="panel" aria-label="Recent catalysts">
            <h2>Recent catalysts ({events.length})</h2>
            {events.length === 0 ? (
              <p>No catalyst events yet.</p>
            ) : (
              <ul className="timeline">
                {events.map((e) => (
                  <li key={e.id}>
                    <time>{formatDateTime(e.occurredAt)}</time>
                    <div>
                      <EventTypeTag type={e.eventType} />{" "}
                      <Link href={`/events/${e.id}`}>{e.headline}</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside>
          <section className="panel" aria-label="Drugs">
            <h2>Drugs ({drugs.length})</h2>
            <ul className="source-list">
              {drugs.map((d) => (
                <li key={d.id} style={{ borderLeftColor: "var(--navy)" }}>
                  <Link href={`/drugs/${d.slug}`}>
                    <strong>{d.canonicalName}</strong>
                  </Link>
                  <div className="pub">{d.indications.join(" · ")}</div>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel" aria-label="Trials">
            <h2>Trials ({trials.length})</h2>
            <ul className="source-list">
              {trials.map((t) => (
                <li key={t.id} style={{ borderLeftColor: "var(--navy)" }}>
                  <Link href={trialUrl(t)}>
                    <strong>{t.registryTrialId}</strong>
                  </Link>
                  <div className="pub">
                    {t.phase} · {t.status}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {company.globalFootprint && (
            <section className="panel" aria-label="Global footprint">
              <h2>Global footprint</h2>
              <p>{company.globalFootprint}</p>
            </section>
          )}
          {patents.length > 0 && (
            <section className="panel" aria-label="Patents">
              <h2>Patents ({patents.length})</h2>
              <p className="pub" style={{ marginBottom: 8 }}>
                Orange Book listings where {company.canonicalName} is the
                applicant. <Link href="/patents">Patent cliff tracker →</Link>
              </p>
              <ul className="source-list">
                {patents.slice(0, 10).map((p) => (
                  <li key={`${p.patentNumber}-${p.applNo}-${p.productNo}`} style={{ borderLeftColor: "var(--teal)" }}>
                    <strong>US {p.patentNumber}</strong>{" "}
                    <span className="tag neutral">{p.tradeName}</span>
                    <div className="pub">
                      {p.activeIngredient} · expires {p.expiryDate ?? "—"}
                      {p.drugSubstanceFlag && " · substance"}
                      {p.drugProductFlag && " · product"}
                    </div>
                  </li>
                ))}
              </ul>
              {patents.length > 10 && (
                <p className="pub">+ {patents.length - 10} more</p>
              )}
            </section>
          )}
          {globalLinks.length > 0 && (
            <section className="panel" aria-label="Global links">
              <h2>Global links ({globalLinks.length})</h2>
              <ul className="source-list">
                {globalLinks.map(({ link, otherCompany }) => (
                  <li key={link.id} style={{ borderLeftColor: "var(--teal)" }}>
                    <div className="pub">
                      {GLOBAL_LINK_KIND_LABEL[link.kind] ?? link.kind}
                    </div>
                    {otherCompany && (
                      <Link href={`/companies/${otherCompany.slug}`}>
                        <strong>{otherCompany.canonicalName}</strong>
                      </Link>
                    )}
                    <div>{link.title}</div>
                    <div className="pub">{link.description}</div>
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
