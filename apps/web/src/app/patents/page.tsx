import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getUpcomingPatentExpiries, getPatentStats } from "@biocatalyst/data";
import { Icon } from "@/components/Icon";
import { HeroTile, PageHero } from "@/components/PageParts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Patent cliff tracker — Biocatalyst India" };

const getCachedPatentExpiries = unstable_cache(
  // The whole window (not just the soonest rows) so the urgency counts are
  // true for the selected period; rendering is capped below.
  (withinDays: number) => getUpcomingPatentExpiries(undefined, { withinDays, limit: 5000 }),
  ["patent-expiries-v2"],
  { revalidate: 3600 },
);
const getCachedPatentStats = unstable_cache(getPatentStats, ["patent-stats"], {
  revalidate: 3600,
});

const WINDOWS = [90, 180, 365, 730];
const SHOW_FIRST = 150;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function when(d: number | null): string {
  if (d === null) return "—";
  if (d <= 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d < 60) return `In ${d} days`;
  if (d < 365) return `In ${Math.round(d / 30)} months`;
  return `In ${(d / 365).toFixed(1)} years`;
}

function urgency(d: number | null): "hot" | "warm" | "mild" | "cool" {
  if (d === null) return "cool";
  if (d <= 30) return "hot";
  if (d <= 90) return "warm";
  if (d <= 180) return "mild";
  return "cool";
}

/**
 * Patent cliff tracker: Orange Book patents expiring soonest first. Every
 * listed patent is a future generic-entry opportunity. Rows for the same
 * product expiring on the same day are merged so the list reads as products,
 * not as patent numbers. Monthly FDA snapshot; biologics have no Orange Book
 * equivalent (their patents stay private).
 */
export default async function PatentsPage({
  searchParams,
}: {
  searchParams: Promise<{ within?: string; all?: string }>;
}) {
  const { within, all } = await searchParams;
  const showAll = all === "1";
  const withinDays = Math.min(Math.max(parseInt(within ?? "365", 10) || 365, 30), 1825);
  const [items, stats] = await Promise.all([
    getCachedPatentExpiries(withinDays),
    getCachedPatentStats(),
  ]);

  // Merge patents that expire together for the same product + applicant.
  type Row = (typeof items)[number] & { key: string; numbers: string[]; substance: boolean; product: boolean };
  const merged = new Map<string, Row>();
  for (const p of items) {
    const key = `${p.expiryDate}|${p.tradeName}|${p.companySlug ?? p.applicant}`;
    const hit = merged.get(key);
    if (hit) {
      if (!hit.numbers.includes(p.patentNumber)) hit.numbers.push(p.patentNumber);
      hit.substance ||= !!p.drugSubstanceFlag;
      hit.product ||= !!p.drugProductFlag;
    } else {
      merged.set(key, { ...p, key, numbers: [p.patentNumber], substance: !!p.drugSubstanceFlag, product: !!p.drugProductFlag });
    }
  }
  const rows = [...merged.values()];
  const shown = showAll ? rows : rows.slice(0, SHOW_FIRST);
  const byMonth = new Map<string, Row[]>();
  for (const r of shown) {
    const k = (r.expiryDate ?? "").slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
  }
  const buckets = {
    hot: rows.filter((r) => urgency(r.daysToExpiry) === "hot").length,
    warm: rows.filter((r) => urgency(r.daysToExpiry) === "warm").length,
    mild: rows.filter((r) => urgency(r.daysToExpiry) === "mild").length,
    cool: rows.filter((r) => urgency(r.daysToExpiry) === "cool").length,
  };
  const maxBucket = Math.max(1, ...Object.values(buckets));

  return (
    <>
      <PageHero
        kicker="PATENT CLIFF TRACKER"
        title="Who loses exclusivity next"
        accent="#6d4bd8"
        aside={
          <div className="hero-tiles">
            <HeroTile icon="key" value={stats.total.toLocaleString("en-IN")} label="US patents listed" color="#c4b5fd" />
            <HeroTile icon="clock" value={stats.expiringWithinYear.toLocaleString("en-IN")} label="Expire within a year" color="#fcd34d" />
            <HeroTile icon="building" value={stats.resolvedCompanies} label="Tracked holders" color="#7eeede" />
            <HeroTile icon="pill" value={rows.length} label={`Products in ${withinDays}d`} color="#8fb6ff" />
          </div>
        }
      >
        <p>
          Orange Book patents listed against approved drugs — each expiry is a potential generic-entry
          opportunity for Indian manufacturers. Source: FDA Orange Book, monthly snapshot.
        </p>
        <div className="segmented" role="group" aria-label="Time window">
          {WINDOWS.map((d) => (
            <Link key={d} href={`/patents?within=${d}`} aria-pressed={d === withinDays} className="seg-link">
              {d < 365 ? `${d} days` : d === 365 ? "1 year" : "2 years"}
            </Link>
          ))}
        </div>
      </PageHero>

      {rows.length > 0 && (
        <div className="urgency-bar" aria-label="Expiries by urgency">
          {([
            ["hot", "Within 30 days"],
            ["warm", "31–90 days"],
            ["mild", "3–6 months"],
            ["cool", "Later"],
          ] as const).map(([k, label]) => (
            <div key={k} className={`urgency-cell u-${k}`}>
              <strong>{buckets[k]}</strong>
              <span>{label}</span>
              <i style={{ width: `${(buckets[k] / maxBucket) * 100}%` }} />
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon"><Icon name="key" size={24} /></span>
          <p>No patent expiries in this window.</p>
        </div>
      ) : (
        <div className="patent-list">
          {[...byMonth.entries()].map(([month, list]) => {
            const [y, m] = month.split("-").map(Number);
            return (
              <section key={month} aria-label={`${MONTHS[m - 1]} ${y}`}>
                <div className="agenda-day">
                  <h3>{MONTHS[m - 1]} {y}</h3>
                  <hr />
                  <span>{list.length} product{list.length === 1 ? "" : "s"}</span>
                </div>
                {list.map((p) => {
                  const u = urgency(p.daysToExpiry);
                  const dd = p.expiryDate ? Number(p.expiryDate.slice(8, 10)) : null;
                  return (
                    <article key={p.key} className={`patent-row u-${u}`}>
                      <div className="patent-date">
                        <small>{MON[m - 1]}</small>
                        <strong>{dd}</strong>
                      </div>
                      <div className="patent-body">
                        <div className="patent-top">
                          <h4>{p.tradeName}</h4>
                          {p.substance && <span className="flag">Substance</span>}
                          {p.product && <span className="flag">Product</span>}
                        </div>
                        <p>{p.activeIngredient}</p>
                        <div className="patent-meta">
                          <span>
                            <Icon name="building" size={12} />{" "}
                            {p.companySlug ? <Link href={`/companies/${p.companySlug}`}>{p.companyName}</Link> : p.applicant}
                          </span>
                          <span title={p.numbers.map((n) => `US ${n}`).join(", ")}>
                            <Icon name="key" size={12} /> {p.numbers.length === 1 ? `US ${p.numbers[0]}` : `${p.numbers.length} patents`}
                          </span>
                        </div>
                      </div>
                      <span className="patent-when">{when(p.daysToExpiry)}</span>
                    </article>
                  );
                })}
              </section>
            );
          })}
          {shown.length < rows.length && (
            <div className="show-more">
              <p className="muted">Showing the soonest {shown.length} of {rows.length} products in this window.</p>
              <Link className="btn" href={`/patents?within=${withinDays}&all=1`}>
                Show all {rows.length} <Icon name="chevron-down" size={14} />
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
