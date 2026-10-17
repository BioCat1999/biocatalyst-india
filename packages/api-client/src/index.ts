/**
 * @biocatalyst/api-client — thin, typed HTTP client over the Biocatalyst
 * India `/api/v1/*` surface (Milestone 9).
 *
 * Shared by the web PWA and the Expo mobile app. This package contains no
 * backend logic: every method maps 1:1 to an existing API route and reuses
 * the canonical types from `@biocatalyst/types`.
 *
 * Authentication mirrors the web's cookie-session model: on sign-in/sign-up
 * the server sets the `bc_session` cookie; the client captures the raw
 * session token from the `Set-Cookie` header and stores it through an
 * injected {@link TokenStorage} (expo-secure-store on mobile, in-memory in
 * tests). Subsequent requests re-attach it as a `Cookie` header. The web
 * API is untouched — no token is added to response bodies, so web security
 * is unchanged.
 */
export {
  ApiClient,
  type ApiClientOptions,
  type EventQueryParams,
  type SessionResult,
} from "./client.js";
export { ApiError, type ApiErrorCode } from "./errors.js";
export {
  SESSION_COOKIE_NAME,
  SESSION_STORAGE_KEY,
  extractSessionToken,
  buildCookieHeader,
  type TokenStorage,
  type InMemoryTokenStorage,
  createInMemoryTokenStorage,
} from "./storage.js";
export type {
  CompanyDetail,
  DrugDetail,
  TrialDetail,
  SearchResults,
  Quote,
  PriceHistoryResponse,
  InsightsResponse,
  CompanyListItem,
  CompanyListResponse,
  GlobalLinkItem,
  GlobalLinksResponse,
  IpoEntry,
  IpoResponse,
  IpoStatus,
  PatentItem,
  PatentExpiryItem,
  PatentStats,
  PatentExpiryResponse,
  CompanyPatentsResponse,
  WatchlistResponse,
  AlertListResponse,
  AuthUserProfile,
} from "./schemas.js";
/** Canonical domain types re-exported so clients import from one place. */
export type {
  CatalystEvent,
  Company,
  Drug,
  EventCard,
  EventType,
  OrangeBookPatent,
  Paginated,
  Trial,
  TrialPhase,
  WatchlistEntityType,
  WatchlistItem,
  AlertListItem,
} from "@biocatalyst/types";
export { eventTypeLabel } from "@biocatalyst/types";
