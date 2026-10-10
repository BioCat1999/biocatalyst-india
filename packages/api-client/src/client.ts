/**
 * `ApiClient` — typed, validated wrapper over the `/api/v1/*` surface.
 *
 * Thin by design: each method maps 1:1 to an existing web API route.
 * No backend logic lives here (spec: "Do not duplicate backend logic in
 * the mobile app").
 *
 * Session handling mirrors the web cookie-session model: after a
 * successful sign-in/sign-up the `bc_session` token is captured from the
 * `Set-Cookie` response header and persisted through the injected
 * `TokenStorage`; every later request re-attaches it as a `Cookie`
 * header. The web API is unchanged — the token never appears in a
 * response body, so web security properties are preserved.
 */
import { z } from "zod";
import type {
  CatalystEvent,
  EventCard,
  EventType,
  Paginated,
  TrialPhase,
  WatchlistEntityType,
} from "@biocatalyst/types";
import { ApiError, errorMessageFromBody } from "./errors.js";
import {
  SESSION_STORAGE_KEY,
  buildCookieHeader,
  createInMemoryTokenStorage,
  extractSessionToken,
  type TokenStorage,
} from "./storage.js";
import {
  alertListResponseSchema,
  catalystEventSchema,
  companyDetailSchema,
  companyEventsSchema,
  companyListResponseSchema,
  drugDetailSchema,
  globalLinksResponseSchema,
  healthSchema,
  ipoResponseSchema,
  companyPatentsResponseSchema,
  okResponseSchema,
  paginatedEventsSchema,
  patentExpiryResponseSchema,
  quoteSchema,
  searchResultsSchema,
  sessionResponseSchema,
  signInResponseSchema,
  trialSchema,
  watchlistCreateResponseSchema,
  watchlistResponseSchema,
  type AlertListResponse,
  type AuthUserProfile,
  type CompanyDetail,
  type CompanyListResponse,
  type CompanyPatentsResponse,
  type DrugDetail,
  type GlobalLinksResponse,
  type IpoResponse,
  type PatentExpiryResponse,
  type Quote,
  type SearchResults,
  type TrialDetail,
  type WatchlistResponse,
} from "./schemas.js";

export interface ApiClientOptions {
  /**
   * API origin, e.g. `http://localhost:3000` for local dev or the
   * production web host. Trailing slashes are tolerated.
   * Mobile reads this from `EXPO_PUBLIC_API_URL`.
   */
  baseUrl: string;
  /** fetch implementation — global fetch by default; injectable for tests. */
  fetchImpl?: typeof fetch;
  /**
   * Where the session token is kept. Pass an expo-secure-store-backed
   * implementation on mobile. `null` disables persistence (anonymous-only
   * usage). Defaults to an in-memory store.
   */
  storage?: TokenStorage | null;
}

