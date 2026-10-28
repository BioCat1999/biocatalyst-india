import Link from "next/link";
import { search } from "@biocatalyst/data";
import { eventTypeLabel } from "@biocatalyst/types";
import { FollowButton } from "@/components/FollowButton";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar, PageHero } from "@/components/PageParts";
import { TimeAgo } from "@/components/TimeAgo";
import { trialUrl } from "@/lib/urls";
import { eventStyle, styleVars } from "@/lib/categories";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search — Biocatalyst India" };

const EXAMPLES = ["Sun Pharma", "biosimilar", "psoriasis", "Phase 3", "USFDA", "Biocon"];

function GroupHead({ id, icon, color, soft, label, count }: { id: string; icon: IconName; color: string; soft: string; label: string; count: number }) {
  return (
    <div className="result-head" id={id}>
      <span style={{ background: soft, color }}><Icon name={icon} size={15} /></span>
      <h2>{label}</h2>
      <span className="count-pill">{count}</span>
    </div>
  );
}

/** Wraps case-insensitive matches of `q` in <mark>. */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q || !text) return <>{text}</>;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${esc})`, "ig"));
  return (
    <>
      {parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i}>{p}</mark> : p))}
    </>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query ? await search(query) : null;
  const groups = results
    ? [
        { id: "companies", label: "Companies", count: results.companies.length },
        { id: "events", label: "Events", count: results.events.length },
        { id: "drugs", label: "Drugs", count: results.drugs.length },
        { id: "trials", label: "Trials", count: results.trials.length },
      ].filter((g) => g.count > 0)
    : [];
  const total = groups.reduce((n, g) => n + g.count, 0);

  return (
    <>
      <PageHero kicker="SEARCH" title={query ? <>Results for “{query}”</> : "Find anything"} accent="#6d4bd8">
        <p>Companies, tickers, drugs, trial IDs, indications and catalyst headlines.</p>
        <form action="/search" method="get" className="hero-search" role="search">
          <Icon name="search" size={17} />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Company, ticker, drug, trial ID or indication…"
            aria-label="Search"
            autoFocus={!query}
          />
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
        <div className="example-row">
          <span>Try:</span>
          {EXAMPLES.map((e) => (
            <Link key={e} href={`/search?q=${encodeURIComponent(e)}`}>{e}</Link>
          ))}
        </div>
      </PageHero>

      {results && (
        <div className="search-results">
          <div className="result-summary">
            <p>
              {total === 0 ? (
                <>No results for “{query}”. Try a company name, ticker or drug.</>
              ) : (
                <><strong>{total}</strong> result{total === 1 ? "" : "s"}</>
              )}
            </p>
            {groups.length > 1 && (
              <nav className="chips" aria-label="Jump to result type">
                {groups.map((g) => (
                  <a key={g.id} className="chip" href={`#${g.id}`}>
                    {g.label} <span className="count">{g.count}</span>
                  </a>
                ))}
              </nav>
            )}
          </div>

          {total === 0 && (
            <div className="empty-state">
              <span className="empty-icon"><Icon name="search" size={24} /></span>
              <p>Nothing matched. Browse <Link href="/companies">companies</Link> or the <Link href="/">catalyst feed</Link>.</p>
            </div>
          )}

          {results.companies.length > 0 && (
            <section aria-label="Companies">
              <GroupHead id="companies" icon="building" color="#1f63d6" soft="#e6efff" label="Companies" count={results.companies.length} />
              <div className="result-cards">
                {results.companies.map((c) => (
                  <article key={c.id} className="result-card">
                    <Avatar name={c.canonicalName} size={40} />
                    <div className="result-card-body">
                      <Link href={`/companies/${c.slug}`} className="stretched">
                        <strong><Highlight text={c.canonicalName} q={query} /></strong>
                      </Link>
                      <span>
                        {c.securities[0] && <span className="ev-ticker">{c.securities[0].ticker}<small>{c.securities[0].exchange}</small></span>}{" "}
                        {c.aliases.slice(0, 3).join(" · ")}
                      </span>
                    </div>
                    <span className="company-follow">
                      <FollowButton compact entityType="company" entityId={c.id} label={c.canonicalName} />
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}

          {results.events.length > 0 && (
            <section aria-label="Events">
              <GroupHead id="events" icon="activity" color="#007f7a" soft="#dcf8f2" label="Events" count={results.events.length} />
              <div className="result-cards">
                {results.events.map((e) => {
                  const s = eventStyle(e.eventType);
                  return (
                    <article key={e.id} className="result-card" style={styleVars(s)}>
                      <span className="ev-badge"><Icon name={s.icon} size={16} /></span>
                      <div className="result-card-body">
                        <span className="result-kind">{eventTypeLabel(e.eventType)} · <TimeAgo iso={e.occurredAt} /></span>
                        <Link href={`/events/${e.id}`} className="stretched">
                          <strong><Highlight text={e.headline} q={query} /></strong>
                        </Link>
                      </div>
                      <Icon name="arrow-right" size={15} className="result-arrow" />
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {results.drugs.length > 0 && (
            <section aria-label="Drugs">
              <GroupHead id="drugs" icon="pill" color="#6d4bd8" soft="#efeafd" label="Drugs" count={results.drugs.length} />
              <div className="result-cards">
                {results.drugs.map((d) => (
                  <article key={d.id} className="result-card" style={styleVars({ color: "#6d4bd8", soft: "#efeafd" })}>
                    <span className="ev-badge"><Icon name="pill" size={16} /></span>
                    <div className="result-card-body">
                      <Link href={`/drugs/${d.slug}`} className="stretched">
                        <strong><Highlight text={d.canonicalName} q={query} /></strong>
                      </Link>
                      <span>{d.indications.join(" · ") || "No indications listed"}</span>
                    </div>
                    <Icon name="arrow-right" size={15} className="result-arrow" />
                  </article>
                ))}
              </div>
            </section>
          )}

          {results.trials.length > 0 && (
            <section aria-label="Trials">
              <GroupHead id="trials" icon="flask" color="#1f63d6" soft="#e6efff" label="Trials" count={results.trials.length} />
              <div className="result-cards">
                {results.trials.map((t) => (
                  <article key={t.id} className="result-card" style={styleVars({ color: "#1f63d6", soft: "#e6efff" })}>
                    <span className="ev-badge"><Icon name="flask" size={16} /></span>
                    <div className="result-card-body">
                      <span className="result-kind">{t.registryTrialId} · {t.phase}</span>
                      <Link href={trialUrl(t)} className="stretched">
                        <strong><Highlight text={t.title} q={query} /></strong>
                      </Link>
                    </div>
                    <Icon name="arrow-right" size={15} className="result-arrow" />
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
