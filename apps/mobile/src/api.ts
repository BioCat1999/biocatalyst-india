/**
 * Shared ApiClient singleton for the mobile app.
 *
 * Base URL comes from `EXPO_PUBLIC_API_URL` (documented in README.md);
 * defaults to the production service so an omitted release-build variable
 * cannot create a binary that points at the phone's localhost. Local
 * development can override it explicitly. The client reuses the session-cookie auth model
 * of the web app — the token is captured from `Set-Cookie` after
 * sign-in and kept in expo-secure-store (see storage.ts).
 */
import { ApiClient } from "@biocatalyst/api-client";
import { secureTokenStorage } from "./storage";

export const API_URL =
  (process.env.EXPO_PUBLIC_API_URL ?? "").trim() ||
  "https://biocatalyst-india.vercel.app";

let client: ApiClient | null = null;

/** Lazily-created, process-wide client instance. */
export function getApiClient(): ApiClient {
  if (!client) {
    client = new ApiClient({ baseUrl: API_URL, storage: secureTokenStorage });
  }
  return client;
}

/** Test seam: replace the singleton (used by jest tests). */
export function __setApiClientForTests(next: ApiClient | null): void {
  client = next;
}
