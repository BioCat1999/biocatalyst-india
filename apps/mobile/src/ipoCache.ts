import type { IpoResponse } from "@biocatalyst/api-client";
import { getApiClient } from "./api";

let cachedResponse: IpoResponse | null = null;
let inFlight: Promise<IpoResponse> | null = null;

/** Return the last successful response so revisiting IPOs never flashes empty. */
export function getCachedIpos(): IpoResponse | null {
  return cachedResponse;
}

/**
 * Share one request between background prefetch and the IPO screen. Pull to
 * refresh bypasses the in-memory value but still benefits from the edge cache.
 */
export function loadIpos(force = false): Promise<IpoResponse> {
  if (!force && cachedResponse) return Promise.resolve(cachedResponse);
  if (inFlight) return inFlight;

  inFlight = getApiClient()
    .listIpos()
    .then((response) => {
      cachedResponse = response;
      return response;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function prefetchIpos(): void {
  void loadIpos().catch(() => {
    // Prefetch is opportunistic; the IPO screen owns visible error handling.
  });
}
