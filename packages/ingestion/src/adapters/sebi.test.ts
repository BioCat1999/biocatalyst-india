import { describe, expect, it, vi } from "vitest";
import { SebiRssAdapter } from "./sebi.js";

const FEED = `<?xml version="1.0"?><rss><channel>
  <item><title>Order in the matter of Cipla Limited</title>
  <description>Final order concerning Cipla Limited</description>
  <link>https://www.sebi.gov.in/enforcement/orders/oct-2026/cipla-order.html</link>
  <pubDate>16 Oct, 2026 +0530</pubDate></item>
  <item><title>General market circular</title>
  <description>No tracked issuer</description>
  <link>https://www.sebi.gov.in/legal/circulars/oct-2026/general.html</link>
  <pubDate>16 Oct, 2026 +0530</pubDate></item>
</channel></rss>`;

describe("SebiRssAdapter", () => {
  it("keeps only official actions that resolve to a tracked company", async () => {
    const fetchImpl = vi.fn(async () => new Response(FEED, { status: 200 })) as unknown as typeof fetch;
    const adapter = new SebiRssAdapter(fetchImpl);
    const docs = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    expect(docs).toHaveLength(1);
    const [candidate] = await adapter.normalize(docs[0]);
    expect(candidate.eventType).toBe("securities_regulatory_action");
    expect(candidate.companyNames).toEqual(["Cipla Ltd"]);
    expect(candidate.isPrimary).toBe(true);
  });
});
