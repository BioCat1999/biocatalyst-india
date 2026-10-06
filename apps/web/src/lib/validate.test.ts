import { describe, expect, it } from "vitest";
import {
  eventsQuerySchema,
  parseQuery,
  registrySchema,
  resolveQuerySchema,
  searchQuerySchema,
  slugSchema,
} from "./validate";

function params(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

describe("eventsQuerySchema", () => {
  it("accepts a full valid query and coerces limit", () => {
    const r = parseQuery(
      eventsQuerySchema,
      params({
        event_type: "regulatory_approval",
        company: "some-uuid",
        phase: "Phase 3",
        indication: "psoriasis",
        from: "2026-09-01T00:00:00Z",
        to: "2026-10-01T00:00:00Z",
        limit: "25",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.event_type).toBe("regulatory_approval");
      expect(r.data.limit).toBe(25);
    }
  });

  it("defaults limit to 10 and rejects unknown event_type / bad limit", () => {
    const ok = parseQuery(eventsQuerySchema, params({}));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.limit).toBe(10);

    expect(parseQuery(eventsQuerySchema, params({ event_type: "moonshot" })).ok).toBe(false);
    expect(parseQuery(eventsQuerySchema, params({ limit: "999" })).ok).toBe(false);
    expect(parseQuery(eventsQuerySchema, params({ limit: "abc" })).ok).toBe(false);
    expect(parseQuery(eventsQuerySchema, params({ from: "not-a-date" })).ok).toBe(false);
    expect(parseQuery(eventsQuerySchema, params({ phase: "Phase 9" })).ok).toBe(false);
  });
});

describe("searchQuerySchema", () => {
  it("requires a non-blank q of bounded length", () => {
    expect(parseQuery(searchQuerySchema, params({ q: "sun" })).ok).toBe(true);
    expect(parseQuery(searchQuerySchema, params({ q: "   " })).ok).toBe(false);
    expect(parseQuery(searchQuerySchema, params({})).ok).toBe(false);
    expect(parseQuery(searchQuerySchema, params({ q: "x".repeat(201) })).ok).toBe(false);
  });
});

describe("path params", () => {
  it("validates slugs, registries, and resolve queries", () => {
    expect(slugSchema.safeParse("sun-pharma").success).toBe(true);
    expect(slugSchema.safeParse("../etc").success).toBe(false);
    expect(registrySchema.safeParse("CTRI").success).toBe(true);
    expect(registrySchema.safeParse("FDA").success).toBe(false);
    const good = parseQuery(
      resolveQuerySchema,
      params({
        entity_type: "company",
        entity_id: "123e4567-e89b-12d3-a456-426614174000",
      }),
    );
    expect(good.ok).toBe(true);
    expect(
      parseQuery(
        resolveQuerySchema,
        params({ entity_type: "company", entity_id: "not-a-uuid" }),
      ).ok,
    ).toBe(false);
  });
});
