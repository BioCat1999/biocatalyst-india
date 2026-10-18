import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listGlobalCompanies } from "@biocatalyst/data";
import { FollowButton } from "@/components/FollowButton";

export const dynamic = "force-dynamic";

// The catalog changes during ingestion, not per visit. Cache the single-query
// result without forcing Next to contact Postgres while building the app.
const getCachedGlobalCompanies = unstable_cache(
  listGlobalCompanies,
  ["global-company-directory"],
  { revalidate: 300 },
);

/**
 * Global section: non-Indian pharma majors tracked for their India impact —
 * FDA approvals, trial readouts, patent expiries and partnerships that move
 * Indian pharma as competitors, licensors, or customers of Indian
 * manufacturers. Quotes are on each company page (delayed Yahoo Finance).
 */
export default async function GlobalPage() {
  const companies = await getCachedGlobalCompanies();

  return (
    <>
      <div className="page-head">
        <h1>Global pharma</h1>
        <p>
          {companies.length} non-Indian pharma majors tracked for their India
          impact. Their FDA approvals, recalls, patent expiries and deals show
          up in the feed and link to the Indian companies they affect.
        </p>
      </div>

      <div style={{ paddingBottom: 48 }}>
        {companies.length === 0 && (
          <div className="empty">
            <p>No global companies tracked yet.</p>
          </div>
        )}
        {companies.map((c) => {
          const sec = c.securities[0];
          return (
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
                <span className="tag neutral">{c.country}</span>{" "}
                {sec && (
                  <span className="tag ticker">
                    {sec.ticker} · {sec.exchange}
                  </span>
                )}
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                  {c.description}
                </div>
              </Link>
              <FollowButton
                compact
                entityType="company"
                entityId={c.id}
                label={c.canonicalName}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
