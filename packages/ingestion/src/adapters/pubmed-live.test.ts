import { describe, expect, it, vi } from "vitest";
import { PubmedAdapter, PUBMED_SOURCE_NAME } from "./pubmed-live.js";

function stubFetch() {
  return vi.fn(async (input: unknown) => {
    const url = String(input);
    const payload = url.includes("esearch.fcgi")
      ? { esearchresult: { idlist: ["42424242"] } }
      : {
          result: {
            uids: ["42424242"],
            "42424242": {
              uid: "42424242",
              title: "A randomized study from Cipla research centres",
              fulljournalname: "Journal of Useful Evidence",
              sortpubdate: "2026/10/12 00:00",
              authors: [{ name: "Researcher A" }],
            },
          },
        };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("PubmedAdapter", () => {
  it("deduplicates a PMID returned by multiple company queries", async () => {
    const adapter = new PubmedAdapter(
      stubFetch(),
      [
        { companyName: "Cipla Ltd", affiliation: "Cipla" },
        { companyName: "Biocon Ltd", affiliation: "Biocon" },
      ],
      0,
    );
    const docs = await adapter.fetchSince("2026-10-01");
    expect(docs).toHaveLength(1);
    expect(adapter.sourceName).toBe(PUBMED_SOURCE_NAME);
    expect(adapter.getNextCursor()).toBe("2026-10-12");
    const [candidate] = await adapter.normalize(docs[0]);
    expect(candidate.eventType).toBe("scientific_publication");
    expect(candidate.companyNames).toEqual(["Cipla Ltd", "Biocon Ltd"]);
    expect(candidate.publisher).toContain("National Library of Medicine");
    expect(candidate.isPrimary).toBe(false);
  });

  it("does not invent publication data when required citation fields are absent", async () => {
    const adapter = new PubmedAdapter(stubFetch(), [], 0);
    expect(await adapter.normalize({
      sourceName: PUBMED_SOURCE_NAME,
      canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/1/",
      contentHash: "a".repeat(64),
      retrievedAt: "2026-10-17T00:00:00.000Z",
      publishedAt: null,
      raw: {},
    })).toEqual([]);
  });
});
