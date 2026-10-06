import Link from "next/link";
import { search } from "@biocatalyst/data";
import { SearchHeroSuspense } from "@/components/SearchHero";
import { EventTypeTag } from "@/components/EventTypeTag";
import { FollowButton } from "@/components/FollowButton";
import { formatDateTime } from "@/lib/format";
import { trialUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query ? await search(query) : null;
  const total =
    (results?.companies.length ?? 0) +
    (results?.drugs.length ?? 0) +
    (results?.trials.length ?? 0) +
    (results?.events.length ?? 0);

  return (
    <>
      <div className="search-hero">
        <h1 style={{ color: "var(--navy)" }}>Search</h1>
        <SearchHeroSuspense />
      </div>

      {results && (
        <div style={{ paddingBottom: 48 }}>
          <p style={{ color: "var(--muted)" }}>
            {total === 0
              ? `No results for “${query}”.`
              : `${total} result${total === 1 ? "" : "s"} for “${query}”.`}
          </p>

          {results.companies.length > 0 && (
            <section className="result-group" aria-label="Companies">
              <h2>Companies</h2>
              {results.companies.map((c) => (
                <div
                  key={c.id}
                  className="result-row"
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <Link
                    href={`/companies/${c.slug}`}
                    style={{ flex: 1, minWidth: 0, color: "inherit" }}
                  >
                    <strong>{c.canonicalName}</strong>{" "}
                    <span className="tag ticker">{c.securities[0]?.ticker}</span>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      {c.aliases.join(" · ")}
                    </div>
                  </Link>
                  <FollowButton
                    compact
                    entityType="company"
                    entityId={c.id}
                    label={c.canonicalName}
                  />
                </div>
              ))}
            </section>
          )}

          {results.drugs.length > 0 && (
            <section className="result-group" aria-label="Drugs">
              <h2>Drugs</h2>
              {results.drugs.map((d) => (
                <Link key={d.id} className="result-row" href={`/drugs/${d.slug}`}>
                  <strong>{d.canonicalName}</strong>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    {d.indications.join(" · ")}
                  </div>
                </Link>
              ))}
            </section>
          )}

          {results.trials.length > 0 && (
            <section className="result-group" aria-label="Trials">
              <h2>Trials</h2>
              {results.trials.map((t) => (
                <Link
                  key={t.id}
                  className="result-row"
                  href={trialUrl(t)}
                >
                  <strong>{t.registryTrialId}</strong>{" "}
                  <span className="tag neutral">{t.phase}</span>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.title}</div>
                </Link>
              ))}
            </section>
          )}

          {results.events.length > 0 && (
            <section className="result-group" aria-label="Events">
              <h2>Events</h2>
              {results.events.map((e) => (
                <Link key={e.id} className="result-row" href={`/events/${e.id}`}>
                  <EventTypeTag type={e.eventType} /> <strong>{e.headline}</strong>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    {formatDateTime(e.occurredAt)}
                  </div>
                </Link>
              ))}
            </section>
          )}
        </div>
      )}
    </>
  );
}
