"use client";
import Link from "next/link";
import { useWatchlist } from "@/lib/watchlist";

/**
 * Watchlist page — Milestone 6: server-backed (spec §14).
 *
 * Anonymous visitors get a sign-in prompt (watchlists require auth per spec
 * §14; browsing stays anonymous). Signed-in users see their followed
 * companies/drugs with instant unfollow.
 */
export default function WatchlistPage() {
  const { items, signedIn, loading, unfollow } = useWatchlist();

  return (
    <>
      <div className="page-head">
        <h1>Watchlist</h1>
        <p>
          Follow companies and drugs to get in-app alerts for new
          high-confidence catalysts. Unfollowing is instant and stops future
          alerts for that entity.
        </p>
      </div>

      {loading ? (
        <div className="empty">
          <p>Loading your watchlist…</p>
        </div>
      ) : !signedIn ? (
        <div className="empty">
          <p>Sign in to keep a watchlist and receive alerts.</p>
          <p>
            <Link className="btn btn-primary" href="/signin">
              Sign in
            </Link>{" "}
            <Link className="btn" href="/signup">
              Sign up
            </Link>
          </p>
          <p>
            Browsing the <Link href="/">catalyst feed</Link> needs no account.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          <p>Your watchlist is empty.</p>
          <p>
            Browse the <Link href="/">catalyst feed</Link> and tap “Follow” on
            any company or drug page.
          </p>
        </div>
      ) : (
        <div className="feed">
          {items.map((r) => (
            <div key={`${r.entityType}-${r.entityId}`} className="card">
              <div className="entity-head">
                <div>
                  <span className="tag neutral">
                    {r.entityType === "company" ? "Company" : "Drug"}
                  </span>
                  <h3 style={{ marginTop: 8 }}>
                    {r.href && r.name ? <Link href={r.href}>{r.name}</Link> : r.entityId}
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => unfollow(r.entityType, r.entityId)}
                  title="Unfollow — stops future alerts for this entity"
                >
                  Unfollow
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
