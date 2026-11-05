/**
 * Tests for the Drugs.com adapter. Item shape mirrors the live feeds
 * observed on 2026-11-05 (title, link, description opening with the
 * original release's dateline, RFC-2822 pubDate). No network.
 */
import { describe, expect, it, vi } from "vitest";
import { DrugsComAdapter, DRUGSCOM_FEEDS, DRUGSCOM_SOURCE_NAME } from "./drugscom.js";

function item(title: string, description: string, pubDate: string, slug: string): string {
  return `<item><title>${title}</title><link>https://www.drugs.com/newdrugs/${slug}.html</link><description>${description}</description><pubDate>${pubDate}</pubDate></item>`;
}

function feed(...items: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Drugs.com</title>${items.join("")}</channel></rss>`;
}

function stub(xml: string) {
  return vi.fn(async () => ({ ok: true, status: 200, text: async () => xml })) as unknown as typeof fetch;
}

const MODERNA = item(
  "FDA Approves Updated mNEXSPIKE COVID-19 Vaccine for the 2026-2027 Season",
  "CAMBRIDGE, Mass., Oct. 30, 2026 /BUSINESS WIRE/ -- Moderna, Inc. (NASDAQ: MRNA) today announced that the U.S. Food and Drug Administration has approved...",
  "Fri, 30 Oct 2026 21:00:00 +0000",
  "fda-approves-mnexspike-2026",
);
const GENENTECH = item(
  "Genentech’s Divarasib Demonstrated Best-In-Class Efficacy in Phase III Trial",
  "SOUTH SAN FRANCISCO, Calif., Oct. 20, 2026 -- Genentech, a member of the Roche Group...",
  "Tue, 20 Oct 2026 12:00:00 +0000",
  "genentech-divarasib",
);
const UNTRACKED = item(
  "FDA Grants Accelerated Approval to Voceryq for Recurrent Respiratory Papillomatosis",
  "PLYMOUTH MEETING, Pa., Oct. 30, 2026 /PRNewswire/ -- INOVIO (NASDAQ: INO), a biotechnology company...",
  "Fri, 30 Oct 2026 22:10:44 +0000",
  "voceryq",
);

describe("DrugsComAdapter", () => {
  it("polls the approval, application and trial feeds", () => {
    expect(DRUGSCOM_FEEDS).toHaveLength(3);
    expect(DRUGSCOM_FEEDS.every((u) => u.startsWith("https://www.drugs.com/feeds/"))).toBe(true);
  });

  it("attributes a Moderna release by its opening line and auto-publishes headline approvals only", async () => {
    const adapter = new DrugsComAdapter(stub(feed(MODERNA, UNTRACKED)), ["https://www.drugs.com/feeds/new_drug_approvals.xml"]);
    const docs = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    expect(docs).toHaveLength(1); // INOVIO is not tracked: dropped, never guessed
    expect(docs[0].sourceName).toBe(DRUGSCOM_SOURCE_NAME);
    const [c] = await adapter.normalize(docs[0]);
    expect(c.companyNames).toEqual(["Moderna, Inc."]);
    expect(c.eventType).toBe("regulatory_approval");
    expect(c.publisher).toBe("Drugs.com");
    expect(c.factualSummary).toContain("announced via Drugs.com");
    // Attributed from the body, not the headline: review queue, not auto-publish.
    expect(c.confidence).toBe(0.8);
  });

  it("attributes a Genentech release to Roche via its opening line", async () => {
    const adapter = new DrugsComAdapter(stub(feed(GENENTECH)), ["https://www.drugs.com/feeds/clinical_trials.xml"]);
    const [doc] = await adapter.fetchSince("2026-10-01T00:00:00.000Z");
    const [c] = await adapter.normalize(doc);
    expect(c.companyNames).toEqual(["Roche Holding AG"]);
  });

  it("looks back 45 days on the first run", async () => {
    const recent = new Date(Date.now() - 40 * 86_400_000).toUTCString();
    const adapter = new DrugsComAdapter(
      stub(feed(MODERNA.replace("Fri, 30 Oct 2026 21:00:00 +0000", recent))),
      ["https://www.drugs.com/feeds/new_drug_approvals.xml"],
    );
    expect(await adapter.fetchSince("")).toHaveLength(1);
  });
});
