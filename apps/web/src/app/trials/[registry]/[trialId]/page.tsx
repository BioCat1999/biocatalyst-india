import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getTrial,
  getEventsForTrial,
  getDrugById,
  getCompanyById,
} from "@biocatalyst/data";
import { EventTypeTag } from "@/components/EventTypeTag";
import { formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-static";

export default async function TrialPage({
  params,
}: {
  params: Promise<{ registry: string; trialId: string }>;
}) {
  const { registry, trialId } = await params;
  const decodedTrialId = decodeURIComponent(trialId);
  const trial = await getTrial(registry, decodedTrialId);
  if (!trial) notFound();

  const [drugOpts, sponsor, events] = await Promise.all([
    Promise.all(trial.drugIds.map((id) => getDrugById(id))),
    trial.sponsorCompanyId ? getCompanyById(trial.sponsorCompanyId) : Promise.resolve(undefined),
    getEventsForTrial(trial.id),
  ]);
  const drugs = drugOpts.filter((d) => d !== undefined);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Feed</Link> / Trials / {trial.registryTrialId}
      </nav>
      <div className="page-head">
        <h1>
          {trial.registryTrialId} <span style={{ fontWeight: 400 }}>· {trial.registry}</span>
        </h1>
        <p>{trial.title}</p>
        <p>
          <a href={trial.sourceUrl} target="_blank" rel="noopener noreferrer">
            Open registry record ↗
          </a>
        </p>
      </div>

      <div className="detail-grid">
        <div>
          <section className="panel" aria-label="Trial details">
            <h2>Trial details</h2>
            <dl className="kv">
              <dt>Registry</dt>
              <dd>{trial.registry}</dd>
              <dt>Registry ID</dt>
              <dd>{trial.registryTrialId}</dd>
              <dt>Phase</dt>
              <dd>{trial.phase}</dd>
              <dt>Status</dt>
              <dd>{trial.status}</dd>
              {trial.enrollment !== undefined && (
                <>
                  <dt>Enrollment</dt>
                  <dd>{trial.enrollment.toLocaleString("en-IN")} participants</dd>
                </>
              )}
              {sponsor && (
                <>
                  <dt>Sponsor</dt>
                  <dd>
                    <Link href={`/companies/${sponsor.slug}`}>{sponsor.canonicalName}</Link>
                  </dd>
                </>
              )}
              {trial.startDate && (
                <>
                  <dt>Start date</dt>
                  <dd>{formatDate(trial.startDate)}</dd>
                </>
              )}
              {trial.primaryCompletionDate && (
                <>
                  <dt>Primary completion</dt>
                  <dd>{formatDate(trial.primaryCompletionDate)}</dd>
                </>
              )}
              <dt>Indications</dt>
              <dd>{trial.indications.join(" · ")}</dd>
              {drugs.length > 0 && (
                <>
                  <dt>Interventions</dt>
                  <dd>
                    {drugs.map((d) => (
                      <span key={d.id}>
                        <Link href={`/drugs/${d.slug}`}>{d.canonicalName}</Link>{" "}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              {trial.primaryEndpoints && (
                <>
                  <dt>Primary endpoints</dt>
                  <dd>{trial.primaryEndpoints.join("; ")}</dd>
                </>
              )}
            </dl>
          </section>
          <section className="panel" aria-label="Associated catalyst events">
            <h2>Associated catalyst events ({events.length})</h2>
            {events.length === 0 ? (
              <p>No catalyst events linked to this trial yet.</p>
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
          <section className="panel" aria-label="Change history">
            <h2>Change history</h2>
            <p style={{ fontSize: 14, color: "var(--muted)" }}>
              Change tracking arrives with live registry ingestion (Milestone 3).
              This prototype shows the latest seeded snapshot only.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
