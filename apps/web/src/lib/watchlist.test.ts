/**
 * loadWatchlistState sharing tests.
 *
 * Every FollowButton on a page calls this loader; concurrent mounts must
 * share a single network request, and follow/unfollow invalidation must
 * force a refetch.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { invalidateWatchlistCache, loadWatchlistState } from "./watchlist.js";

function fakeFetch(
  impl: () => Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>,
) {
  return (async () => impl()) as unknown as typeof fetch;
}

describe("loadWatchlistState", () => {
  beforeEach(() => {
    invalidateWatchlistCache();
  });

  it("shares one request across concurrent callers", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return {
        status: 200,
        ok: true,
        json: async () => ({ items: [{ entityType: "company", entityId: "x" }] }),
      };
    });
    const [a, b] = await Promise.all([
      loadWatchlistState(fetchImpl),
      loadWatchlistState(fetchImpl),
    ]);
    expect(calls).toBe(1);
    expect(a.signedIn).toBe(true);
    expect(a.items).toEqual(b.items);
    expect(a.items).toHaveLength(1);
  });

  it("serves from cache within the TTL, then refetches after invalidate", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(async () => {
      calls++;
      return { status: 200, ok: true, json: async () => ({ items: [] }) };
    });
    await loadWatchlistState(fetchImpl);
    await loadWatchlistState(fetchImpl);
    expect(calls).toBe(1);
    invalidateWatchlistCache();
    await loadWatchlistState(fetchImpl);
    expect(calls).toBe(2);
  });

  it("treats 401 as signed out with no items", async () => {
    const fetchImpl = fakeFetch(async () => ({
      status: 401,
      ok: false,
      json: async () => ({}),
    }));
    const s = await loadWatchlistState(fetchImpl);
    expect(s.signedIn).toBe(false);
    expect(s.items).toEqual([]);
  });

  it("does not cache failures", async () => {
    let calls = 0;
    const failing = fakeFetch(async () => {
      calls++;
      return { status: 500, ok: false, json: async () => ({}) };
    });
    await expect(loadWatchlistState(failing)).rejects.toThrow("watchlist 500");
    const working = fakeFetch(async () => {
      calls++;
      return { status: 200, ok: true, json: async () => ({ items: [] }) };
    });
    await loadWatchlistState(working);
    expect(calls).toBe(2);
  });
});
