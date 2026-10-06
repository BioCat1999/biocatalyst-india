import { NextRequest, NextResponse } from "next/server";
import { listEvents, toEventCard } from "@biocatalyst/data";
import { parseQuery, eventsQuerySchema } from "@/lib/validate";

/** GET /v1/events?cursor=&event_type=&company=&phase=&indication=&from=&to=&limit= */
export async function GET(req: NextRequest) {
  const parsed = parseQuery(eventsQuerySchema, req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const q = parsed.data;
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
  return NextResponse.json({
    items: await Promise.all(result.items.map(toEventCard)),
    nextCursor: result.nextCursor,
  });
}
