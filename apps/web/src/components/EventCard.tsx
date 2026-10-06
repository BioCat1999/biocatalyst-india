import type { EventCard as EventCardT } from "@biocatalyst/types";
import Link from "next/link";
import { EventTypeTag } from "./EventTypeTag";
import { FollowButton } from "./FollowButton";
import { formatDateTime, formatPct, mrClass } from "@/lib/format";

export function EventCard({ event }: { event: EventCardT }) {
  const mr = event.marketReaction;
  return (
    <div style={{ position: "relative" }}>
      <Link className="card" href={`/events/${event.id}`}>
        <div className="card-top" style={event.company ? { paddingRight: 44 } : undefined}>
          <EventTypeTag type={event.eventType} />
          {event.company && (
            <span className="tag ticker">
              {event.company.ticker} · {event.company.exchange}
            </span>
          )}
          {event.drug && <span className="tag neutral">{event.drug.name}</span>}
          {event.indication && <span className="tag neutral">{event.indication}</span>}
        </div>
        <h2>{event.headline}</h2>
        <p className="fact">{event.fact}</p>
        <p className="summary">{event.summary}</p>
        <div className="meta">
          <span>{formatDateTime(event.occurredAt)}</span>
          <span>{event.sources.length} source{event.sources.length === 1 ? "" : "s"}</span>
          <span>Confidence {(event.confidence * 100).toFixed(0)}%</span>
          {mr && mr.pctChange != null && (
            <span className={`mr-inline ${mrClass(mr.pctChange)}`}>
              {mr.securityTicker} {formatPct(mr.pctChange)}
            </span>
          )}
        </div>
      </Link>
      {event.company && (
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <FollowButton
            compact
            entityType="company"
            entityId={event.company.id}
            label={event.company.name}
          />
        </div>
      )}
    </div>
  );
}
