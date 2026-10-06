/**
 * Unit tests for @biocatalyst/api-client.
 *
 * The HTTP layer is tested against a stub fetch implementation — no
 * network, no database. Covers URL building, session-cookie capture and
 * re-attachment, error mapping, and Zod response validation.
 */
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client.js";
import { ApiError } from "./errors.js";
import {
  buildCookieHeader,
  createInMemoryTokenStorage,
  extractSessionToken,
} from "./storage.js";

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function stubFetch(
  handler: (call: RecordedCall) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const demoUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ada@example.com",
  displayName: null,
  createdAt: "2026-09-30T00:00:00.000Z",
};

const demoEventCard = {
  id: "22222222-2222-4222-8222-222222222222",
  headline: "Demo headline",
  occurredAt: "2026-09-29T10:00:00.000Z",
  eventType: "regulatory_approval",
  company: { id: "33333333-3333-4333-8333-333333333333", slug: "demo-pharma", name: "Demo Pharma", ticker: "DEMOPHARMA", exchange: "NSE" },
  fact: "A fact.",
  summary: "A summary.",
  catalystSummary: "Why it matters.",
  sources: [{ title: "Source", url: "https://example.com", isPrimary: true }],
  confidence: 0.9,
};

function makeClient(fetchImpl: typeof fetch, baseUrl = "https://api.example.com/") {
  const storage = createInMemoryTokenStorage();
  const client = new ApiClient({ baseUrl, fetchImpl, storage });
  return { client, storage };
}

describe("url building", () => {
  it("trims trailing slashes from the base URL", () => {
    const c = new ApiClient({ baseUrl: "https://api.example.com///" });
    expect(c.baseUrl).toBe("https://api.example.com");
  });

  it("encodes query params and skips undefined/empty values", () => {
    const c = new ApiClient({ baseUrl: "https://api.example.com" });
    const u = c.url("/api/v1/events", {
      cursor: undefined,
      event_type: "regulatory_approval",
      company: "",
      q: "sun pharma & co",
      limit: 25,
    });
    expect(u).toBe(
      "https://api.example.com/api/v1/events?event_type=regulatory_approval&q=sun+pharma+%26+co&limit=25",
    );
  });

  it("encodes path segments for entity lookups", async () => {
    const { fetchImpl, calls } = stubFetch((call) => {
      if (call.url.includes("/api/v1/trials/")) {
        return jsonResponse({
          id: "t1",
          registry: "CTRI",
          registryTrialId: "CTRI/2024/01/061234",
          title: "Demo trial",
          phase: "Phase 3",
          status: "Recruiting",
          sourceUrl: "https://example.com",
          drugIds: [],
          indications: [],
        });
      }
      return jsonResponse({ status: "ok", service: "x", milestone: 1 });
    });
    const { client } = makeClient(fetchImpl);
    await client.getTrial("ClinicalTrials.gov", "CTRI/2024/01/061234");
    expect(calls[0].url).toBe(
      "https://api.example.com/api/v1/trials/ClinicalTrials.gov/CTRI%2F2024%2F01%2F061234",
    );
  });
});

describe("session cookie plumbing", () => {
  it("extracts the session token from a single Set-Cookie header", () => {
    expect(extractSessionToken("bc_session=abc123; Path=/; HttpOnly")).toBe("abc123");
  });

  it("extracts the token when multiple cookies are comma-joined", () => {
    expect(
      extractSessionToken("other=x; Path=/, bc_session=tok%3D123; Path=/; HttpOnly"),
    ).toBe("tok=123");
  });

  it("returns null when the header is missing or has no session cookie", () => {
    expect(extractSessionToken(null)).toBeNull();
    expect(extractSessionToken("other=x; Path=/")).toBeNull();
    expect(extractSessionToken("bc_session=; Path=/")).toBeNull();
  });

  it("builds the Cookie request header", () => {
    expect(buildCookieHeader("abc 123")).toBe("bc_session=abc%20123");
  });

  it("stores the token on sign-in and re-attaches it on later requests", async () => {
    const { fetchImpl, calls } = stubFetch((call) => {
      if (call.url.endsWith("/api/v1/auth/signin")) {
        return jsonResponse({ user: demoUser }, 200, {
          "set-cookie": "bc_session=s3cret-token; Path=/; HttpOnly",
        });
      }
      return jsonResponse({ items: [], nextCursor: null });
    });
    const { client, storage } = makeClient(fetchImpl);

    const user = await client.signIn("ada@example.com", "password123");
    expect(user.email).toBe("ada@example.com");
    expect(await storage.getItem("biocatalyst.sessionToken")).toBe("s3cret-token");
    expect(await client.getSessionToken()).toBe("s3cret-token");

    await client.listEvents();
    const authed = calls.find((c) => c.url.endsWith("/api/v1/events"));
    expect((authed!.init.headers as Record<string, string>)["Cookie"]).toBe(
      "bc_session=s3cret-token",
    );
  });

  it("sign-up captures the session cookie like sign-in", async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse({ user: demoUser }, 201, {
        "set-cookie": "bc_session=new-user-token; Path=/",
      }),
    );
    const { client, storage } = makeClient(fetchImpl);
    await client.signUp("ada@example.com", "password123");
    expect(await storage.getItem("biocatalyst.sessionToken")).toBe("new-user-token");
  });

  it("sign-out posts to the API and clears the token even on failure", async () => {
    const { fetchImpl, calls } = stubFetch(() => {
      throw new Error("connection reset");
    });
    const { client, storage } = makeClient(fetchImpl);
    await storage.setItem("biocatalyst.sessionToken", "old");
    await expect(client.signOut()).resolves.toBeUndefined();
    expect(calls[0].url).toContain("/api/v1/auth/signout");
    expect(await client.getSessionToken()).toBeNull();
  });

  it("getSession returns { user: null } on 401 instead of throwing", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ user: null }, 401));
    const { client } = makeClient(fetchImpl);
    await expect(client.getSession()).resolves.toEqual({ user: null });
  });

  it("getSession returns the user when a live session exists", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ user: demoUser }));
    const { client } = makeClient(fetchImpl);
    await expect(client.getSession()).resolves.toEqual({ user: demoUser });
  });
});

