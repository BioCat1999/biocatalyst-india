import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getDrug,
  getCompaniesForDrug,
  getTrialsForDrug,
  getEventsForDrug,
  getPatentsForDrug,
} from "@biocatalyst/data";
import { FollowButton } from "@/components/FollowButton";
import { EventTypeTag } from "@/components/EventTypeTag";
import { formatDateTime } from "@/lib/format";
import { trialUrl } from "@/lib/urls";

export const dynamic = "force-static";

export default async function DrugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const drug = await getDrug(slug);
  if (!drug) notFound();

  const [sponsors, trials, events, patents] = await Promise.all([
    getCompaniesForDrug(drug),
    getTrialsForDrug(drug.id),
    getEventsForDrug(drug.id),
    getPatentsForDrug(drug.id),
  ]);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Feed</Link> / Drugs / {drug.canonicalName}
      </nav>
      <div className="page-head">
        <div className="entity-head">
          <div>
            <h1>{drug.canonicalName}</h1>
            {drug.aliases.length > 0 && <p>Also known as: {drug.aliases.join(", ")}</p>}
            <p>
              {drug.modality && <span className="tag neutral">{drug.modality}</span>}{" "}
              {drug.mechanism && <span className="tag neutral">{drug.mechanism}</span>}
            </p>
          </div>
          <FollowButton entityType="drug" entityId={drug.id} label="drug" />
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <section className="panel" aria-label="Trials by phase">
            <h2>Trials ({trials.length})</h2>
            {trials.length === 0 ? (
              <p>No trials linked yet.</p>
            ) : (
              <ul className="timeline">
                {trials.map((t) => (
                  <li key={t.id}>
                    <span className="tag neutral">{t.phase}</span>{" "}
                    <span className="tag neutral">{t.status}</span>
                    <div>
                      <Link href={trialUrl(t)}>
                        <strong>{t.registryTrialId}</strong>
                      </Link>{" "}
                      — {t.title}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
          <section className="panel" aria-label="Companies">
            <h2>Companies / sponsors</h2>
            <ul className="source-list">
              {sponsors.map((c) => (
                <li key={c.id} style={{ borderLeftColor: "var(--navy)" }}>
                  <Link href={`/companies/${c.slug}`}>
                    <strong>{c.canonicalName}</strong>
                  </Link>
                  <div className="pub">
                    {drug.companyLinks.find((l) => l.companyId === c.id)?.relationshipType}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel" aria-label="Indications">
            <h2>Indications</h2>
            <p>{drug.indications.join(" · ")}</p>
          </section>
          {patents.length > 0 && (
            <section className="panel" aria-label="Patents">
              <h2>Patents ({patents.length})</h2>
              <ul className="source-list">
                {patents.map((p) => (
                  <li key={`${p.patentNumber}-${p.applNo}-${p.productNo}`} style={{ borderLeftColor: "var(--teal)" }}>
                    <strong>US {p.patentNumber}</strong>{" "}
                    <span className="tag neutral">{p.tradeName}</span>
                    <div className="pub">
                      expires {p.expiryDate ?? "—"}
                      {p.drugSubstanceFlag && " · substance"}
                      {p.drugProductFlag && " · product"}
                    </div>
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
