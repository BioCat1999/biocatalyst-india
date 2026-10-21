import { describe, expect, it, vi } from "vitest";
import { EmaRssAdapter, MhraRssAdapter, type RegulatoryFeed } from "./regulatory-rss.js";

const FEED = `<?xml version="1.0"?><rss><channel>
  <item><title>Medicine safety warning for patients</title>
  <description>New adverse-effect precautions apply.</description>
  <link>https://regulator.example/alerts/one</link>
  <pubDate>20 Oct 2026 08:00:00 +0000</pubDate></item>
</channel></rss>`;

describe("official regulatory RSS adapters", () => {
  it("normalizes an MHRA item as a primary safety signal", async () => {
    const fetchImpl = vi.fn(async () => new Response(FEED, { status: 200 })) as unknown as typeof fetch;
    const adapter = new MhraRssAdapter(fetchImpl);
    const docs = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    const [candidate] = await adapter.normalize(docs[0]);
    expect(candidate.eventType).toBe("safety_signal");
    expect(candidate.publisher).toContain("Medicines and Healthcare");
    expect(candidate.companyNames).toEqual([]);
    expect(candidate.isPrimary).toBe(true);
  });

  it("keeps operating when one EMA feed fails", async () => {
    const feeds: RegulatoryFeed[] = [
      { url: "https://bad.example", publisher: "EMA", country: "EU", defaultEventType: "regulatory_approval" },
      { url: "https://good.example", publisher: "EMA", country: "EU", defaultEventType: "regulatory_approval" },
    ];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("bad")) return new Response("bad", { status: 404 });
      return new Response(FEED, { status: 200 });
    }) as unknown as typeof fetch;
    const adapter = new EmaRssAdapter(fetchImpl, feeds);
    const docs = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    expect(docs).toHaveLength(1);
  });
});