describe("error mapping", () => {
  it("maps status codes to typed ApiErrors with server messages", async () => {
    const cases: Array<[number, string, string]> = [
      [400, "validation", "bad input"],
      [401, "unauthorized", "authentication required"],
      [403, "forbidden", "admins only"],
      [404, "not_found", "event not found"],
      [409, "conflict", "already exists"],
      [422, "validation", "weak password"],
      [429, "rate_limited", "too many requests"],
      [500, "server", "boom"],
    ];
    for (const [status, code, message] of cases) {
      const { fetchImpl } = stubFetch(() => jsonResponse({ error: message }, status));
      const { client } = makeClient(fetchImpl);
      const err = await client.listEvents().catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(status);
      expect(err.code).toBe(code);
      expect(err.message).toBe(message);
      expect(err.body).toEqual({ error: message });
    }
  });

  it("exposes isUnauthorized/isNotFound helpers", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ error: "nope" }, 401));
    const { client } = makeClient(fetchImpl);
    const err = (await client.listWatchlist().catch((e) => e)) as ApiError;
    expect(err.isUnauthorized).toBe(true);
    expect(err.isNotFound).toBe(false);
  });

  it("maps transport failures to status-0 network errors", async () => {
    const { fetchImpl } = stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const { client } = makeClient(fetchImpl);
    const err = (await client.health().catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.code).toBe("network");
    expect(err.message).toContain("fetch failed");
  });

  it("falls back gracefully on non-JSON error bodies", async () => {
    const { fetchImpl } = stubFetch(
      () => new Response("<html>proxy error</html>", { status: 502 }),
    );
    const { client } = makeClient(fetchImpl);
    const err = (await client.health().catch((e) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.code).toBe("server");
    expect(err.message).toContain("502");
  });
});

describe("response validation", () => {
  it("rejects malformed event payloads with invalid_response", async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse({ items: [{ id: "x" }], nextCursor: null }),
    );
    const { client } = makeClient(fetchImpl);
    const err = (await client.listEvents().catch((e) => e)) as ApiError;
    expect(err.code).toBe("invalid_response");
  });

  it("accepts a valid events page and returns typed items", async () => {
    const { fetchImpl, calls } = stubFetch(() =>
      jsonResponse({ items: [demoEventCard], nextCursor: "cursor-1" }),
    );
    const { client } = makeClient(fetchImpl);
    const page = await client.listEvents({
      eventType: "regulatory_approval",
      cursor: "cursor-0",
      limit: 10,
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].headline).toBe("Demo headline");
    expect(page.nextCursor).toBe("cursor-1");
    expect(calls[0].url).toContain("event_type=regulatory_approval");
    expect(calls[0].url).toContain("cursor=cursor-0");
    expect(calls[0].url).toContain("limit=10");
  });

  it("validates search results", async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse({
        companies: [{ id: "c1", slug: "demo", canonicalName: "Demo" }],
        drugs: [],
        trials: [],
        events: [],
      }),
    );
    const { client } = makeClient(fetchImpl);
    const r = await client.search("demo");
    expect(r.companies[0].slug).toBe("demo");
  });

  it("validates watchlist items", async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse({
        items: [
          {
            entityType: "company",
            entityId: "11111111-1111-4111-8111-111111111111",
            createdAt: "2026-09-30T00:00:00.000Z",
            name: "Demo",
            href: "/companies/demo",
          },
        ],
      }),
    );
    const { client } = makeClient(fetchImpl);
    const w = await client.listWatchlist();
    expect(w.items[0].entityType).toBe("company");
  });

  it("validates alerts with unread count", async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse({
        items: [
          {
            id: "a1",
            eventId: "e1",
            channel: "in_app",
            status: "sent",
            readAt: null,
            createdAt: "2026-09-30T00:00:00.000Z",
            headline: "H",
            eventType: "regulatory_approval",
            href: "/events/e1",
          },
        ],
        unreadCount: 1,
      }),
    );
    const { client } = makeClient(fetchImpl);
    const a = await client.listAlerts();
    expect(a.unreadCount).toBe(1);
    expect(a.items[0].readAt).toBeNull();
  });
});

