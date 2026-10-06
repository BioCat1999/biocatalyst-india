"use client";
import Link from "next/link";
import { useState } from "react";
import { useWatchlist } from "@/lib/watchlist";
import type { WatchlistEntityType } from "@biocatalyst/types";

/**
 * Follow/unfollow button — Milestone 6: server-backed (spec §14).
 *
 * Auth required: anonymous users see a sign-in prompt instead of the
 * button. Unfollowing is instant and stops future alerts for the entity
 * (spec §17).
 *
 * `compact` renders a small "+" / "✓" pill for dense surfaces (company
 * lists, feed cards) instead of the full labeled button.
 */
export function FollowButton({
  entityType,
  entityId,
  label,
  compact = false,
}: {
  entityType: WatchlistEntityType;
  entityId: string;
  label: string;
  compact?: boolean;
}) {
  const { isWatched, follow, unfollow, signedIn, loading } = useWatchlist();
  const [busy, setBusy] = useState(false);
  const cls = compact ? "btn btn-compact" : "btn";

  if (loading) {
    return (
      <button type="button" className={cls} disabled aria-busy="true" aria-label="Loading follow state">
        …
      </button>
    );
  }

  if (!signedIn) {
    return compact ? (
      <Link
        className={`${cls} btn-primary`}
        href="/signin"
        title={`Sign in to follow ${label}`}
        aria-label={`Sign in to follow ${label}`}
      >
        +
      </Link>
    ) : (
      <Link className="btn btn-primary" href="/signin">
        Sign in to follow {label}
      </Link>
    );
  }

  const watched = isWatched(entityType, entityId);
  const onClick = async () => {
    setBusy(true);
    try {
      if (watched) await unfollow(entityType, entityId);
      else await follow(entityType, entityId);
    } finally {
      setBusy(false);
    }
  };

  const text = compact ? (watched ? "✓" : "+") : watched ? `✓ Following ${label}` : `+ Follow ${label}`;
  return (
    <button
      type="button"
      className={`${cls} ${watched ? "" : "btn-primary"}`}
      onClick={onClick}
      disabled={busy}
      aria-pressed={watched}
      aria-label={compact ? (watched ? `Unfollow ${label}` : `Follow ${label}`) : undefined}
      title={watched ? "Unfollow — stops future alerts for this entity" : `Follow this ${label}`}
    >
      {text}
    </button>
  );
}
