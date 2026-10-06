import Link from "next/link";
import {
  getCompanyById,
  getDrugById,
  getUpcomingTrials,
} from "@biocatalyst/data";
import { trialUrl } from "@/lib/urls";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export default async function CalendarPage() {
  const trials = await getUpcomingTrials(100);

  const sponsorOpts = await Promise.all(
    trials.map((t) => (t.sponsorCompanyId ? getCompanyById(t.sponsorCompanyId) : undefined)),
  );
  const drugOpts = await Promise.all(
    trials.map((t) => Promise.all(t.drugIds.map((id) => getDrugById(id)))),
  );

  const byMonth = new Map<string, number[]>();
  trials.forEach((t, i) => {
    if (!t.primaryCompletionDate) return;
    const key = monthKey(t.primaryCompletionDate);
    byMonth.set(key, [...(byMonth.get(key) ?? []), i]);
  });
  const months = [...byMonth.keys()].sort();

  // Trials to watch: Phase 3 (or 2/3) readouts first, then nearest dates.
  // These are the readouts most likely to move sponsors' stocks.
  const phaseRank = (p?: string) =>
    p === "Phase 3" || p === "Phase 2/3" ? 0 : p === "Phase 2" ? 1 : 2;
  const toWatch = trials
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.primaryCompletionDate)
    .sort(
      (a, b) =>
        phaseRank(a.t.phase) - phaseRank(b.t.phase) ||
        (a.t.primaryCompletionDate! < b.t.primaryCompletionDate! ? -1 : 1),
    )
    .slice(0, 5);

  return (
    <>
      <div className="page-head">
        <h1>Catalyst calendar</h1>
        <p>
          Upcoming trial readouts — primary completion dates for tracked
          trials, soonest first. Dates are sponsor guidance, not guarantees.
        </p>
      </div>

      {trials.length === 0 && (
        <div className="empty">
          <p>No upcoming trial completions on the calendar.</p>
        </div>
      )}

      <div style={{ paddingBottom: 48 }}>
        {toWatch.length > 0 && (
          <section aria-label="Trials to watch" style={{ marginBottom: 28 }}>
            <h2>Trials to watch</h2>
            <p className="muted" style={{ marginTop: -8 }}>
              Late-stage readouts nearest in time — the results most likely to
              move their sponsors. Follow a company to get alerted when results
              land.
            </p>
            {toWatch.map(({ t, i }) => {
              const sponsor = sponsorOpts[i];
              const drugs = (drugOpts[i] ?? []).filter((d) => d !== undefined);
              return (
                <div key={t.id} className="result-row">
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <strong style={{ color: "var(--teal)" }}>
                      {t.primaryCompletionDate ? formatDate(t.primaryCompletionDate) : "—"}
                    </strong>
                    <Link href={trialUrl(t)} style={{ color: "inherit" }}>
                      <strong>{t.registryTrialId}</strong>
                    </Link>
                    {t.phase && <span className="tag neutral">{t.phase}</span>}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                    {sponsor && (
                      <>
                        <Link href={`/companies/${sponsor.slug}`}>{sponsor.canonicalName}</Link>
                        {" · "}
                      </>
                    )}
                    {drugs.map((d, di) => (
                      <span key={d!.id}>
                        {di > 0 && " · "}
                        <Link href={`/drugs/${d!.slug}`}>{d!.canonicalName}</Link>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
        {months.map((m) => (
          <section key={m} aria-label={monthLabel(m)} style={{ marginBottom: 28 }}>
            <h2>{monthLabel(m)}</h2>
            {(byMonth.get(m) ?? []).map((i) => {
              const t = trials[i];
              const sponsor = sponsorOpts[i];
              const drugs = (drugOpts[i] ?? []).filter((d) => d !== undefined);
              return (
                <div key={t.id} className="result-row">
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <strong style={{ color: "var(--teal)" }}>
                      {t.primaryCompletionDate ? formatDate(t.primaryCompletionDate) : "—"}
                    </strong>
                    <Link href={trialUrl(t)} style={{ color: "inherit" }}>
                      <strong>{t.registryTrialId}</strong>
                    </Link>
                    {t.phase && <span className="tag neutral">{t.phase}</span>}
                    <span className="tag neutral">{t.status}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                    {sponsor && (
                      <>
                        <Link href={`/companies/${sponsor.slug}`}>{sponsor.canonicalName}</Link>
                        {" · "}
                      </>
                    )}
                    {drugs.map((d, di) => (
                      <span key={d!.id}>
                        {di > 0 && " · "}
                        <Link href={`/drugs/${d!.slug}`}>{d!.canonicalName}</Link>
                      </span>
                    ))}
                    {t.indications.length > 0 && <> · {t.indications.join(", ")}</>}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </>
  );
}
