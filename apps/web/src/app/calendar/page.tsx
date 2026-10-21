import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getCatalystCalendar } from "@biocatalyst/data";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const getCachedCalendar = unstable_cache(
  () => getCatalystCalendar({ limit: 250 }),
  ["unified-catalyst-calendar"],
  { revalidate: 300 },
);

const KIND_LABELS: Record<string, string> = {
  trial_completion: "Trial completion",
  patent_expiry: "Patent expiry",
  pdufa: "PDUFA",
  advisory_committee: "Advisory committee",
  regulatory_decision: "Regulatory decision",
  trial_readout: "Trial readout",
  conference: "Conference",
  earnings: "Earnings",
  ipo: "IPO",
  other: "Milestone",
};

function monthLabel(iso: string): string {
  const [year, month] = iso.slice(0, 7).split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export default async function CalendarPage() {
  const items = await getCachedCalendar();
  const months = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), item]);
  }

  return (
    <>
      <div className="page-head">
        <h1>Catalyst calendar</h1>
        <p>
          One forward calendar for trial completions, PDUFA and regulatory dates,
          patent expiries and other disclosed catalysts. Estimated dates are labelled.
        </p>
      </div>

      {items.length === 0 && <div className="empty"><p>No upcoming catalysts found.</p></div>}

      <div style={{ paddingBottom: 48 }}>
        {[...months.entries()].map(([month, monthItems]) => (
          <section key={month} aria-label={monthLabel(month)} style={{ marginBottom: 28 }}>
            <h2>{monthLabel(month)}</h2>
            {monthItems.map((item) => (
              <article key={item.id} className="result-row">
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                  <strong style={{ color: "var(--teal)" }}>{formatDate(item.date)}</strong>
                  <span className="tag neutral">{KIND_LABELS[item.kind] ?? item.kind.replaceAll("_", " ")}</span>
                  <span className="tag neutral">{item.status}</span>
                  {item.country && <span className="tag neutral">{item.country}</span>}
                </div>
                <h3 style={{ fontSize: 15, margin: "8px 0 4px" }}>{item.title}</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>{item.detail}</p>
                <div style={{ display: "flex", gap: 12, marginTop: 7, fontSize: 13 }}>
                  {item.company && <Link href={`/companies/${item.company.slug}`}>{item.company.canonicalName}</Link>}
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