describe("watchlist mutations", () => {
  it("posts follow with snake_case fields and validates the response", async () => {
    const { fetchImpl, calls } = stubFetch(() =>
      jsonResponse(
        {
          entityType: "drug",
          entityId: "11111111-1111-4111-8111-111111111111",
          createdAt: "2026-09-30T00:00:00.000Z",
        },
        201,
      ),
    );
    const { client } = makeClient(fetchImpl);
    const item = await client.follow("drug", "11111111-1111-4111-8111-111111111111");
    expect(item.entityType).toBe("drug");
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent).toEqual({
      entity_type: "drug",
      entity_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(calls[0].init.method).toBe("POST");
  });

  it("treats 204 unfollow as success with no body", async () => {
    const { fetchImpl, calls } = stubFetch(() => new Response(null, { status: 204 }));
    const { client } = makeClient(fetchImpl);
    await expect(
      client.unfollow("company", "11111111-1111-4111-8111-111111111111"),
    ).resolves.toBeUndefined();
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toContain("/api/v1/watchlist/company/");
  });
});

describe("push-token registration stub", () => {
  it("reports registered:false when the backend has no push endpoint (404)", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ error: "not found" }, 404));
    const { client } = makeClient(fetchImpl);
    await expect(client.registerPushToken("ExponentPushToken[abc]")).resolves.toEqual({
      registered: false,
    });
  });

  it("reports registered:true when the backend accepts the token", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchImpl);
    await expect(client.registerPushToken("ExponentPushToken[abc]")).resolves.toEqual({
      registered: true,
    });
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent.token).toBe("ExponentPushToken[abc]");
  });
});

describe("in-memory token storage", () => {
  it("round-trips values", async () => {
    const s = createInMemoryTokenStorage();
    expect(await s.getItem("k")).toBeNull();
    await s.setItem("k", "v");
    expect(await s.getItem("k")).toBe("v");
    await s.removeItem("k");
    expect(await s.getItem("k")).toBeNull();
  });
});

describe("fetch wiring", () => {
  it("uses the injected fetch implementation (spy-friendly)", async () => {
    const spy = vi.fn(async () => jsonResponse({ status: "ok" }));
    const { client } = makeClient(spy as unknown as typeof fetch);
    await client.health();
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/api/healthz");
    expect((init.headers as Record<string, string>)["Accept"]).toBe("application/json");
  });
});

describe("patents", () => {
  const patentItem = {
    patentNumber: "7625884",
    applNo: "020610",
    productNo: "001",
    tradeName: "LIPITOR",
    applicant: "PFIZER INC",
    activeIngredient: "ATORVASTATIN CALCIUM",
    expiryDate: "2026-08-24",
    drugSubstanceFlag: false,
    drugProductFlag: true,
    delisted: false,
  };

  it("listPatentExpiries validates stats + items and passes within", async () => {
    const { fetchImpl, calls } = stubFetch(() =>
      jsonResponse({
        stats: { total: 17654, withExpiry: 17654, delisted: 126, expiringWithinYear: 1857, resolvedCompanies: 27 },
        items: [{ ...patentItem, daysToExpiry: 30, company: { slug: "pfizer", canonicalName: "Pfizer Inc" } }],
      }),
    );
    const { client } = makeClient(fetchImpl);
    const r = await client.listPatentExpiries(90);
    expect(r.stats.expiringWithinYear).toBe(1857);
    expect(r.items[0].patentNumber).toBe("7625884");
    expect(r.items[0].daysToExpiry).toBe(30);
    expect(r.items[0].company?.slug).toBe("pfizer");
    expect(calls[0].url).toContain("/api/v1/patents");
    expect(calls[0].url).toContain("within=90");
  });

  it("getCompanyPatents hits the per-company route", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ items: [patentItem] }));
    const { client } = makeClient(fetchImpl);
    const r = await client.getCompanyPatents("pfizer");
    expect(r.items).toHaveLength(1);
    expect(r.items[0].tradeName).toBe("LIPITOR");
    expect(calls[0].url).toContain("/api/v1/companies/pfizer/patents");
  });

  it("rejects malformed patent payloads with invalid_response", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ items: [{ patentNumber: 123 }] }));
    const { client } = makeClient(fetchImpl);
    const err = (await client.getCompanyPatents("x").catch((e) => e)) as ApiError;
    expect(err.code).toBe("invalid_response");
  });
});
