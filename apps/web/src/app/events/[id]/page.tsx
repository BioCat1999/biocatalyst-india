import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getEvent,
  getCompanyById,
  getDrugById,
  getTrialById,
  getEventsForCompany,
  eventTypeLabel,
} from "@biocatalyst/data";
import { EventTypeTag } from "@/components/EventTypeTag";
import { MarketReactionPanel } from "@/components/MarketReaction";
import { SourceList } from "@/components/SourceList";
import { IssueReportForm } from "@/components/IssueReportForm";
import { FollowButton } from "@/components/FollowButton";
import { EventWorkspace } from "@/components/EventWorkspace";
import { formatDateTime } from "@/lib/format";
import { trialUrl } from "@/lib/urls";

export const dynamic = "force-static";

export function generateStaticParams() {
  // Static export of all seeded event pages for M1.
  return [];
}

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const [companyOpts, drugOpts, trialOpts] = await Promise.all([
    Promise.all(event.companyIds.map((cid) => getCompanyById(cid))),
    Promise.all(event.drugIds.map((did) => getDrugById(did))),
    Promise.all(event.trialIds.map((tid) => getTrialById(tid))),
  ]);
  const companies = companyOpts.filter((c) => c !== undefined);
  const drugs = drugOpts.filter((d) => d !== undefined);
  const trials = trialOpts.filter((t) => t !== undefined);
  const primaryCompany = companies[0];
  const related = primaryCompany
    ? (await getEventsForCompany(primaryCompany.id)).filter((e) => e.id !== event.id).slice(0, 5)
    : [];

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Feed</Link> / Event
      </nav>
      <div className="page-head">
        <div className="card-top">
          <EventTypeTag type={event.eventType} />
          {primaryCompany && (
            <span className="tag ticker">
              {primaryCompany.securities[0]?.ticker} · {primaryCompany.securities[0]?.exchange}
            </span>
          )}
        </div>
        <h1 style={{ fontSize: 26 }}>{event.headline}</h1>
        <p>
          {formatDateTime(event.occurredAt)} · Confidence {(event.confidence * 100).toFixed(0)}% ·
          Review status: {event.reviewStatus}
        </p>
      </div>

      <div className="detail-grid">
        <div>
          <section className="panel" aria-label="Facts">
            <h2>Fact box</h2>
            <dl className="kv">
              <dt>Event type</dt>
              <dd>{eventTypeLabel(event.eventType)}</dd>
              <dt>Date</dt>
              <dd>{formatDateTime(event.occurredAt)}</dd>
              <dt>Company</dt>
              <dd>
                {companies.map((c) => (
                  <span
                    key={c.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      marginRight: 14,
                    }}
                  >
                    <Link href={`/companies/${c.slug}`}>{c.canonicalName}</Link>
                    <FollowButton
                      compact
                      entityType="company"
                      entityId={c.id}
                      label={c.canonicalName}
                    />
                  </span>
                ))}
              </dd>
              {drugs.length > 0 && (
                <>
                  <dt>Drug</dt>
                  <dd>
                    {drugs.map((d) => (
                      <span key={d.id}>
                        <Link href={`/drugs/${d.slug}`}>{d.canonicalName}</Link>{" "}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              {event.indication && (
                <>
                  <dt>Indication</dt>
                  <dd>{event.indication}</dd>
                </>
              )}
              {event.phase && (
                <>
                  <dt>Phase</dt>
                  <dd>{event.phase}</dd>
                </>
              )}
              {event.outcome && (
                <>
                  <dt>Outcome</dt>
                  <dd>{event.outcome.replaceAll("_", " ")}</dd>
                </>
              )}
              {trials.length > 0 && (
                <>
                  <dt>Trial</dt>
                  <dd>
                    {trials.map((t) => (
                      <span key={t.id}>
                        <Link href={trialUrl(t)}>
                          {t.registryTrialId}
                        </Link>{" "}
                      </span>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </section>

          <section className="panel" aria-label="Summary">
            <h2>Summary</h2>
            <p className="fact" style={{ fontWeight: 600 }}>{event.fact}</p>
            <p>{event.summary}</p>
          </section>

          <section className="panel" aria-label="Why this matters">
            <h2>Why this matters</h2>
            <p className="why">{event.catalystSummary}</p>
          </section>

          <section className="panel" aria-label="Sources">
            <h2>Sources</h2>
            <SourceList sources={event.sources} />
          </section>
        </div>

        <aside>
          <section className="panel" aria-label="Research workspace">
            <h2>Research workspace</h2>
            <EventWorkspace eventId={event.id} />
          </section>
          {event.marketReaction && (
            <section className="panel" aria-label="Market reaction">
              <h2>Market reaction</h2>
              <MarketReactionPanel mr={event.marketReaction} />
            </section>
          )}
          <section className="panel" aria-label="Data quality">
            <h2>Data quality</h2>
            <dl className="kv">
              <dt>Confidence</dt>
              <dd>{(event.confidence * 100).toFixed(0)}% (seed fixture)</dd>
              <dt>Status</dt>
              <dd>{event.reviewStatus}</dd>
            </dl>
            <IssueReportForm eventId={event.id} />
          </section>
          {related.length > 0 && primaryCompany && (
            <section className="panel" aria-label="Related events">
              <h2>More from {primaryCompany.canonicalName}</h2>
              <ul className="timeline">
                {related.map((e) => (
                  <li key={e.id}>
                    <time>{formatDateTime(e.occurredAt)}</time>
                    <div>
                      <Link href={`/events/${e.id}`}>{e.headline}</Link>
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
