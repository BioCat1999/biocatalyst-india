import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listIpoPipeline, type IpoStatus } from "@biocatalyst/data";
import { EventTypeTag } from "@/components/EventTypeTag";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const getCachedIpoPipeline = unstable_cache(listIpoPipeline, ["ipo-pipeline"], {
  revalidate: 300,
});

const STATUS_LABEL: Record<IpoStatus, string> = {
  in_pipeline: "In pipeline",
  listed: "Listed",
  watchlist: "Watchlist",
};

const STATUS_CLASS: Record<IpoStatus, string> = {
  in_pipeline: "tag ticker",
  listed: "tag neutral",
  watchlist: "tag neutral",
};

/**
 * IPO tracker: Indian pharma companies in the IPO pipeline or recently
 * listed. Status starts from a curated catalog (milestones that predate
 * ingestion, e.g. Injecto's 21 Sep 2026 listing) and detected news events
 * can only advance it. This is a research tracker, not investment advice.
 */
export default async function IposPage() {
  const entries = await getCachedIpoPipeline();

  return (
    <>
      <div className="page-head">
        <h1>Pharma IPOs</h1>
        <p>
          Indian pharma companies heading for the public markets, plus recent
          listings. Filing and listing milestones are detected from news flow;
          curated dates below are as reported at the time of the filing or
          listing.
        </p>
      </div>

      <div style={{ paddingBottom: 48 }}>
        {entries.length === 0 && (
          <div className="empty">
            <p>No IPO candidates tracked yet.</p>
          </div>
        )}
        {entries.map(({ company, status, milestone, latestEvent }) => (
          <div key={company.id} className="result-row">
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
            >
              <Link href={`/companies/${company.slug}`}>
                <strong>{company.canonicalName}</strong>
              </Link>
              <span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              {company.description}
            </div>
            {(milestone.drhpDate || milestone.listingDate || milestone.note) && (
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
                {milestone.drhpDate && <>DRHP filed: {milestone.drhpDate}. </>}
                {milestone.listingDate && <>Listed: {milestone.listingDate}. </>}
                {milestone.note && <>{milestone.note}</>}
              </div>
            )}
            {latestEvent ? (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                <EventTypeTag type={latestEvent.eventType} />{" "}
                <Link href={`/events/${latestEvent.id}`}>{latestEvent.headline}</Link>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>
                  {formatDateTime(latestEvent.occurredAt)}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
                No IPO news detected yet.
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
