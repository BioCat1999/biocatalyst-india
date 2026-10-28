import { Suspense } from "react";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listEvents, toEventCards, EVENT_TYPES, getCatalystCalendar } from "@biocatalyst/data";
import type { EventType } from "@biocatalyst/types";
import { EventCard } from "@/components/EventCard";
import { FilterChips } from "@/components/FilterChips";
import { Icon, type IconName } from "@/components/Icon";
import { formatPct, mrClass } from "@/lib/format";
import { kindLabel, kindStyle, styleVars } from "@/lib/categories";

export const revalidate = 3600;

const getCachedFeed = unstable_cache(
  async (eventType?: EventType) => {
    const page = await listEvents(eventType ? { eventType } : {}, undefined, 30);
    return { ...page, cards: await toEventCards(page.items) };
  },
  ["feed-first-page"],
  { revalidate: 300 },
);

function day(d: Date) {
  return d.toISOString().slice(0, 10);
}

const getUpcomingWeek = unstable_cache(
  async () => {
    const today = new Date();
    return getCatalystCalendar({
      from: day(today),
      to: day(new Date(today.getTime() + 7 * 86_400_000)),
      limit: 200,
    });
  },
  ["home-upcoming-week"],
  { revalidate: 900 },
);

async function FeedList({ eventType }: { eventType?: EventType }) {
  const { items, nextCursor, cards } = await getCachedFeed(eventType);
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><Icon name="sparkles" size={26} /></span>
        <p>No catalyst events match this filter yet.</p>
        <Link href="/" className="btn">Show all events</Link>
      </div>
    );
  }
  return (
    <div className="feed">
      {cards.map((card) => (
        <EventCard key={card.id} event={card} />
      ))}
      {nextCursor && (
        <p className="feed-end">
          Showing the {items.length} most recent events. Use <Link href="/search">search</Link> or a
          company page to dig further back.
        </p>
      )}
    </div>
  );
}

