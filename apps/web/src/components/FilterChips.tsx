"use client";
/**
 * Feed filters: the most-read event types as colored chips, the long tail
 * behind a "More types" toggle so the row stays scannable.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { EVENT_TYPES, eventTypeLabel } from "@biocatalyst/types";
import type { EventType } from "@biocatalyst/types";
import { eventStyle, styleVars } from "@/lib/categories";
import { Icon } from "./Icon";

const PRIMARY: Array<{ type: EventType; label: string }> = [
  { type: "regulatory_approval", label: "Approvals" },
  { type: "clinical_trial_result", label: "Trial results" },
  { type: "primary_endpoint_met", label: "Endpoint met" },
  { type: "licensing_or_partnership", label: "Deals" },
  { type: "regulatory_submission", label: "Submissions" },
  { type: "safety_signal", label: "Safety" },
];

function hrefFor(type: EventType | null, active: EventType | null) {
  return !type || active === type ? "/" : `/?event_type=${encodeURIComponent(type)}`;
}

export function FilterChips() {
  const params = useSearchParams();
  const active = params.get("event_type") as EventType | null;
  const primaryTypes = new Set(PRIMARY.map((p) => p.type));
  const rest = EVENT_TYPES.filter((t) => !primaryTypes.has(t));
  const [showMore, setShowMore] = useState(() => !!active && !primaryTypes.has(active));

  return (
    <div className="filters" role="group" aria-label="Filter by event type">
      <div className="chips">
        <Link href="/" prefetch className="chip" aria-pressed={!active} scroll={false}>
          <Icon name="grid" size={14} /> All
        </Link>
        {PRIMARY.map(({ type, label }) => {
          const s = eventStyle(type);
          return (
            <Link
              key={type}
              href={hrefFor(type, active)}
              prefetch
              scroll={false}
              className="chip chip-cat"
              style={styleVars(s)}
              aria-pressed={active === type}
            >
              <Icon name={s.icon} size={14} /> {label}
            </Link>
          );
        })}
        <button
          type="button"
          className="chip chip-more"
          aria-expanded={showMore}
          onClick={() => setShowMore((v) => !v)}
        >
          More types <Icon name="chevron-down" size={13} style={{ transform: showMore ? "rotate(180deg)" : undefined }} />
        </button>
      </div>
      {showMore && (
        <div className="chips chips-more">
          {rest.map((type) => {
            const s = eventStyle(type);
            return (
              <Link
                key={type}
                href={hrefFor(type, active)}
                scroll={false}
                className="chip chip-cat chip-sm"
                style={styleVars(s)}
                aria-pressed={active === type}
              >
                <Icon name={s.icon} size={13} /> {eventTypeLabel(type)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
