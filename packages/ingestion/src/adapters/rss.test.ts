/**
 * Tests for the press-release RSS adapter.
 *
 * The network is stubbed via an injected `fetch` — no network in tests.
 * Fixture XML mirrors the real Sun Pharma feed shape observed on
 * 2026-10-02 (RSS 2.0, CDATA titles, RFC-2822 pubDates).
 */
import { describe, expect, it, vi } from "vitest";
import {
  PressRssAdapter,
  PRESS_RSS_SOURCE_NAME,
  classifyPressRelease,
  cleanText,
  parseRss,
  type PressFeed,
} from "./rss.js";

const FEED: PressFeed = {
  companyName: "Sun Pharmaceutical Industries Ltd",
  publisher: "Sun Pharma",
  feedUrl: "https://www.sunpharma.com/feed/",
};

function feedXml(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<title>Sun Pharmaceutical Industries Ltd.</title>
<link>https://www.sunpharma.com</link>
${items}
</channel></rss>`;
}

function itemXml(title: string, link: string, pubDate: string, desc = ""): string {
  return `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${pubDate}</pubDate><description>${desc}</description></item>`;
}

function stubFetch(xml: string) {
  return vi.fn(async () => new Response(xml, { status: 200 }));
}

describe("parseRss", () => {
  it("parses items with CDATA titles and RFC-2822 dates", () => {
    const xml = feedXml(
      itemXml(
        "Sun Pharma and LIB Therapeutics announce global licensing agreement for Lerodalcibep",
        "https://www.sunpharma.com/press/lerodalcibep/",
        "Wed, 30 Sep 2026 08:26:53 +0000",
        "<p>Details here</p>",
      ),
    );
    const items = parseRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe(
      "Sun Pharma and LIB Therapeutics announce global licensing agreement for Lerodalcibep",
    );
    expect(items[0].link).toBe("https://www.sunpharma.com/press/lerodalcibep/");
    expect(items[0].pubDate).toBe("2026-09-30T08:26:53.000Z");
    expect(items[0].description).toBe("Details here");
  });

  it("skips items missing a title or link", () => {
    const xml = feedXml(
      `<item><title>no link here</title></item>` +
        itemXml("Good one", "https://www.sunpharma.com/press/ok/", "Wed, 30 Sep 2026 08:26:53 +0000"),
    );
    expect(parseRss(xml)).toHaveLength(1);
  });

  it("handles Atom entries with href links", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Atom title</title><link href="https://example.com/a"/><updated>2026-09-29T10:00:00Z</updated></entry>
</feed>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe("https://example.com/a");
    expect(items[0].pubDate).toBe("2026-09-29T10:00:00.000Z");
  });
});

describe("cleanText", () => {
  it("unwraps CDATA and decodes entities", () => {
    expect(cleanText("<![CDATA[Sun Pharma &amp; Co]]>")).toBe("Sun Pharma & Co");
    expect(cleanText("<p>Hello&nbsp;world</p>")).toBe("Hello world");
  });
});

describe("classifyPressRelease", () => {
  it("maps approval announcements with a regulator", () => {
    expect(classifyPressRelease("Sun Pharma announces USFDA approval for new psoriasis drug")).toBe(
      "regulatory_approval",
    );
  });
  it("does not map bare board approvals", () => {
    expect(classifyPressRelease("Board approves dividend for FY27")).toBeNull();
  });
  it("maps partnerships, trial results, launches, submissions, M&A", () => {
    expect(
      classifyPressRelease("Sun Pharma and LIB Therapeutics announce global licensing agreement"),
    ).toBe("licensing_or_partnership");
    expect(
      classifyPressRelease("Phase 3 trial results show significant efficacy in psoriasis patients"),
    ).toBe("clinical_trial_result");
    expect(classifyPressRelease("Sun Pharma Launches CTaro-Methylphenidate ER")).toBe(
      "company_pipeline_update",
    );
    expect(classifyPressRelease("Sun Pharma files NDA for novel dermatology molecule")).toBe(
      "regulatory_submission",
    );
    expect(classifyPressRelease("Sun Pharma completes acquisition of dermatology portfolio")).toBe(
      "acquisition_or_divestiture",
    );
  });
  it("returns null for earnings and other non-catalysts", () => {
    expect(classifyPressRelease("Sun Pharma reports Q1FY27 results")).toBeNull();
    expect(classifyPressRelease("Sun Pharma appoints new CFO")).toBeNull();
  });
  it("maps long-term / congress data readouts without a phase keyword", () => {
    // Real headline, 2026-10-01: previously returned null (dropped by runner).
    expect(
      classifyPressRelease(
        "New LEQSELVI (deuruxolitinib) Two-Year Data in Severe Alopecia Areata Showed Sustained Efficacy and Safety at EADV Congress 2026",
      ),
    ).toBe("clinical_trial_result");
    expect(
      classifyPressRelease(
        "Open-label extension study demonstrates long-term safety over two years of treatment",
      ),
    ).toBe("clinical_trial_result");
  });
  it("still drops long-term phrasing without data readouts", () => {
    expect(
      classifyPressRelease("Sun Pharma shares long-term growth outlook at investor day"),
    ).toBeNull();
  });
});

describe("PressRssAdapter", () => {
  it("emits docs only for items newer than the cursor", async () => {
    const xml = feedXml(
      itemXml("Old news", "https://www.sunpharma.com/press/old/", "Mon, 01 Sep 2026 00:00:00 +0000") +
        itemXml("New approval news", "https://www.sunpharma.com/press/new/", "Wed, 30 Sep 2026 08:26:53 +0000"),
    );
    const adapter = new PressRssAdapter(stubFetch(xml), [FEED]);
    const docs = await adapter.fetchSince("2026-09-15T00:00:00.000Z");
    expect(docs).toHaveLength(1);
    expect(docs[0].canonicalUrl).toBe("https://www.sunpharma.com/press/new/");
    expect(docs[0].publishedAt).toBe("2026-09-30T08:26:53.000Z");
    expect(adapter.getNextCursor()).toBe("2026-09-30T08:26:53.000Z");
  });

  it("normalizes a press item to a primary-source candidate", async () => {
    const xml = feedXml(
      itemXml(
        "Sun Pharma announces USFDA approval for psoriasis treatment",
        "https://www.sunpharma.com/press/approval/",
        "Wed, 30 Sep 2026 08:26:53 +0000",
      ),
    );
    const adapter = new PressRssAdapter(stubFetch(xml), [FEED]);
    const [doc] = await adapter.fetchSince("");
    const [c] = await adapter.normalize(doc);
    expect(c.sourceName).toBe(PRESS_RSS_SOURCE_NAME);
    expect(c.eventType).toBe("regulatory_approval");
    expect(c.companyNames).toEqual(["Sun Pharmaceutical Industries Ltd"]);
    expect(c.isPrimary).toBe(true);
    expect(c.confidence).toBe(0.9);
    expect(c.headline).toContain("USFDA approval");
  });

  it("gives non-approval items review-gate confidence", async () => {
    const xml = feedXml(
      itemXml(
        "Sun Pharma Launches CTaro-Methylphenidate ER",
        "https://www.sunpharma.com/press/launch/",
        "Wed, 30 Sep 2026 08:26:53 +0000",
      ),
    );
    const adapter = new PressRssAdapter(stubFetch(xml), [FEED]);
    const [doc] = await adapter.fetchSince("");
    const [c] = await adapter.normalize(doc);
    expect(c.eventType).toBe("company_pipeline_update");
    expect(c.confidence).toBe(0.8);
  });

  it("emits null eventType for non-catalyst items so the runner drops them", async () => {
    const xml = feedXml(
      itemXml("Sun Pharma reports Q1FY27 results", "https://www.sunpharma.com/press/q1/", "Wed, 30 Sep 2026 08:26:53 +0000"),
    );
    const adapter = new PressRssAdapter(stubFetch(xml), [FEED]);
    const [doc] = await adapter.fetchSince("");
    const [c] = await adapter.normalize(doc);
    expect(c.eventType).toBeNull();
  });

  it("skips a failed feed but throws when every feed fails", async () => {
    // 404 is non-transient: fetchText throws on the first attempt (no
    // retry backoff), keeping this test fast.
    const failing = vi.fn(async () => new Response("nope", { status: 404 }));
    const adapter = new PressRssAdapter(failing, [FEED]);
    await expect(adapter.fetchSince("")).rejects.toThrow();

    const okXml = feedXml(
      itemXml("Good", "https://www.sunpharma.com/press/good/", "Wed, 30 Sep 2026 08:26:53 +0000"),
    );
    const mixed = new PressRssAdapter(
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes("bad.example.com")
          ? new Response("nope", { status: 404 })
          : new Response(okXml, { status: 200 }),
      ) as typeof fetch,
      [
        { ...FEED, feedUrl: "https://bad.example.com/feed/" },
        FEED,
      ],
    );
    const docs = await mixed.fetchSince("");
    expect(docs).toHaveLength(1);
  });
});