export interface EventQueryParams {
  cursor?: string;
  eventType?: EventType;
  /** Server-side filter is a company id (`company=` query param). */
  company?: string;
  phase?: TrialPhase;
  indication?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface SessionResult {
  user: AuthUserProfile | null;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skip attaching the session cookie (used for sign-in/sign-up). */
  anonymous?: boolean;
  /** Validate the JSON body against this schema. */
  schema?: z.ZodType<unknown>;
}

export class ApiClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly storage: TokenStorage | null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl =
      options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as typeof fetch);
    this.storage = options.storage === undefined ? createInMemoryTokenStorage() : options.storage;
  }

  /** Build an absolute URL for a `/api/...` path with query params. */
  url(path: string, query?: Record<string, string | number | undefined>): string {
    const u = new URL(path.startsWith("/") ? path : `/${path}`, this.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  /* ---------- session token plumbing ---------- */

  async getSessionToken(): Promise<string | null> {
    return this.storage ? this.storage.getItem(SESSION_STORAGE_KEY) : null;
  }

  async setSessionToken(token: string | null): Promise<void> {
    if (!this.storage) return;
    if (token) await this.storage.setItem(SESSION_STORAGE_KEY, token);
    else await this.storage.removeItem(SESSION_STORAGE_KEY);
  }

  private async captureSessionToken(res: Response): Promise<void> {
    if (!this.storage) return;
    // Some fetch implementations join multiple Set-Cookie values with commas;
    // extractSessionToken handles that. Also try the RFC 6265bis split form.
    const header = res.headers.get("set-cookie");
    const token = extractSessionToken(header);
    if (token) await this.storage.setItem(SESSION_STORAGE_KEY, token);
  }

  /* ---------- core request ---------- */

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, anonymous = false, schema } = opts;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (!anonymous) {
      const token = await this.getSessionToken();
      if (token) headers["Cookie"] = buildCookieHeader(token);
    }
    let payload: BodyInit | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(path.startsWith("http") ? path : this.url(path), {
        method,
        headers,
        body: payload,
      });
    } catch (err) {
      throw new ApiError(
        0,
        `network error: ${err instanceof Error ? err.message : String(err)}`,
        "network",
      );
    }

    await this.captureSessionToken(res);

    if (res.status === 204) {
      return undefined as T;
    }

    let parsed: unknown = null;
    const text = await res.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      throw new ApiError(
        res.status,
        errorMessageFromBody(parsed, `request failed with status ${res.status}`),
        undefined,
        parsed,
      );
    }

    if (schema) {
      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new ApiError(
          res.status,
          `invalid response shape for ${path}`,
          "invalid_response",
          parsed,
        );
      }
      return result.data as T;
    }
    return parsed as T;
  }

  /* ---------- health & auth ---------- */

  health(): Promise<{ status: string; service?: string; milestone?: number }> {
    return this.request("/api/healthz", { schema: healthSchema });
  }

  /** Create an account; auto-signed-in like the web flow. */
  async signUp(email: string, password: string): Promise<AuthUserProfile> {
    const res = await this.request<{ user: AuthUserProfile }>("/api/v1/auth/signup", {
      method: "POST",
      body: { email, password },
      anonymous: true,
      schema: signInResponseSchema,
    });
    return res.user;
  }

  async signIn(email: string, password: string): Promise<AuthUserProfile> {
    const res = await this.request<{ user: AuthUserProfile }>("/api/v1/auth/signin", {
      method: "POST",
      body: { email, password },
      anonymous: true,
      schema: signInResponseSchema,
    });
    return res.user;
  }

  /**
   * Permanently delete the signed-in account (the server cascades to
   * watchlist, alerts and push tokens) and drop the local token either way.
   */
  async deleteAccount(): Promise<void> {
    try {
      await this.request("/api/v1/auth/account", { method: "DELETE" });
    } finally {
      await this.setSessionToken(null);
    }
  }

  /** Destroy the server session and drop the local token either way. */
  async signOut(): Promise<void> {
    try {
      await this.request("/api/v1/auth/signout", { method: "POST" });
    } catch {
      // Idempotent sign-out: the local token is dropped either way.
    } finally {
      await this.setSessionToken(null);
    }
  }

  /** Who is signed in, or `{ user: null }` when anonymous (401 tolerated). */
  async getSession(): Promise<SessionResult> {
    try {
      const res = await this.request<{ user: AuthUserProfile | null }>(
        "/api/v1/auth/session",
        { schema: sessionResponseSchema },
      );
      return { user: res.user };
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthorized) return { user: null };
      throw err;
    }
  }

  /* ---------- public content (anonymous OK) ---------- */

  listEvents(params: EventQueryParams = {}): Promise<Paginated<EventCard>> {
    const query: Record<string, string | number | undefined> = {
      cursor: params.cursor,
      event_type: params.eventType,
      company: params.company,
      phase: params.phase,
      indication: params.indication,
      from: params.from,
      to: params.to,
      limit: params.limit,
    };
    return this.request(this.url("/api/v1/events", query), {
      schema: paginatedEventsSchema,
    });
  }

  getEvent(id: string): Promise<CatalystEvent> {
    return this.request(this.url(`/api/v1/events/${encodeURIComponent(id)}`), {
      schema: catalystEventSchema,
    });
  }

  getCompany(slug: string): Promise<CompanyDetail> {
    return this.request(this.url(`/api/v1/companies/${encodeURIComponent(slug)}`), {
      schema: companyDetailSchema,
    });
  }

  getCompanyEvents(slug: string): Promise<{ company: { id: string; slug: string; canonicalName: string }; items: EventCard[] }> {
    return this.request(this.url(`/api/v1/companies/${encodeURIComponent(slug)}/events`), {
      schema: companyEventsSchema,
    });
  }

  getDrug(slug: string): Promise<DrugDetail> {
    return this.request(this.url(`/api/v1/drugs/${encodeURIComponent(slug)}`), {
      schema: drugDetailSchema,
    });
  }

  getTrial(registry: string, trialId: string): Promise<TrialDetail> {
    return this.request(
      this.url(`/api/v1/trials/${encodeURIComponent(registry)}/${encodeURIComponent(trialId)}`),
      { schema: trialSchema },
    );
  }

  search(q: string): Promise<SearchResults> {
    return this.request(this.url("/api/v1/search", { q }), {
      schema: searchResultsSchema,
    });
  }

  /** Latest delayed quote for a company's preferred listing. Never throws for missing data — price fields are null. */
  getQuote(slug: string): Promise<Quote> {
    return this.request(this.url(`/api/v1/companies/${encodeURIComponent(slug)}/quote`), {
      schema: quoteSchema,
    });
  }

  /** Company directory. scope=global → non-Indian majors; scope=india → Indian catalog; omit → all. */
  listCompanies(scope?: "global" | "india"): Promise<CompanyListResponse> {
    return this.request(this.url("/api/v1/companies", scope ? { scope } : undefined), {
      schema: companyListResponseSchema,
    });
  }

  /** Curated India-impact links between the company and global pharma majors. */
  getGlobalLinks(slug: string): Promise<GlobalLinksResponse> {
    return this.request(this.url(`/api/v1/companies/${encodeURIComponent(slug)}/links`), {
      schema: globalLinksResponseSchema,
    });
  }

  /** IPO pipeline: curated catalog of pipeline + recently listed companies. */
  listIpos(): Promise<IpoResponse> {
    return this.request(this.url("/api/v1/ipos"), {
      schema: ipoResponseSchema,
    });
  }

  /** Patent cliff tracker: upcoming Orange Book expiries, soonest first. */
  listPatentExpiries(withinDays?: number): Promise<PatentExpiryResponse> {
    return this.request(
      this.url("/api/v1/patents", withinDays ? { within: withinDays } : undefined),
      { schema: patentExpiryResponseSchema },
    );
  }

  /** Orange Book patents where the company is the listed applicant. */
  getCompanyPatents(slug: string): Promise<CompanyPatentsResponse> {
    return this.request(this.url(`/api/v1/companies/${encodeURIComponent(slug)}/patents`), {
      schema: companyPatentsResponseSchema,
    });
  }

  /* ---------- watchlist (auth required) ---------- */

  listWatchlist(): Promise<WatchlistResponse> {
    return this.request("/api/v1/watchlist", { schema: watchlistResponseSchema });
  }

  follow(entityType: WatchlistEntityType, entityId: string): Promise<WatchlistResponse["items"][number] & { alreadyFollowed?: boolean }> {
    return this.request("/api/v1/watchlist", {
      method: "POST",
      body: { entity_type: entityType, entity_id: entityId },
      schema: watchlistCreateResponseSchema,
    });
  }

  async unfollow(entityType: WatchlistEntityType, entityId: string): Promise<void> {
    await this.request(
      this.url(
        `/api/v1/watchlist/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      ),
      { method: "DELETE" },
    );
  }

  /* ---------- alerts (auth required) ---------- */

  listAlerts(): Promise<AlertListResponse> {
    return this.request("/api/v1/alerts", { schema: alertListResponseSchema });
  }

  markAlertRead(alertId: string): Promise<{ ok: boolean }> {
    return this.request(this.url(`/api/v1/alerts/${encodeURIComponent(alertId)}/read`), {
      method: "POST",
      schema: okResponseSchema,
    });
  }

  markAllAlertsRead(): Promise<{ ok: boolean; marked?: number }> {
    return this.request("/api/v1/alerts/read-all", {
      method: "POST",
      schema: okResponseSchema,
    });
  }

  /**
   * Push-token registration PLUMBING (Milestone 9 scope).
   *
   * Attempts to register a native push token against the API backend. The
   * backend does not expose `/api/v1/push-tokens` yet (planned for a later
   * milestone), so a 404 is tolerated and reported as `{ registered: false }`
   * — the token is still kept in local storage by the mobile app. No
   * third-party push service is contacted here; the target is always the
   * user's own API base URL.
   */
  async registerPushToken(token: string): Promise<{ registered: boolean }> {
    try {
      await this.request("/api/v1/push-tokens", {
        method: "POST",
        body: { token, platform: "expo" },
      });
      return { registered: true };
    } catch (err) {
      if (err instanceof ApiError && err.isNotFound) return { registered: false };
      throw err;
    }
  }
}
