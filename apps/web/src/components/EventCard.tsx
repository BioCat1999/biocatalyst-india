/**
 * Catalyst feed card. Each event type has its own color and icon
 * (lib/categories, shared with the mobile app) so readers can scan by kind.
 * The fact/summary pair is deduped because ingested events often repeat the
 * fact as the summary's opening sentence.
 *
 * The whole card is clickable (stretched headline link) while the follow
 * button and source count stay independently interactive.
 */
import type { EventCard as EventCardT } from "@biocatalyst/types";
import Link from "next/link";
import { eventTypeLabel } from "@biocatalyst/types";
import { FollowButton } from "./FollowButton";
import { Icon } from "./Icon";
import { TimeAgo } from "./TimeAgo";
import { formatPct, mrClass } from "@/lib/format";
import { eventStyle, styleVars } from "@/lib/categories";
import { dedupeEventText } from "@/lib/text";

export function EventCard({ event }: { event: EventCardT }) {
  const cat = eventStyle(event.eventType);
  const { fact, summary } = dedupeEventText(event.fact ?? "", event.summary ?? "");
  const mr = event.marketReaction;
  const pct = mr?.pctChange ?? null;
  const hasPrimary = event.sources.some((s) => s.isPrimary);
  const meta = [event.company?.name, event.drug?.name, event.indication, event.trial?.phase].filter(Boolean);

  return (
    <article className="ev" style={styleVars(cat)}>
      <header className="ev-head">
        <span className="ev-badge">
          <Icon name={cat.icon} size={16} />
        </span>
        <span className="ev-type">{eventTypeLabel(event.eventType)}</span>
        <span className="ev-time">
          <Icon name="clock" size={13} />
          <TimeAgo iso={event.occurredAt} />
        </span>
      </header>

      <h2 className="ev-title">
        <Link href={`/events/${event.id}`} className="ev-link">
          {event.headline}
        </Link>
      </h2>

      {(event.company?.ticker || meta.length > 0) && (
        <div className="ev-meta">
          {event.company?.ticker && (
            <span className="ev-ticker">
              {event.company.ticker}
              <small>{event.company.exchange}</small>
            </span>
          )}
          <span className="ev-meta-text">{meta.join(" · ")}</span>
        </div>
      )}

      {fact && <p className="ev-fact">{fact}</p>}
      {summary && <p className="ev-summary">{summary}</p>}

      {event.catalystSummary && (
        <p className="ev-why">
          <span className="ev-why-icon"><Icon name="zap" size={13} /></span>
          <span><strong>Why it matters:</strong> {event.catalystSummary}</span>
        </p>
      )}

      <footer className="ev-foot">
        <span className={`ev-chip ${hasPrimary ? "ev-chip-ok" : ""}`}>
          <Icon name={hasPrimary ? "shield-check" : "file-text"} size={13} />
          {event.sources.length} source{event.sources.length === 1 ? "" : "s"}
          {hasPrimary ? " · primary" : ""}
        </span>
        <span className="ev-chip" title="Extraction confidence">
          <Icon name="target" size={13} />
          {(event.confidence * 100).toFixed(0)}%
        </span>
        {pct != null && mr && (
          <span className={`ev-move ${mrClass(pct)}`} title={mr.windowDefinition}>
            <Icon name={pct > 0 ? "caret-up" : pct < 0 ? "caret-down" : "arrow-right"} size={13} strokeWidth={3} />
            {mr.securityTicker} {formatPct(pct)}
          </span>
        )}
        <span className="ev-actions">
          {event.company && (
            <FollowButton compact entityType="company" entityId={event.company.id} label={event.company.name} />
          )}
          <span className="ev-read" aria-hidden="true">
            Read <Icon name="arrow-right" size={14} />
          </span>
        </span>
      </footer>
    </article>
  );
}
