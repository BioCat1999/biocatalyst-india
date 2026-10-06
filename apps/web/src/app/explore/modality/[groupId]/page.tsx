import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompanyById,
  getCompany,
  getTrialsForDrug,
  listDrugs,
  listEvents,
} from "@biocatalyst/data";
import { getModalityGroup, MODALITY_GLOBAL_PLAYERS } from "@/lib/explore-taxonomy";
import { FollowButton } from "@/components/FollowButton";
import { EventTypeTag } from "@/components/EventTypeTag";
import { formatDateTime } from "@/lib/format";
import { trialUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export default async function ModalityPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const group = getModalityGroup(groupId);
  if (!group) notFound();

  const allDrugs = await listDrugs();
  const drugs = allDrugs.filter((d) => d.modality && group.modalities.includes(d.modality));

  const trialLists = await Promise.all(drugs.map((d) => getTrialsForDrug(d.id)));
  const seenTrials = new Set<string>();
  const trials = trialLists
    .flat()
    .filter((t) => {
      if (seenTrials.has(t.id)) return false;
      seenTrials.add(t.id);
      return true;
    });

  const indications = [...new Set(drugs.flatMap((d) => d.indications))];
  const eventLists = await Promise.all(
    indications.map((ind) => listEvents({ indication: ind }, undefined, 50)),
  );
  const seenEvents = new Set<string>();
  const events = eventLists
    .flatMap((p) => p.items)
    .filter((e) => {
      if (seenEvents.has(e.id)) return false;
      seenEvents.add(e.id);
      return true;
    })
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));

  const companyIds = [...new Set(drugs.flatMap((d) => d.companyLinks.map((l) => l.companyId)))];
  const companyOpts = await Promise.all(companyIds.map((id) => getCompanyById(id)));
  const companies = companyOpts.filter((c) => c !== undefined);

  const globalSlugs = MODALITY_GLOBAL_PLAYERS[groupId] ?? [];
  const globalOpts = await Promise.all(globalSlugs.map((s) => getCompany(s)));
  const globalPlayers = globalOpts.filter((c) => c !== undefined);

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/explore">Explore</Link> / {group.label}
      </nav>
      <div className="page-head">
        <h1>{group.label}</h1>
        <p>{group.blurb}</p>
        <p className="muted">Modalities: {group.modalities.join(" · ")}</p>
      </div>

      <section aria-label="Drugs" style={{ paddingBottom: 24 }}>
        <h2>Drugs ({drugs.length})</h2>
        {drugs.length === 0 && <p className="muted">No drugs tracked for this modality yet.</p>}
        {drugs.map((d) => (
          <div key={d.id} className="result-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href={`/drugs/${d.slug}`} style={{ flex: 1, minWidth: 0, color: "inherit" }}>
              <strong>{d.canonicalName}</strong>{" "}
              {d.modality && <span className="tag neutral">{d.modality}</span>}
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {d.indications.join(" · ")}
              </div>
            </Link>
            <FollowButton compact entityType="drug" entityId={d.id} label={d.canonicalName} />
          </div>
        ))}
      </section>

      <section aria-label="Trials" style={{ paddingBottom: 24 }}>
        <h2>Trials ({trials.length})</h2>
        {trials.length === 0 && <p className="muted">No trials tracked for this modality yet.</p>}
        {trials.map((t) => (
          <Link key={t.id} className="result-row" href={trialUrl(t)}>
            <strong>{t.registryTrialId}</strong>{" "}
            {t.phase && <span className="tag neutral">{t.phase}</span>}
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.title}</div>
          </Link>
        ))}
      </section>

      <section aria-label="Events" style={{ paddingBottom: 24 }}>
        <h2>Events ({events.length})</h2>
        {events.length === 0 && <p className="muted">No events for this modality yet.</p>}
        {events.map((e) => (
          <Link key={e.id} className="result-row" href={`/events/${e.id}`}>
            <EventTypeTag type={e.eventType} /> <strong>{e.headline}</strong>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {formatDateTime(e.occurredAt)}
            </div>
          </Link>
        ))}
      </section>

      <section aria-label="Companies" style={{ paddingBottom: 24 }}>
        <h2>Companies ({companies.length})</h2>
        {companies.length === 0 && <p className="muted">No companies linked yet.</p>}
        {companies.map((c) => (
          <div key={c.id} className="result-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href={`/companies/${c.slug}`} style={{ flex: 1, minWidth: 0, color: "inherit" }}>
              <strong>{c.canonicalName}</strong>{" "}
              <span className="tag ticker">{c.securities[0]?.ticker}</span>
            </Link>
            <FollowButton compact entityType="company" entityId={c.id} label={c.canonicalName} />
          </div>
        ))}
      </section>

      {globalPlayers.length > 0 && (
        <section aria-label="Global players" style={{ paddingBottom: 48 }}>
          <h2>Global players ({globalPlayers.length})</h2>
          <p className="muted">
            Non-Indian pharma majors working in this modality.
          </p>
          {globalPlayers.map((c) => (
            <div key={c.id} className="result-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Link href={`/companies/${c.slug}`} style={{ flex: 1, minWidth: 0, color: "inherit" }}>
                <strong>{c.canonicalName}</strong>{" "}
                <span className="tag neutral">{c.country}</span>{" "}
                <span className="tag ticker">
                  {c.securities[0]?.ticker} · {c.securities[0]?.exchange}
                </span>
              </Link>
              <FollowButton compact entityType="company" entityId={c.id} label={c.canonicalName} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}
