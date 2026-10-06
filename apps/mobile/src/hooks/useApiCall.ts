import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@biocatalyst/api-client";

export interface ApiCallState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  retry: () => void;
}

/**
 * Minimal data-fetch hook for screens: runs `load` on mount (and when
 * `retryKey` changes), tracks loading/error, and ignores late responses
 * after unmount.
 */
export function useApiCall<T>(load: () => Promise<T>, retryKey: string = ""): ApiCallState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const alive = useRef(true);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await load();
      if (alive.current) setData(result);
    } catch (err) {
      if (alive.current) {
        setError(err instanceof ApiError ? err : new ApiError(0, String(err), "network"));
      }
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  useEffect(() => {
    alive.current = true;
    run();
    return () => {
      alive.current = false;
    };
  }, [run]);

  return { data, loading, error, retry: run };
}
