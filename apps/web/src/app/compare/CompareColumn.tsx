import Link from "next/link";
import {
  getCompany,
  getDrugsForCompany,
  getEventsForCompany,
  getRecentReactionsForCompany,
  getTrialsForCompany,
} from "@biocatalyst/data";
import { formatDate, formatPct } from "@/lib/format";

/**
 * One side of the company-compare view: overview, pipeline, recent events,
 * and recent market moves.
 */
export default async function CompareColumn({ slug }: { slug: string }) {
  const company = await getCompany(slug);
  if (!company) {
    return (
      <div className="card">
        <p>Unknown company: {slug}</p>
      </div>
    );
  }

  const [drugs, trials, events, reactions] = await Promise.all([
    getDrugsForCompany(company.id),
    getTrialsForCompany(company.id),
    getEventsForCompany(company.id),
    getRecentReactionsForCompany(company.id, 5),
  ]);

  const phaseCounts = new Map<string, number>();
  for (const t of trials) {
    phaseCounts.set(t.phase, (phaseCounts.get(t.phase) ?? 0) + 1);
  }

  const tickers = company.securities
    .map((s) => `${s.exchange}:${s.ticker}`)
    .join(" · ");

  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>
        <Link href={`/companies/${company.slug}`}>{company.canonicalName}</Link>
      </h2>
      {tickers && (
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px" }}>{tickers}</p>
      )}
      <p style={{ fontSize: 14, color: "var(--muted)" }}>
        {company.description.length > 220
          ? `${company.description.slice(0, 220)}…`
          : company.description}
      </p>

      <h3>Pipeline</h3>
      <p style={{ fontSize: 14 }}>
        <strong>{drugs.length}</strong> tracked drugs ·{" "}
        <strong>{trials.length}</strong> trials
        {phaseCounts.size > 0 && (
          <>
            {" ("}
            {[...phaseCounts.entries()]
              .map(([phase, n]) => `${n}× ${phase}`)
              .join(", ")}
            {")"}
          </>
        )}
      </p>
      {drugs.length > 0 && (
        <ul style={{ fontSize: 14, paddingLeft: 18, margin: "8px 0" }}>
          {drugs.slice(0, 8).map((d) => (
            <li key={d.id}>
              <Link href={`/drugs/${d.slug}`}>{d.canonicalName}</Link>
              {d.modality && (
                <span style={{ color: "var(--muted)" }}> — {d.modality}</span>
              )}
            </li>
          ))}
          {drugs.length > 8 && (
            <li style={{ color: "var(--muted)" }}>
              +{drugs.length - 8} more on the{" "}
              <Link href={`/companies/${company.slug}`}>company page</Link>
            </li>
          )}
        </ul>
      )}

      <h3>Recent events</h3>
      {events.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--muted)" }}>No tracked events.</p>
      ) : (
        <ul style={{ fontSize: 14, paddingLeft: 18, margin: "8px 0" }}>
          {events.slice(0, 5).map((e) => (
            <li key={e.id} style={{ marginBottom: 6 }}>
              <Link href={`/events/${e.id}`}>{e.headline}</Link>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                {e.occurredAt ? formatDate(e.occurredAt) : ""} ·{" "}
                {e.eventType.replaceAll("_", " ")}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3>Market moves</h3>
      {reactions.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--muted)" }}>
          No computed reactions yet.
        </p>
      ) : (
        <ul style={{ fontSize: 14, margin: "8px 0", listStyle: "none", paddingLeft: 0 }}>
          {reactions.map((r) => (
            <li key={`${r.eventId}-${r.ticker}`} style={{ marginBottom: 8 }}>
              <span
                style={{
                  fontWeight: 700,
                  color: r.pctChange >= 0 ? "var(--green)" : "var(--red)",
                }}
              >
                {formatPct(r.pctChange)}
              </span>{" "}
              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                {r.ticker}
                {r.occurredAt ? ` · ${formatDate(r.occurredAt)}` : ""}
              </span>
              <div style={{ fontSize: 13 }}>
                <Link href={`/events/${r.eventId}`}>{r.headline}</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
