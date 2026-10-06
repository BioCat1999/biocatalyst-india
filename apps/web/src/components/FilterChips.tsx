"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { EVENT_TYPES, eventTypeLabel } from "@biocatalyst/types";
import type { EventType } from "@biocatalyst/types";

export function FilterChips() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("event_type") as EventType | null;

  const set = (t: EventType | null) => {
    const next = new URLSearchParams(params.toString());
    if (t) next.set("event_type", t);
    else next.delete("event_type");
    const qs = next.toString();
    router.push(qs ? `/?${qs}` : "/");
  };

  return (
    <div className="chips" role="group" aria-label="Filter by event type">
      <button
        type="button"
        className="chip"
        aria-pressed={!active}
        onClick={() => set(null)}
      >
        All
      </button>
      {EVENT_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          className="chip"
          aria-pressed={active === t}
          onClick={() => set(active === t ? null : t)}
        >
          {eventTypeLabel(t)}
        </button>
      ))}
    </div>
  );
}
