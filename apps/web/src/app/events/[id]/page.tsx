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
import { MarketReactionPanel } from "@/components/MarketReaction";
import { SourceList } from "@/components/SourceList";
import { IssueReportForm } from "@/components/IssueReportForm";
import { FollowButton } from "@/components/FollowButton";
import { EventWorkspace } from "@/components/EventWorkspace";
import { Icon, type IconName } from "@/components/Icon";
import { formatDateTime, formatPct } from "@/lib/format";
import { trialUrl } from "@/lib/urls";
import { eventStyle, styleVars } from "@/lib/categories";
import { dedupeEventText } from "@/lib/text";

function PanelTitle({ icon, color, soft, children }: { icon: IconName; color: string; soft: string; children: React.ReactNode }) {
  return (
    <div className="panel-title">
      <span style={{ background: soft, color }}><Icon name={icon} size={15} /></span>
      <h2>{children}</h2>
    </div>
  );
}

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
  const cat = eventStyle(event.eventType);
  const pct = event.marketReaction?.pctChange ?? null;
  // The key fact is shown in its own callout, so drop it from the summary text.
  const factN = (event.fact ?? "").replace(/\s+/g, " ").trim();
  const sumN = (event.summary ?? "").replace(/\s+/g, " ").trim();
  let summaryText = sumN;
  if (factN && sumN.includes(factN)) {
    // Empty when the summary is just the fact again — the panel is then hidden.
    summaryText = sumN.replace(factN, "").trim();
  } else {
    const d = dedupeEventText(factN, sumN);
    if (d.fact === factN && d.summary) summaryText = d.summary;
  }
  const confColor = event.confidence >= 0.8 ? "#1c7a3d" : event.confidence >= 0.6 ? "#9a6a00" : "#b3261e";

  return (
    <>
      <section className="ev-hero" style={styleVars(cat)}>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Feed</Link> / Event
        </nav>
        <span className="ev-hero-type">
          <Icon name={cat.icon} size={14} /> {eventTypeLabel(event.eventType)}
        </span>
        <h1>{event.headline}</h1>
        <div className="ev-hero-meta">
          {primaryCompany?.securities[0] && (
            <span>
              <Icon name="building" size={13} /> {primaryCompany.securities[0].ticker} · {primaryCompany.securities[0].exchange}
            </span>
          )}
          <span><Icon name="calendar" size={13} /> {formatDateTime(event.occurredAt)}</span>
          <span><Icon name="file-text" size={13} /> {event.sources.length} source{event.sources.length === 1 ? "" : "s"}</span>
          <span><Icon name="target" size={13} /> {(event.confidence * 100).toFixed(0)}% confidence</span>
          {pct != null && (
            <span className={pct > 0 ? "up" : pct < 0 ? "down" : undefined}>
              <Icon name={pct > 0 ? "caret-up" : pct < 0 ? "caret-down" : "arrow-right"} size={13} strokeWidth={3} />
              {event.marketReaction?.securityTicker} {formatPct(pct)}
            </span>
          )}
        </div>
      </section>
      {event.fact && (
        <div className="key-fact" style={styleVars(cat)}>
          <small>KEY FACT</small>
          <p>{event.fact}</p>
        </div>
      )}

      <div className="detail-grid">
        <div>
          {summaryText && (
            <section className="panel" aria-label="Summary">
              <PanelTitle icon="book" color="#1f63d6" soft="#e6efff">Summary</PanelTitle>
              <p className="prose">{summaryText}</p>
            </section>
          )}

          {event.catalystSummary && (
            <section className="panel" aria-label="Why this matters">
              <PanelTitle icon="zap" color="#9a6a00" soft="#fdf3dd">Why this matters</PanelTitle>
              <p className="why-box">
                {event.catalystSummary}
                <em>Neutral catalyst context — not investment advice.</em>
              </p>
            </section>
          )}

          <section className="panel" aria-label="Facts">
            <PanelTitle icon="grid" color="#12406b" soft="#eef2f6">At a glance</PanelTitle>
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

          <section className="panel" aria-label="Sources">
            <PanelTitle icon="link" color="#007f7a" soft="#dcf8f2">Sources</PanelTitle>
            <SourceList sources={event.sources} />
          </section>
        </div>

        <aside>
          <section className="panel" aria-label="Research workspace">
            <PanelTitle icon="bookmark" color="#007f7a" soft="#dcf8f2">Research workspace</PanelTitle>
            <EventWorkspace eventId={event.id} />
          </section>
          {event.marketReaction && (
            <section className="panel" aria-label="Market reaction">
              <PanelTitle icon="trending-up" color="#c2335f" soft="#fdeaf0">Market reaction</PanelTitle>
              <MarketReactionPanel mr={event.marketReaction} />
            </section>
          )}
          <section className="panel" aria-label="Data quality">
            <PanelTitle icon="target" color={confColor} soft="#eef2f6">Data quality</PanelTitle>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
              <span>Extraction confidence</span>
              <span style={{ color: confColor }}>{(event.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="conf-bar">
              <span style={{ width: `${Math.round(event.confidence * 100)}%`, background: confColor }} />
            </div>
            <p className="muted" style={{ margin: "6px 0 12px" }}>Review status: {event.reviewStatus.replaceAll("_", " ")}</p>
            <IssueReportForm eventId={event.id} />
          </section>
          {related.length > 0 && primaryCompany && (
            <section className="panel" aria-label="Related events">
              <PanelTitle icon="activity" color="#12406b" soft="#eef2f6">More from {primaryCompany.canonicalName}</PanelTitle>
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