function Stat({ icon, value, label, tone }: { icon: IconName; value: number; label: string; tone: string }) {
  return (
    <div className={`hero-tile hero-tile-${tone}`}>
      <Icon name={icon} size={16} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

async function HeroStats() {
  const [{ cards }, upcoming] = await Promise.all([getCachedFeed(), getUpcomingWeek()]);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = cards.filter((c) => new Date(c.occurredAt).getTime() >= weekAgo).length;
  const approvals = cards.filter((c) => c.eventType === "regulatory_approval").length;
  const trials = cards.filter((c) =>
    ["clinical_trial_result", "primary_endpoint_met", "primary_endpoint_missed"].includes(c.eventType),
  ).length;
  return (
    <div className="hero-tiles" aria-label="Feed at a glance">
      {thisWeek > 0 ? (
        <Stat icon="sparkles" value={thisWeek} label="New this week" tone="mint" />
      ) : (
        <Stat icon="sparkles" value={cards.length} label="Recent signals" tone="mint" />
      )}
      <Stat icon="award" value={approvals} label="Approvals" tone="green" />
      <Stat icon="flask" value={trials} label="Trial readouts" tone="blue" />
      <Stat icon="calendar" value={upcoming.length} label="Due in 7 days" tone="violet" />
    </div>
  );
}

async function UpcomingPanel() {
  const items = await getUpcomingWeek();
  const today = day(new Date());
  return (
    <section className="side-panel" aria-labelledby="upcoming-h">
      <div className="side-head">
        <span className="side-icon" style={{ background: "#efeafd", color: "#6d4bd8" }}>
          <Icon name="calendar" size={16} />
        </span>
        <h2 id="upcoming-h">Coming up this week</h2>
        <span className="side-count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="muted">Nothing scheduled in the next 7 days.</p>
      ) : (
        <ul className="upcoming-list">
          {items.slice(0, 6).map((item) => {
            const s = kindStyle(item.kind);
            const d = new Date(`${item.date}T00:00:00`);
            const diff = Math.round((d.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
            return (
              <li key={item.id} style={styleVars(s)}>
                <span className="up-date">
                  <small>{d.toLocaleDateString("en-IN", { month: "short" })}</small>
                  {d.getDate()}
                </span>
                <span className="up-body">
                  <span className="up-kind"><Icon name={s.icon} size={12} /> {kindLabel(item.kind)}</span>
                  <span className="up-title">{item.title}</span>
                </span>
                <span className="up-when">{diff <= 0 ? "Today" : diff === 1 ? "Tomorrow" : `${diff}d`}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/calendar?view=week" className="side-link">
        Open calendar <Icon name="arrow-right" size={14} />
      </Link>
    </section>
  );
}

async function MoversPanel() {
  const { cards } = await getCachedFeed();
  const movers = cards
    .filter((c) => c.marketReaction?.pctChange != null)
    .sort((a, b) => Math.abs(b.marketReaction!.pctChange!) - Math.abs(a.marketReaction!.pctChange!))
    .slice(0, 5);
  if (movers.length === 0) return null;
  return (
    <section className="side-panel" aria-labelledby="movers-h">
      <div className="side-head">
        <span className="side-icon" style={{ background: "#fdeaf0", color: "#c2335f" }}>
          <Icon name="trending-up" size={16} />
        </span>
        <h2 id="movers-h">Biggest market moves</h2>
      </div>
      <ul className="movers-list">
        {movers.map((c) => {
          const pct = c.marketReaction!.pctChange!;
          return (
            <li key={c.id}>
              <Link href={`/events/${c.id}`}>
                <span className="mover-ticker">{c.marketReaction!.securityTicker}</span>
                <span className="mover-title">{c.headline}</span>
                <span className={`mover-pct ${mrClass(pct)}`}>{formatPct(pct)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const QUICK_LINKS: Array<{ href: string; label: string; hint: string; icon: IconName; color: string; soft: string }> = [
  { href: "/patents", label: "Patent cliff", hint: "Upcoming expiries", icon: "key", color: "#6d4bd8", soft: "#efeafd" },
  { href: "/ipos", label: "IPO tracker", hint: "Pharma listings", icon: "rocket", color: "#c2335f", soft: "#fdeaf0" },
  { href: "/insights", label: "Intelligence", hint: "Trends & signals", icon: "sparkles", color: "#007f7a", soft: "#dcf8f2" },
  { href: "/compare", label: "Compare", hint: "Side by side", icon: "layers", color: "#1f63d6", soft: "#e6efff" },
];

function SidebarSkeleton() {
  return (
    <div className="side-panel">
      <div className="skeleton" style={{ width: 160, height: 18 }} />
      <div className="skeleton" style={{ height: 48, marginTop: 14 }} />
      <div className="skeleton" style={{ height: 48, marginTop: 8 }} />
      <div className="skeleton" style={{ height: 48, marginTop: 8 }} />
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="feed">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ev ev-skeleton">
          <div className="skeleton" style={{ width: 180, height: 18 }} />
          <div className="skeleton" style={{ width: "85%", height: 22, marginTop: 14 }} />
          <div className="skeleton" style={{ width: "100%", height: 52, marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ event_type?: string }>;
}) {
  const sp = await searchParams;
  const raw = sp.event_type;
  const eventType = (EVENT_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as EventType)
    : undefined;

  return (
    <>
      <section className="feed-hero" aria-labelledby="feed-heading">
        <div className="feed-hero-copy">
          <p className="hero-kicker"><span aria-hidden="true" /> LIVE RESEARCH SIGNALS</p>
          <h1 id="feed-heading">Know what moved<br />biopharma <i>first.</i></h1>
          <p>
            Source-linked clinical, regulatory and corporate catalysts for India-linked pharma —
            every signal traceable to its evidence.
          </p>
          <div className="hero-actions">
            <Link href="/calendar" className="btn btn-primary"><Icon name="calendar" size={15} /> Catalyst calendar</Link>
            <Link href="/companies" className="btn btn-ghost-light"><Icon name="building" size={15} /> Browse companies</Link>
          </div>
        </div>
        <Suspense fallback={<div className="hero-tiles" />}>
          <HeroStats />
        </Suspense>
      </section>

      <div className="home-grid">
        <div className="home-main">
          <div className="feed-toolbar">
            <div>
              <p className="section-kicker">LATEST INTELLIGENCE</p>
              <h2>Catalyst feed</h2>
            </div>
            <p className="feed-toolbar-note"><Icon name="shield-check" size={14} /> Every card links to its source record</p>
          </div>
          <Suspense>
            <FilterChips />
          </Suspense>
          <Suspense fallback={<FeedSkeleton />}>
            <FeedList eventType={eventType} />
          </Suspense>
        </div>

        <aside className="home-side" aria-label="Highlights">
          <Suspense fallback={<SidebarSkeleton />}>
            <UpcomingPanel />
          </Suspense>
          <Suspense fallback={<SidebarSkeleton />}>
            <MoversPanel />
          </Suspense>
          <section className="side-panel" aria-labelledby="tools-h">
            <div className="side-head">
              <span className="side-icon" style={{ background: "#eef2f6", color: "#12406b" }}>
                <Icon name="compass" size={16} />
              </span>
              <h2 id="tools-h">Research tools</h2>
            </div>
            <div className="quick-grid">
              {QUICK_LINKS.map((q) => (
                <Link key={q.href} href={q.href} className="quick-link" style={styleVars(q)}>
                  <span className="quick-icon"><Icon name={q.icon} size={16} /></span>
                  <strong>{q.label}</strong>
                  <small>{q.hint}</small>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
