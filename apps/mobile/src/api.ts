/**
 * Shared ApiClient singleton for the mobile app.
 *
 * Base URL comes from `EXPO_PUBLIC_API_URL` (documented in README.md);
 * defaults to the local web dev server so `npx expo start` + `pnpm dev`
 * work out of the box. The client reuses the session-cookie auth model
 * of the web app — the token is captured from `Set-Cookie` after
 * sign-in and kept in expo-secure-store (see storage.ts).
 */
import { ApiClient } from "@biocatalyst/api-client";
import { secureTokenStorage } from "./storage";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").trim() || "http://localhost:3000";

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
