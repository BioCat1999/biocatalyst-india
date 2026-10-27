import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@biocatalyst/api-client";

export interface ApiCallState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  retry: () => void;
}

interface CacheEntry {
  data: unknown;
  at: number;
}

/** Process-wide response cache shared by every screen (cleared on app restart). */
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 120;

function remember(key: string, data: unknown) {
  cache.delete(key);
  cache.set(key, { data, at: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Read a cached response without subscribing (used for instant first paint). */
export function peekApiCache<T>(key: string): T | null {
  return (cache.get(key)?.data as T | undefined) ?? null;
}

/** Warm the cache in the background; concurrent callers share one request. */
export function prefetchApi<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit.data as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const request = load()
    .then((data) => {
      remember(key, data);
      return data;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

export interface ApiCallOptions {
  /**
   * Opt-in cache key. When set, a cached response paints immediately and is
   * refreshed quietly in the background once older than `staleMs`.
   */
  cacheKey?: string;
  /** How long a cached response counts as fresh (default 60 s). */
  staleMs?: number;
}

/**
 * Data-fetch hook for screens: runs `load` on mount (and when `retryKey`
 * changes), tracks loading/error, and ignores late responses after unmount.
 * With `cacheKey` it becomes stale-while-revalidate, so revisiting a screen
 * is instant.
 */
export function useApiCall<T>(
  load: () => Promise<T>,
  retryKey: string = "",
  options: ApiCallOptions = {},
): ApiCallState<T> {
  const { cacheKey, staleMs = 60_000 } = options;
  const initial = cacheKey ? peekApiCache<T>(cacheKey) : null;
  const [data, setData] = useState<T | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState<ApiError | null>(null);
  const alive = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(
    async (force = false) => {
      const hit = cacheKey ? cache.get(cacheKey) : undefined;
      if (hit) {
        setData(hit.data as T);
        setLoading(false);
        setError(null);
        if (!force && Date.now() - hit.at < staleMs) return;
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const result = cacheKey
          ? await (force || hit
              ? loadRef.current().then((d) => {
                  remember(cacheKey, d);
                  return d;
                })
              : prefetchApi(cacheKey, loadRef.current))
          : await loadRef.current();
        if (alive.current) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        // A background refresh failing keeps the cached data on screen.
        if (alive.current && !hit) {
          setError(err instanceof ApiError ? err : new ApiError(0, String(err), "network"));
        }
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [retryKey, cacheKey, staleMs],
  );

  useEffect(() => {
    alive.current = true;
    void run();
    return () => {
      alive.current = false;
    };
  }, [run]);

  const retry = useCallback(() => void run(true), [run]);
  return { data, loading, error, retry };
}
