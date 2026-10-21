import type {
  CompanyListResponse,
  EventCard,
  Paginated,
} from "@biocatalyst/api-client";
import { getApiClient } from "./api";

let feed: Paginated<EventCard> | null = null;
let feedRequest: Promise<Paginated<EventCard>> | null = null;
let globalCompanies: CompanyListResponse | null = null;
let globalRequest: Promise<CompanyListResponse> | null = null;

export function getCachedFeed(): Paginated<EventCard> | null {
  return feed;
}

export function loadFirstFeedPage(force = false): Promise<Paginated<EventCard>> {
  if (!force && feed) return Promise.resolve(feed);
  if (feedRequest) return feedRequest;
  feedRequest = getApiClient()
    .listEvents({ limit: 20 })
    .then((response) => {
      feed = response;
      return response;
    })
    .finally(() => {
      feedRequest = null;
    });
  return feedRequest;
}

export function getCachedGlobalCompanies(): CompanyListResponse | null {
  return globalCompanies;
}

export function loadGlobalCompanies(force = false): Promise<CompanyListResponse> {
  if (!force && globalCompanies) return Promise.resolve(globalCompanies);
  if (globalRequest) return globalRequest;
  globalRequest = getApiClient()
    .listCompanies("global", { limit: 50 })
    .then((response) => {
      globalCompanies = response;
      return response;
    })
    .finally(() => {
      globalRequest = null;
    });
  return globalRequest;
}

export function prefetchPrimaryContent(): void {
  void Promise.allSettled([loadFirstFeedPage(), loadGlobalCompanies()]);
}
