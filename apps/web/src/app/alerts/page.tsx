"use client";
/**
 * Notification center — Milestone 6 (spec §14).
 *
 * In-app alerts for new published high-confidence catalysts on followed
 * companies/drugs. Auth required; anonymous visitors get a sign-in prompt.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AlertListItem } from "@biocatalyst/types";

export default function AlertsPage() {
  const [items, setItems] = useState<AlertListItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState<"loading" | "anon" | "ready">("loading");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/alerts", { cache: "no-store" });
      if (res.status === 401) {
        setState("anon");
        return;
      }
      if (!res.ok) throw new Error(`alerts ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setUnread(data.unreadCount ?? 0);
      setState("ready");
    } catch {
      setState("ready");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    await fetch(`/api/v1/alerts/${id}/read`, { method: "POST" });
    await load();
  };

  const markAllRead = async () => {
    await fetch("/api/v1/alerts/read-all", { method: "POST" });
    await load();
  };

  return (
    <>
      <div className="page-head">
        <h1>Alerts</h1>
        <p>
          In-app notifications for new high-confidence catalysts on companies
          and drugs you follow. Email and push arrive in later milestones.
        </p>
      </div>

      {state === "loading" && (
        <div className="empty">
          <p>Loading alerts…</p>
        </div>
      )}

      {state === "anon" && (
        <div className="empty">
          <p>Sign in to see your alerts.</p>
          <p>
            <Link className="btn btn-primary" href="/signin">
              Sign in
            </Link>{" "}
            <Link className="btn" href="/signup">
              Sign up
            </Link>
          </p>
        </div>
      )}

      {state === "ready" && (
        <>
          {unread > 0 && (
            <p>
              <button type="button" className="btn" onClick={markAllRead}>
                Mark all as read
              </button>
            </p>
          )}
          {items.length === 0 ? (
            <div className="empty">
              <p>No alerts yet.</p>
              <p>
                <Link href="/watchlist">Follow a company or drug</Link> and
                new high-confidence catalysts will appear here.
              </p>
            </div>
          ) : (
            <div className="feed">
              {items.map((a) => (
                <div
                  key={a.id}
                  className={`card${a.readAt ? "" : " card-unread"}`}
                  aria-label={a.readAt ? "Read alert" : "Unread alert"}
                >
                  <div className="card-top">
                    {a.eventType && <span className="tag neutral">{a.eventType}</span>}
                    {!a.readAt && <span className="tag accent">New</span>}
                    <span className="muted">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h3>
                    <Link href={a.href}>{a.headline ?? "Untitled event"}</Link>
                  </h3>
                  {!a.readAt && (
                    <p>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => markRead(a.id)}
                      >
                        Mark as read
                      </button>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
