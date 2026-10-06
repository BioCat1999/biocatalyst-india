/**
 * Shared HTTP helper for LIVE source adapters (`ctgov`, `gdelt`).
 *
 * `fetchJson` GETs a JSON endpoint with a per-request timeout and retries
 * transient failures (HTTP 429 / 5xx, timeouts, connection resets) with
 * exponential backoff. Persistent failures still throw — the ingestion
 * runner records those as failed runs (spec §20) rather than silently
 * succeeding with no data.
 */
export interface FetchJsonOptions {
  userAgent: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface FetchTextOptions extends FetchJsonOptions {
  /** Accept header for the request. Defaults to an RSS/XML-friendly value. */
  accept?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(err: unknown, status: number | null): boolean {
  if (status === 429 || (status !== null && status >= 500)) return true;
  if (err instanceof Error) {
    // AbortError (our timeout) and connection-level failures are retryable.
    return err.name === "AbortError" || /ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(err.message);
  }
  return false;
}

export async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  opts: FetchJsonOptions,
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        headers: { "User-Agent": opts.userAgent, Accept: "application/json" },
        signal: ctrl.signal,
      });
      lastStatus = res.status;
      if (!res.ok) {
        lastError = new Error(`request failed: HTTP ${res.status} for ${new URL(url).hostname}`);
        if (!isTransient(lastError, res.status) || attempt === maxAttempts) throw lastError;
      } else {
        return (await res.json()) as unknown;
      }
    } catch (err) {
      lastError = err;
      if (!isTransient(err, lastStatus) || attempt === maxAttempts) throw err;
    } finally {
      clearTimeout(timer);
    }
    // Exponential backoff: 2s, 4s, … before the next attempt.
    await sleep(2000 * 2 ** (attempt - 1));
  }
  throw lastError;
}

/**
 * `fetchText` — same timeout/retry discipline as `fetchJson`, but returns
 * the response body as text (for XML/RSS feeds, not JSON).
 */
export async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
  opts: FetchTextOptions,
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const accept = opts.accept ?? "application/rss+xml, application/atom+xml, application/xml, text/xml";
  let lastError: unknown = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        headers: { "User-Agent": opts.userAgent, Accept: accept },
        signal: ctrl.signal,
      });
      lastStatus = res.status;
      if (!res.ok) {
        lastError = new Error(`request failed: HTTP ${res.status} for ${new URL(url).hostname}`);
        if (!isTransient(lastError, res.status) || attempt === maxAttempts) throw lastError;
      } else {
        return await res.text();
      }
    } catch (err) {
      lastError = err;
      if (!isTransient(err, lastStatus) || attempt === maxAttempts) throw err;
    } finally {
      clearTimeout(timer);
    }
    await sleep(2000 * 2 ** (attempt - 1));
  }
  throw lastError;
}
