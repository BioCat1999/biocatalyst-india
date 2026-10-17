import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { getUnreadCount, listAlerts } from "@biocatalyst/notifications";
import { getSessionToken, requireUserForToken } from "@/lib/auth-server";

/**
 * GET /api/v1/alerts — the signed-in user's in-app notification center
 * (spec §14: alerts start as in-app notifications).
 *
 * Returns the newest alerts first (each enriched with the event headline
 * and link) plus the unread count for the bell badge. Auth required.
 */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUserForToken(getSessionToken(req));
  } catch (err) {
    return NextResponse.json(
      { error: "authentication required" },
      { status: (err as { status?: number }).status ?? 401 },
    );
  }
  const pool = getPool();
  const [alerts, unreadCount] = await Promise.all([
    listAlerts(pool, user.id, { limit: 50 }),
    getUnreadCount(pool, user.id),
  ]);
  const eventIds = [...new Set(alerts.map((alert) => alert.eventId))];
  const { rows: eventRows } = eventIds.length
    ? await pool.query<{ id: string; headline: string; event_type: string }>(
        `SELECT id::text AS id, headline, event_type
           FROM events WHERE id = ANY($1::uuid[])`,
        [eventIds],
      )
    : { rows: [] };
  const events = new Map(eventRows.map((event) => [event.id, event]));
  const items = alerts.map((alert) => {
    const event = events.get(alert.eventId);
    return {
      id: alert.id,
      eventId: alert.eventId,
      channel: alert.channel,
      status: alert.status,
      readAt: alert.readAt,
      createdAt: alert.createdAt,
      headline: event?.headline ?? null,
      eventType: event?.event_type ?? null,
      href: `/events/${alert.eventId}`,
    };
  });
  return NextResponse.json({ items, unreadCount });
}
