import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { listEvents, toEventCards, EVENT_TYPES } from "@biocatalyst/data";
import type { EventType } from "@biocatalyst/types";
import { EventCard } from "@/components/EventCard";
import { FilterChips } from "@/components/FilterChips";

export const revalidate = 3600;

const getCachedFeed = unstable_cache(
  async (eventType?: EventType) => {
    const page = await listEvents(eventType ? { eventType } : {}, undefined, 30);
    return { ...page, cards: await toEventCards(page.items) };
  },
  ["feed-first-page"],
  { revalidate: 300 },
);

async function FeedList({ eventType }: { eventType?: EventType }) {
  const { items, nextCursor, cards } = await getCachedFeed(eventType);
  if (items.length === 0) {
    return (
      <div className="empty">
        <p>No catalyst events match this filter yet.</p>
      </div>
    );
  }
  return (
    <div className="feed">
      {cards.map((card) => (
        <EventCard key={card.id} event={card} />
      ))}
      {nextCursor && (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Showing the {items.length} most recent events — cursor pagination
          continues in the API (<code>/api/v1/events</code>).
        </p>
      )}
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ event_type?: string }>;
}) {
  const sp = await searchParams;
  const raw = sp.event_type;
  const eventType = (EVENT_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as EventType)
    : undefined;

  return (
    <>
      <div className="page-head">
        <h1>Catalyst Feed</h1>
        <p>
          Latest verified-style catalysts across covered India-linked
          pharma/biotech companies — newest first.
        </p>
        <div className="seed-banner" role="note">
          Events are ingested from public sources (trial registries, FDA,
          company disclosures) and every card links to its source record.
        </div>
      </div>
      <Suspense>
        <FilterChips />
      </Suspense>
      <FeedList eventType={eventType} />
    </>
  );
}
