import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { listEvents, toEventCards } from "@biocatalyst/data";
import type { EventType } from "@biocatalyst/types";
import { parseQuery, eventsQuerySchema } from "@/lib/validate";

async function loadEventPage(
  eventType: EventType | undefined,
  limit: number,
) {
  const result = await listEvents({ eventType }, undefined, limit);
  return {
    items: await toEventCards(result.items),
    nextCursor: result.nextCursor,
  };
}

// The mobile filter chips always request the first 20 rows for one event
// type. Keep those small, public pages in Next's shared data cache so a cold
// serverless instance does not rebuild the same hydrated event graph every
// minute. Cursor pages and advanced filters remain uncached below.
const getCachedFirstPage = unstable_cache(
  loadEventPage,
  ["mobile-feed-first-page-v2"],
  { revalidate: 300 },
);

function getFirstPage(eventType: EventType | undefined, limit: number) {
  // Route unit tests call GET without a Next server/incremental-cache context.
  return process.env.NODE_ENV === "test"
    ? loadEventPage(eventType, limit)
    : getCachedFirstPage(eventType, limit);
}

/** GET /v1/events?cursor=&event_type=&company=&phase=&indication=&from=&to=&limit= */
export async function GET(req: NextRequest) {
  const parsed = parseQuery(eventsQuerySchema, req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const q = parsed.data;
  const isFeedFirstPage =
    !q.cursor && !q.company && !q.phase && !q.indication && !q.from && !q.to;
  const response = isFeedFirstPage
    ? await getFirstPage(q.event_type, q.limit)
    : await (async () => {
        const result = await listEvents(
          {
            eventType: q.event_type,
            companyId: q.company,
            phase: q.phase,
            indication: q.indication,
            from: q.from,
            to: q.to,
          },
          q.cursor,
          q.limit,
        );
        return {
          items: await toEventCards(result.items),
          nextCursor: result.nextCursor,
        };
      })();
  return NextResponse.json(
    response,
    {
      headers: {
        "Cache-Control": isFeedFirstPage
          ? "public, s-maxage=300, stale-while-revalidate=3600"
          : "public, s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
