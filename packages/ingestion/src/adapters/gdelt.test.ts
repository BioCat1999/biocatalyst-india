/**
 * Tests for the GDELT live adapter.
 *
 * The API is stubbed via an injected `fetch` — no network in tests. Fixture
 * payloads mirror the real DOC 2.0 artlist shape observed on 2026-10-01
 * (`url`, `title`, `seendate` as "YYYYMMDDHHMMSSZ", `domain`, `language`,
 * `sourcecountry`).
 */
import { describe, expect, it, vi } from "vitest";
import { GdeltAdapter, GDELT_SOURCE_NAME, classifyNews, parseSeendate, type GdeltArticle } from "./gdelt.js";

function article(overrides: Record<string, unknown> = {}): GdeltArticle {
  return {
    url: "https://www.moneycontrol.com/news/business/sun-pharma-q2-results-12345.html",
    title: "Sun Pharma Q2 results beat estimates on strong India sales",
    seendate: "20260925T064500Z",
    domain: "moneycontrol.com",
    language: "English",
    sourcecountry: "India",
    ...overrides,
  };
}

function docOf(a: GdeltArticle) {
  return {
    sourceName: GDELT_SOURCE_NAME,
    canonicalUrl: "https://www.moneycontrol.com/news/business/sun-pharma-q2-results-12345.html",
    contentHash: "abc",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    publishedAt: "2026-09-25T06:45:00.000Z",
    raw: a,
  };
}

function stubFetch(articles: GdeltArticle[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ articles }),
  })) as unknown as typeof fetch;
}

describe("parseSeendate", () => {
  it("parses GDELT seendate to ISO", () => {
    expect(parseSeendate("20260925T064500Z")).toBe("2026-09-25T06:45:00.000Z");
  });
  it("returns null for malformed input", () => {
    expect(parseSeendate("yesterday")).toBeNull();
    expect(parseSeendate(null)).toBeNull();
  });
});

describe("GdeltAdapter.normalize", () => {
  it("keeps the headline verbatim and links the company", async () => {
    const adapter = new GdeltAdapter();
    const [c] = await adapter.normalize(docOf(article()));
    expect(c.headline).toBe("Sun Pharma Q2 results beat estimates on strong India sales");
    expect(c.companyNames).toEqual(["Sun Pharmaceutical Industries Ltd"]);
    expect(c.eventType).toBe("company_pipeline_update");
    expect(c.isPrimary).toBe(false);
    expect(c.occurredAt).toBe("2026-09-25T06:45:00.000Z");
    expect(c.publisher).toContain("moneycontrol.com");
  });

  it("classifies an approval headline as regulatory_approval", async () => {
    const adapter = new GdeltAdapter();
    const [c] = await adapter.normalize(
      docOf(article({ title: "FDA approves Biocon's biosimilar for rheumatoid arthritis" })),
    );
    expect(c.eventType).toBe("regulatory_approval");
    expect(c.companyNames).toEqual(["Biocon Ltd"]);
  });

  it("classifies a rejection headline before the approval rule", async () => {
    const adapter = new GdeltAdapter();
    const [c] = await adapter.normalize(
      docOf(article({ title: "Cipla fails to win FDA approval for generic Advair" })),
    );
    expect(c.eventType).toBe("regulatory_rejection_or_deficiency");
    expect(c.companyNames).toEqual(["Cipla Ltd"]);
  });

  it("classifies partnerships and trial readouts", async () => {
    const adapter = new GdeltAdapter();
    const [p] = await adapter.normalize(
      docOf(article({ title: "Lupin partners with global pharma for respiratory portfolio" })),
    );
    expect(p.eventType).toBe("licensing_or_partnership");
    const [t] = await adapter.normalize(
      docOf(article({ title: "Zydus reports Phase 3 trial results for Saroglitazar" })),
    );
    expect(t.eventType).toBe("clinical_trial_result");
    expect(t.drugNames).toEqual(["Saroglitazar"]);
  });

  it("drops articles whose title names no tracked company", async () => {
    const adapter = new GdeltAdapter();
    expect(await adapter.normalize(docOf(article({ title: "Pharma stocks rally on strong earnings" })))).toEqual([]);
  });
});

describe("GdeltAdapter.fetchSince", () => {
  it("keeps English title-matching articles newer than the cursor", async () => {
    const articles = [
      article(), // Sun Pharma, English, 2026-09-25 — kept
      article({
        url: "https://example.com/ipo-news",
        title: "IPO Rush: 50-plus firms file DRHPs", // no company in title — dropped
        seendate: "20261001T014500Z",
        domain: "economictimes.indiatimes.com",
      }),
      article({
        url: "https://example.com/hindi-news",
        title: "Sun Pharma ke Q2 nateeje", // non-English — dropped
        seendate: "20261001T014500Z",
        language: "Hindi",
        domain: "example.com",
      }),
      article({
        url: "https://example.com/old-news",
        title: "Biocon launches new insulin plant", // older than cursor — dropped
        seendate: "20260901T064500Z",
        domain: "example.com",
      }),
    ];
    const adapter = new GdeltAdapter(stubFetch(articles));
    const docs = await adapter.fetchSince("2026-09-20T00:00:00.000Z");
    expect(docs).toHaveLength(1);
    expect(docs[0].publishedAt).toBe("2026-09-25T06:45:00.000Z");
    expect(adapter.getNextCursor()).toBe("2026-09-25T06:45:00.000Z");
  });

  it("propagates API errors (runner records a failed run)", async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const adapter = new GdeltAdapter(failing as unknown as typeof fetch);
    await expect(adapter.fetchSince("2026-01-01T00:00:00.000Z")).rejects.toThrow("HTTP 500");
  }, 20000); // 3 attempts with backoff exceed the default 5s timeout
});

describe("classifyNews — IPO detection", () => {
  it("maps DRHP filings to ipo_filing", () => {
    expect(classifyNews("Claroid Pharmaceuticals files DRHP with SEBI for IPO")).toBe("ipo_filing");
  });
  it("maps price-band / issue-open news to ipo_filing", () => {
    expect(classifyNews("Symbiotec Pharmalab IPO: price band fixed, issue opens Monday")).toBe(
      "ipo_filing",
    );
  });
  it("maps listing-day news to ipo_listing", () => {
    expect(classifyNews("Injecto Polymers lists on NSE at 18% premium over IPO price")).toBe(
      "ipo_listing",
    );
    expect(classifyNews("Rubicon Research makes strong market debut, listing gains 22%")).toBe(
      "ipo_listing",
    );
  });
  it("prefers ipo_listing over ipo_filing when both match", () => {
    expect(classifyNews("IPO listing gains: Hindustan Laboratories lists on BSE")).toBe("ipo_listing");
  });
  it("still maps FDA approvals correctly (no IPO false positive)", () => {
    expect(classifyNews("Aurobindo Pharma gets USFDA approval for generic tablets")).toBe(
      "regulatory_approval",
    );
  });
});
