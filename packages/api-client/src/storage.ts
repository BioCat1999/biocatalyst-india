/**
 * Session-token plumbing.
 *
 * The API authenticates with the same `bc_session` cookie the web app uses.
 * React Native's fetch does not manage a cookie jar, so the client captures
 * the token from the `Set-Cookie` response header after sign-in/sign-up and
 * re-attaches it as a `Cookie` request header on later calls. Storage is
 * injected so the mobile app can use expo-secure-store while tests and
 * Node scripts use an in-memory store.
 */

/** Name of the session cookie, mirroring apps/web `SESSION_COOKIE`. */
export const SESSION_COOKIE_NAME = "bc_session";

/** Key under which the raw session token is kept in secure storage. */
export const SESSION_STORAGE_KEY = "biocatalyst.sessionToken";

/** Minimal async key/value store for the session token. */
export interface TokenStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Extract the raw session token from a `Set-Cookie` header value.
 *
 * Handles a single header string that may contain several cookies
 * (comma-joined, as produced by some fetch implementations). Returns null
 * when the header is absent or carries no `bc_session` cookie.
 */
export function extractSessionToken(setCookie: string | null): string | null {
  if (!setCookie) return null;
  // Split on commas that start a new cookie: a comma followed by
  // "<token-name>=". Attribute commas (e.g. in Expires dates) don't match.
  const parts = setCookie.split(/,(?=\s*[^;,=\s]+=)/);
  for (const part of parts) {
    const first = part.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq < 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name === SESSION_COOKIE_NAME && value.length > 0) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/** Build the `Cookie` request header that carries the session token. */
export function buildCookieHeader(token: string): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

/** Ephemeral in-memory token store (tests, Node scripts). */
export interface InMemoryTokenStorage extends TokenStorage {
  clear(): void;
}

export function createInMemoryTokenStorage(): InMemoryTokenStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
}
