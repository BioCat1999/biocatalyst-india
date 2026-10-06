import Link from "next/link";
import { getUpcomingPatentExpiries, getPatentStats } from "@biocatalyst/data";

export const dynamic = "force-dynamic";

function formatDays(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
}

/**
 * Patent cliff tracker: Orange Book patents expiring soonest first.
 * Every listed patent is a future generic-entry opportunity — the
 * highest-signal catalyst calendar in pharma. Monthly FDA snapshot;
 * biologics have no Orange Book equivalent (their patents stay private).
 */
export default async function PatentsPage({
  searchParams,
}: {
  searchParams: Promise<{ within?: string }>;
}) {
  const { within } = await searchParams;
  const withinDays = Math.min(Math.max(parseInt(within ?? "365", 10) || 365, 30), 1825);
  const [items, stats] = await Promise.all([
    getUpcomingPatentExpiries(undefined, { withinDays, limit: 300 }),
    getPatentStats(),
  ]);

  return (
    <>
      <div className="page-head">
        <h1>Patent cliff tracker</h1>
        <p>
          {stats.total.toLocaleString("en-IN")} US patents listed against
          approved drugs · {stats.expiringWithinYear.toLocaleString("en-IN")}{" "}
          expiring within a year · {stats.resolvedCompanies} tracked companies
          hold listed patents. Source: FDA Orange Book, monthly snapshot.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Window:{" "}
          {[90, 180, 365, 730].map((d) => (
            <span key={d} style={{ marginRight: 10 }}>
              {d === withinDays ? (
                <strong>{d} days</strong>
              ) : (
                <Link href={`/patents?within=${d}`}>{d} days</Link>
              )}
            </span>
          ))}
        </p>
      </div>

      <div style={{ paddingBottom: 48 }}>
        {items.length === 0 && (
          <div className="empty">
            <p>No patent expiries in this window.</p>
          </div>
        )}
        {items.map((p) => (
          <div key={`${p.patentNumber}-${p.applNo}-${p.productNo}`} className="result-row">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: "var(--teal)" }}>{formatDays(p.daysToExpiry)}</strong>
              <span>
                US <strong>{p.patentNumber}</strong>
              </span>
              <span className="tag neutral">{p.tradeName}</span>
              {p.drugSubstanceFlag && <span className="tag ticker">substance</span>}
              {p.drugProductFlag && <span className="tag ticker">product</span>}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              {p.activeIngredient}
              {" · expires "}
              {p.expiryDate}
              {" · "}
              {p.companySlug ? (
                <Link href={`/companies/${p.companySlug}`}>{p.companyName}</Link>
              ) : (
                p.applicant
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
