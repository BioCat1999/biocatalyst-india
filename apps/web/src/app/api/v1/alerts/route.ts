import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@biocatalyst/db";
import { getEvent } from "@biocatalyst/data";
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
  const items = await Promise.all(
    alerts.map(async (a) => {
      const event = await getEvent(a.eventId);
      return {
        id: a.id,
        eventId: a.eventId,
        channel: a.channel,
        status: a.status,
        readAt: a.readAt,
        createdAt: a.createdAt,
        headline: event?.headline ?? null,
        eventType: event?.eventType ?? null,
        href: `/events/${a.eventId}`,
      };
    }),
  );
  return NextResponse.json({ items, unreadCount });
}
