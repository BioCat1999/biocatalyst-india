import { cookies } from "next/headers";
import Link from "next/link";
import { getPool } from "@biocatalyst/db";
import { getDigest } from "@biocatalyst/notifications";
import type { EventType } from "@biocatalyst/types";
import { SESSION_COOKIE, getUserForToken } from "@/lib/auth-server";
import { EventTypeTag } from "@/components/EventTypeTag";
import { formatDate } from "@/lib/format";
import DigestMarkRead from "./DigestMarkRead";

export const dynamic = "force-dynamic";

/**
 * Watchlist digest — the periodic summary of what's new across followed
 * companies: every unread alert, grouped by company, newest first.
 * Marking alerts read resets the digest to "all caught up".
 */
export default async function DigestPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const user = await getUserForToken(token);

  if (!user) {
    return (
      <>
        <div className="page-head">
          <h1>Watchlist digest</h1>
          <p>Your periodic summary of new catalysts across followed companies.</p>
        </div>
        <div className="empty">
          <p>Sign in to see your digest.</p>
          <p>
            <Link className="btn btn-primary" href="/signin">
              Sign in
            </Link>{" "}
            <Link className="btn" href="/signup">
              Sign up
            </Link>
          </p>
        </div>
      </>
    );
  }

  const groups = await getDigest(getPool(), user.id);
  const total = groups.reduce((n, g) => n + g.events.length, 0);

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Watchlist digest</h1>
          <p>
            {total === 0
              ? "You're all caught up — no unread alerts on your followed companies."
              : `${total} unread catalyst${total === 1 ? "" : "s"} across ${groups.length} followed compan${groups.length === 1 ? "y" : "ies"}.`}
          </p>
        </div>
        {total > 0 && <DigestMarkRead />}
      </div>

      {total === 0 && (
        <div className="empty">
          <p>
            New high-confidence events on companies you follow will land here.
            Browse the <Link href="/">catalyst feed</Link> and tap “Follow” on
            any company to start your digest.
          </p>
        </div>
      )}

      <div style={{ paddingBottom: 48 }}>
        {groups.map((g) => (
          <section key={g.companyId} aria-label={g.companyName} style={{ marginBottom: 28 }}>
            <h2>
              <Link href={`/companies/${g.companySlug}`}>{g.companyName}</Link>
              <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 14 }}>
                {" "}
                · {g.events.length} new
              </span>
            </h2>
            {g.events.map((e) => (
              <div key={e.alertId} className="result-row">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <EventTypeTag type={e.eventType as EventType} />
                  {e.occurredAt && (
                    <span style={{ color: "var(--muted)", fontSize: 13 }}>
                      {formatDate(e.occurredAt)}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 4 }}>
                  <Link href={`/events/${e.eventId}`}>{e.headline}</Link>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
