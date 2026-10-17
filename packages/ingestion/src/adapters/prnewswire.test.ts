/**
 * Tests for the PR Newswire wire adapter.
 *
 * The network is stubbed via an injected `fetch` — no network in tests.
 * Fixture XML mirrors the live feed shape observed on 2026-10-07 (RSS 2.0,
 * CDATA titles/descriptions, RFC-2822 pubDates, per-item language tag).
 * Fixture headlines/descriptions are paraphrases, not copied releases.
 */
import { describe, expect, it, vi } from "vitest";
import {
  PrNewswireAdapter,
  PRNEWSWIRE_FEEDS,
  PRNEWSWIRE_SOURCE_NAME,
  attributeCompany,
  itemLanguage,
} from "./prnewswire.js";

const FEEDS = [
  "https://www.prnewswire.com/rss/health-latest-news/pharmaceuticals-list.rss",
  "https://www.prnewswire.com/rss/health-latest-news/clinical-trials-medical-discoveries-list.rss",
];

function feedXml(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<title>PR Newswire category feed</title>
${items}
</channel></rss>`;
}

function itemXml(title: string, link: string, pubDate: string, desc = "", lang = "en-US"): string {
  return (
    `<item><title><![CDATA[${title}]]></title><link>${link}</link>` +
    `<pubDate>${pubDate}</pubDate><description><![CDATA[${desc}]]></description>` +
    `<language>${lang}</language></item>`
  );
}

/** Stub fetch serving `xmlByFeed` keyed by URL substring; 404 otherwise. */
function stubFetch(xmlByFeed: Record<string, string>) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    for (const [needle, xml] of Object.entries(xmlByFeed)) {
      if (u.includes(needle)) return new Response(xml, { status: 200 });
    }
    return new Response("nope", { status: 404 });
  }) as unknown as typeof fetch;
}

const LEQSELVI_ITEM = itemXml(
  "Two-year data for a deuruxolitinib alopecia treatment showed sustained efficacy and safety at a dermatology congress",
  "https://www.prnewswire.com/news-releases/leqselvi-two-year-data-302900001.html",
  "Wed, 07 Oct 2026 12:00:00 +0000",
  "MUMBAI, India /PRNewswire/ -- Sun Pharmaceutical Industries Ltd today announced two-year results from its severe alopecia areata program.",
);

describe("itemLanguage", () => {
  it("extracts the per-item language tag", () => {
    expect(itemLanguage(`<item><language>en-US</language></item>`)).toBe("en-us");
    expect(itemLanguage(`<item><dc:language>de</dc:language></item>`)).toBe("de");
    expect(itemLanguage(`<item><title>x</title></item>`)).toBeNull();
  });
});

describe("attributeCompany", () => {
  it("matches a company named in the headline", () => {
    expect(attributeCompany("Sun Pharma announces USFDA approval for a new treatment", "")).toEqual({
      company: "Sun Pharmaceutical Industries Ltd",
      viaTitle: true,
    });
  });

  it("falls back to the body opening, where wire releases name the issuer", () => {
    // The real LEQSELVI-class headline names no company; the issuer is
    // in the dateline. Without this fallback the adapter drops exactly
    // the releases it exists to catch.
    expect(
      attributeCompany(
        "Two-year data showed sustained efficacy and safety at a dermatology congress",
        "MUMBAI /PRNewswire/ -- Sun Pharmaceutical Industries Ltd today announced results.",
      ),
    ).toEqual({ company: "Sun Pharmaceutical Industries Ltd", viaTitle: false });
  });

  it("returns null when no tracked company is named", () => {
    expect(attributeCompany("Untracked Biotech announces Phase 1 results", "Some other company said things.")).toBeNull();
  });

  it("does not substring-match short keys inside ordinary words (live 2026-10-07)", () => {
    // "Supporting" contains `ortin`; "Single" and "single-ascending"
    // contain `ngl`. Plain substring matching attributed all three to
    // tracked companies in the first live smoke run.
    expect(
      attributeCompany("Celltaxis announces publication of clinical data supporting its novel therapy", ""),
    ).toBeNull();
    expect(attributeCompany("10x Genomics announces collaboration to advance single cell applications", "")).toBeNull();
    expect(
      attributeCompany(
        "Dignify Therapeutics advances into clinic with FDA clearance of an IND",
        "A single-ascending-dose study is expected to begin dosing healthy volunteers.",
      ),
    ).toBeNull();
  });
});

describe("PrNewswireAdapter.fetchSince", () => {
  it("keeps tracked-company items newer than the cursor and advances it", async () => {
    const xml = feedXml(
      itemXml(
        "Sun Pharma announces USFDA approval for a psoriasis treatment",
        "https://www.prnewswire.com/news-releases/sun-approval-302900002.html",
        "Tue, 06 Oct 2026 09:00:00 +0000",
      ) +
        itemXml(
          "Cipla reports quarterly earnings for the second quarter",
          "https://www.prnewswire.com/news-releases/cipla-earnings-302900003.html",
          "Sat, 03 Oct 2026 09:00:00 +0000",
        ),
    );
    const adapter = new PrNewswireAdapter(stubFetch({ "pharmaceuticals-list.rss": xml }), [FEEDS[0]]);
    const docs = await adapter.fetchSince("2026-10-05T00:00:00.000Z");
    // The Cipla item predates the cursor; only the Sun item survives.
    expect(docs).toHaveLength(1);
    expect(docs[0].sourceName).toBe(PRNEWSWIRE_SOURCE_NAME);
    expect(docs[0].publishedAt).toBe("2026-10-06T09:00:00.000Z");
    expect(adapter.getNextCursor()).toBe("2026-10-06T09:00:00.000Z");
  });

  it("drops items naming no tracked company and non-English items", async () => {
    const xml = feedXml(
      itemXml(
        "Untracked Biotech announces Phase 2 results with strong efficacy data",
        "https://www.prnewswire.com/news-releases/untracked-302900004.html",
        "Wed, 07 Oct 2026 09:00:00 +0000",
      ) +
        itemXml(
          "Sun Pharma gibt neue Studiendaten bekannt",
          "https://www.prnewswire.com/news-releases/sun-de-302900005.html",
          "Wed, 07 Oct 2026 10:00:00 +0000",
          "MÜNCHEN /PRNewswire/ -- Sun Pharmaceutical Industries Ltd gab heute Daten bekannt.",
          "de",
        ),
    );
    const adapter = new PrNewswireAdapter(stubFetch({ "pharmaceuticals-list.rss": xml }), [FEEDS[0]]);
    expect(await adapter.fetchSince("")).toHaveLength(0);
  });

  it("dedupes the same release carried by both category feeds", async () => {
    const xml = feedXml(LEQSELVI_ITEM);
    const adapter = new PrNewswireAdapter(
      stubFetch({ "pharmaceuticals-list.rss": xml, "clinical-trials-medical-discoveries-list.rss": xml }),
      FEEDS,
    );
    const docs = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    expect(docs).toHaveLength(1);
  });

  it("skips a failed feed but throws when every feed fails", async () => {
    const failing = vi.fn(async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(new PrNewswireAdapter(failing, FEEDS).fetchSince("")).rejects.toThrow();

    const adapter = new PrNewswireAdapter(
      stubFetch({ "pharmaceuticals-list.rss": feedXml(LEQSELVI_ITEM) }),
      FEEDS,
    );
    expect(await adapter.fetchSince("2026-10-01T00:00:00.000Z")).toHaveLength(1);
  });
});

describe("PrNewswireAdapter.normalize", () => {
  it("attributes a body-named issuer and classifies long-term congress data", async () => {
    const adapter = new PrNewswireAdapter(
      stubFetch({ "pharmaceuticals-list.rss": feedXml(LEQSELVI_ITEM) }),
      [FEEDS[0]],
    );
    const [doc] = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    const [c] = await adapter.normalize(doc);
    expect(c.companyNames).toEqual(["Sun Pharmaceutical Industries Ltd"]);
    expect(c.eventType).toBe("clinical_trial_result");
    expect(c.isPrimary).toBe(true);
    expect(c.publisher).toBe("PR Newswire");
    // Not an approval → review-gate confidence, like press-rss.
    expect(c.confidence).toBe(0.8);
  });

  it("gives headline-attributed regulator approvals auto-publish confidence", async () => {
    const xml = feedXml(
      itemXml(
        "Sun Pharma announces USFDA approval for a psoriasis treatment",
        "https://www.prnewswire.com/news-releases/sun-approval-302900002.html",
        "Tue, 06 Oct 2026 09:00:00 +0000",
      ),
    );
    const adapter = new PrNewswireAdapter(stubFetch({ "pharmaceuticals-list.rss": xml }), [FEEDS[0]]);
    const [doc] = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    const [c] = await adapter.normalize(doc);
    expect(c.eventType).toBe("regulatory_approval");
    expect(c.confidence).toBe(0.9);
  });

  it("keeps body-attributed approvals in the review queue", async () => {
    // Attribution from the body is heuristic — it must not auto-publish
    // even when the headline classifies as a regulatory approval.
    const xml = feedXml(
      itemXml(
        "USFDA approval granted for a new psoriasis treatment",
        "https://www.prnewswire.com/news-releases/body-approval-302900006.html",
        "Wed, 07 Oct 2026 09:00:00 +0000",
        "MUMBAI /PRNewswire/ -- Sun Pharmaceutical Industries Ltd today announced the approval.",
      ),
    );
    const adapter = new PrNewswireAdapter(stubFetch({ "pharmaceuticals-list.rss": xml }), [FEEDS[0]]);
    const [doc] = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    const [c] = await adapter.normalize(doc);
    expect(c.companyNames).toEqual(["Sun Pharmaceutical Industries Ltd"]);
    expect(c.eventType).toBe("regulatory_approval");
    expect(c.confidence).toBe(0.8);
  });

  it("emits null eventType for tracked-company non-catalysts so the runner drops them", async () => {
    const xml = feedXml(
      itemXml(
        "Cipla reports quarterly earnings for the second quarter",
        "https://www.prnewswire.com/news-releases/cipla-earnings-302900003.html",
        "Wed, 07 Oct 2026 09:00:00 +0000",
      ),
    );
    const adapter = new PrNewswireAdapter(stubFetch({ "pharmaceuticals-list.rss": xml }), [FEEDS[0]]);
    const [doc] = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    const [c] = await adapter.normalize(doc);
    expect(c.companyNames).toEqual(["Cipla Ltd"]);
    expect(c.eventType).toBeNull();
  });

  it("ships the two verified category feeds by default", () => {
    expect(PRNEWSWIRE_FEEDS).toEqual([
      "https://www.prnewswire.com/rss/health-latest-news/pharmaceuticals-list.rss",
      "https://www.prnewswire.com/rss/health-latest-news/clinical-trials-medical-discoveries-list.rss",
    ]);
  });
});
