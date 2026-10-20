"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EVENT_TYPES, eventTypeLabel } from "@biocatalyst/types";
import type { EventType } from "@biocatalyst/types";

export function FilterChips() {
  const params = useSearchParams();
  const active = params.get("event_type") as EventType | null;

  return (
    <div className="chips" role="group" aria-label="Filter by event type">
      <Link
        href="/"
        prefetch
        className="chip"
        aria-pressed={!active}
      >
        All
      </Link>
      {EVENT_TYPES.map((t) => (
        <Link
          key={t}
          href={active === t ? "/" : `/?event_type=${encodeURIComponent(t)}`}
          prefetch
          className="chip"
          aria-pressed={active === t}
        >
          {eventTypeLabel(t)}
        </Link>
      ))}
    </div>
  );
}
