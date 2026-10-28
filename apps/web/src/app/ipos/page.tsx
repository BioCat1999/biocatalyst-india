import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listIpoPipeline, type IpoStatus } from "@biocatalyst/data";
import { eventTypeLabel } from "@biocatalyst/types";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar, HeroTile, PageHero } from "@/components/PageParts";
import { TimeAgo } from "@/components/TimeAgo";
import { eventStyle, styleVars } from "@/lib/categories";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pharma IPO tracker — Biocatalyst India" };

const getCachedIpoPipeline = unstable_cache(listIpoPipeline, ["ipo-pipeline"], {
  revalidate: 300,
});

const STATUS: Record<IpoStatus, { label: string; color: string; soft: string; icon: IconName }> = {
  in_pipeline: { label: "In pipeline", color: "#9a6a00", soft: "#fdf3dd", icon: "file-text" },
  listed: { label: "Listed", color: "#1c7a3d", soft: "#e7f5ec", icon: "rocket" },
  watchlist: { label: "Watchlist", color: "#12406b", soft: "#eef2f6", icon: "target" },
};
const ORDER: IpoStatus[] = ["in_pipeline", "listed", "watchlist"];

function fmt(d: string) {
  const dt = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * IPO tracker: Indian pharma companies in the IPO pipeline or recently
 * listed. Status starts from a curated catalog (milestones that predate
 * ingestion, e.g. Injecto's 21 Sep 2026 listing) and detected news events
 * can only advance it. This is a research tracker, not investment advice.
 */
export default async function IposPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [entries, sp] = await Promise.all([getCachedIpoPipeline(), searchParams]);
  const active = ORDER.includes(sp.status as IpoStatus) ? (sp.status as IpoStatus) : null;
  const counts = Object.fromEntries(ORDER.map((s) => [s, entries.filter((e) => e.status === s).length])) as Record<IpoStatus, number>;
  const visible = active ? entries.filter((e) => e.status === active) : entries;

  return (
    <>
      <PageHero
        kicker="PHARMA IPO TRACKER"
        title="Heading for the public markets"
        accent="#c2335f"
        aside={
          <div className="hero-tiles">
            <HeroTile icon="file-text" value={counts.in_pipeline} label="In pipeline" color="#fcd34d" />
            <HeroTile icon="rocket" value={counts.listed} label="Recently listed" color="#4ade80" />
            <HeroTile icon="target" value={counts.watchlist} label="Watchlist" color="#8fb6ff" />
            <HeroTile icon="building" value={entries.length} label="Tracked" color="#7eeede" />
          </div>
        }
      >
        <p>
          Indian pharma companies filing for IPOs, plus recent listings. Filing and listing milestones are
          detected from news flow. A research tracker — not investment advice.
        </p>
      </PageHero>

      <div className="filters">
        <div className="chips" role="group" aria-label="Filter by status">
          <Link href="/ipos" className="chip" aria-pressed={!active}>
            <Icon name="grid" size={14} /> All <span className="count">{entries.length}</span>
          </Link>
          {ORDER.map((s) => (
            <Link
              key={s}
              href={`/ipos?status=${s}`}
              className="chip chip-cat"
              style={styleVars(STATUS[s])}
              aria-pressed={active === s}
            >
              <Icon name={STATUS[s].icon} size={14} /> {STATUS[s].label} <span className="count">{counts[s]}</span>
            </Link>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon"><Icon name="rocket" size={24} /></span>
          <p>No IPO candidates in this view yet.</p>
        </div>
      ) : (
        <div className="ipo-grid">
          {visible.map(({ company, status, milestone, latestEvent }) => {
            const st = STATUS[status];
            const steps = [
              { label: "Watchlist", done: true, date: null as string | null },
              { label: "DRHP filed", done: !!milestone.drhpDate || status !== "watchlist", date: milestone.drhpDate ?? null },
              { label: "Listed", done: status === "listed", date: milestone.listingDate ?? null },
            ];
            const ev = latestEvent ? eventStyle(latestEvent.eventType) : null;
            return (
              <article key={company.id} className="ipo-card" style={styleVars(st)}>
                <div className="ipo-head">
                  <Avatar name={company.canonicalName} size={44} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2><Link href={`/companies/${company.slug}`}>{company.canonicalName}</Link></h2>
                    <span className="status-chip"><Icon name={st.icon} size={12} /> {st.label}</span>
                  </div>
                </div>
                {company.description && <p className="company-desc">{company.description}</p>}

                <ol className="stepper" aria-label="IPO progress">
                  {steps.map((s) => (
                    <li key={s.label} className={s.done ? "done" : undefined}>
                      <span className="step-dot">{s.done && <Icon name="check-circle" size={14} />}</span>
                      <strong>{s.label}</strong>
                      {s.date && <small>{fmt(s.date)}</small>}
                    </li>
                  ))}
                </ol>
                {milestone.note && <p className="ipo-note"><Icon name="file-text" size={13} /> {milestone.note}</p>}

                {latestEvent && ev ? (
                  <Link href={`/events/${latestEvent.id}`} className="ipo-event" style={styleVars(ev)}>
                    <span className="ev-badge"><Icon name={ev.icon} size={14} /></span>
                    <span>
                      <small>{eventTypeLabel(latestEvent.eventType)} · <TimeAgo iso={latestEvent.occurredAt} /></small>
                      <strong>{latestEvent.headline}</strong>
                    </span>
                  </Link>
                ) : (
                  <p className="muted ipo-none">No IPO news detected yet.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
