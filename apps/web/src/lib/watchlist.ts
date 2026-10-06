"use client";
/**
 * Watchlist state — Milestone 6: server-backed (spec §14).
 *
 * Replaces the Milestone 1 localStorage mock. Items live in Postgres behind
 * the session cookie; anonymous users get `signedIn: false` and follow
 * actions are disabled (the UI redirects to /signin).
 *
 * Fetch sharing: every mounted FollowButton calls this hook, so the
 * underlying GET is shared — one network request per page no matter how
 * many buttons render (30 feed cards = 1 request, not 30). follow/unfollow
 * invalidate the cache so all buttons re-render from fresh state.
 */
import { useCallback, useEffect, useState } from "react";
import type { WatchlistItem, WatchlistEntityType } from "@biocatalyst/types";

interface State {
  items: WatchlistItem[];
  signedIn: boolean;
  loading: boolean;
}

interface LoadedState {
  items: WatchlistItem[];
  signedIn: boolean;
}

const CACHE_TTL_MS = 30_000;
let cached: (LoadedState & { at: number }) | null = null;
let inflight: Promise<LoadedState> | null = null;

/** Shared, TTL-cached loader — exported for tests. */
export async function loadWatchlistState(
  fetchImpl: typeof fetch = fetch,
): Promise<LoadedState> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return { items: cached.items, signedIn: cached.signedIn };
  }
  if (!inflight) {
    inflight = (async (): Promise<LoadedState> => {
      const res = await fetchImpl("/api/v1/watchlist", { cache: "no-store" });
      if (res.status === 401) return { items: [], signedIn: false };
      if (!res.ok) throw new Error(`watchlist ${res.status}`);
      const data = await res.json();
      return { items: data.items ?? [], signedIn: true };
    })();
    // Cache the fulfilled value (not the promise) so failures aren't sticky.
    inflight.then(
      (s) => {
        cached = { ...s, at: Date.now() };
        inflight = null;
      },
      () => {
        inflight = null;
      },
    );
  }
  return inflight;
}

/** Drop the shared cache — called after follow/unfollow mutations. */
export function invalidateWatchlistCache(): void {
  cached = null;
}

export function useWatchlist() {
  const [state, setState] = useState<State>({ items: [], signedIn: false, loading: true });

  const refresh = useCallback(async () => {
    try {
      const s = await loadWatchlistState();
      setState({ items: s.items, signedIn: s.signedIn, loading: false });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isWatched = useCallback(
    (entityType: WatchlistEntityType, entityId: string) =>
      state.items.some((i) => i.entityType === entityType && i.entityId === entityId),
    [state.items],
  );

  const follow = useCallback(async (entityType: WatchlistEntityType, entityId: string) => {
    const res = await fetch("/api/v1/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
    });
    if (res.ok) {
      invalidateWatchlistCache();
      await refresh();
    }
    return res.ok;
  }, [refresh]);

  const unfollow = useCallback(
    async (entityType: WatchlistEntityType, entityId: string) => {
      const res = await fetch(
        `/api/v1/watchlist/${entityType}/${encodeURIComponent(entityId)}`,
        { method: "DELETE" },
      );
      const ok = res.ok || res.status === 204;
      if (ok) {
        invalidateWatchlistCache();
        await refresh();
      }
      return ok;
    },
    [refresh],
  );

  return {
    items: state.items,
    signedIn: state.signedIn,
    loading: state.loading,
    isWatched,
    follow,
    unfollow,
    refresh,
  };
}
