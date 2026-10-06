/**
 * PubMed fixture adapter unit tests — Milestone 7.
 *
 * Pure unit tests on the hand-curated PubMed article fixtures: no
 * database, no network. Encodes the mapping contract: every record maps
 * to scientific_publication, template output carries the bibliographic
 * identity (PMID/journal), the trial ref feeds the cross-source key, and
 * unknown/missing dates stay null (never guessed).
 */
import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "@biocatalyst/types";
import { PubmedFixtureAdapter, type PubmedRecord } from "./adapters/pubmed.js";
import type { RawSourceDocument } from "./adapter.js";
import { crossSourceKey, isPublishableCandidate } from "./normalize.js";

function makeDoc(overrides: Partial<PubmedRecord> & { source_url: string; pmid: string }): RawSourceDocument {
  const raw = {
    record_type: "pubmed_article",
    publication_date: "2026-09-29",
    published_at: "2026-09-29T00:00:00+05:30",
    ...overrides,
  } as PubmedRecord;
  return {
    sourceName: "pubmed-fixture",
    canonicalUrl: overrides.source_url,
    contentHash: "c".repeat(64),
    retrievedAt: "2026-09-30T00:00:00.000Z",
    publishedAt: "2026-09-29T00:00:00+05:30",
    raw,
  };
}

const GOOD = {
  source_url: "https://pubmed.ncbi.nlm.nih.gov/41234567/",
  pmid: "41234567",
  journal: "Journal of Fictional Bone Research",
  article_title: "A randomized Phase 3 equivalence study of DRL-Denosumab",
  sponsor_name: "Dr. Reddy's Laboratories Ltd",
  drug_name: "DRL-Denosumab",
  indication: "Postmenopausal osteoporosis",
  trial_id: "CTRI/2023/11/059344",
};

describe("PubmedFixtureAdapter.fetchSince", () => {
  it("loads the 3 hand-curated fixtures, oldest first", async () => {
    const adapter = new PubmedFixtureAdapter();
    const docs = await adapter.fetchSince("");
    expect(docs).toHaveLength(3);
    const published = docs.map((d) => d.publishedAt);
    expect(published).toEqual([...published].sort());
    for (const d of docs) {
      expect(d.sourceName).toBe("pubmed-fixture");
      expect(d.canonicalUrl).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//);
      expect(d.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(d.retrievedAt).toBeTruthy();
      expect(d.publishedAt).not.toBeNull();
    }
  });

  it("filters by cursor and advances getNextCursor", async () => {
    const adapter = new PubmedFixtureAdapter();
    const all = await adapter.fetchSince("");
    const cursor = all[0].publishedAt!;
    const rest = await adapter.fetchSince(cursor);
    expect(rest).toHaveLength(2);
    expect(rest.every((d) => (d.publishedAt ?? "") > cursor)).toBe(true);
    expect(adapter.getNextCursor()).toBe(all[all.length - 1].publishedAt);
  });

  it("returns nothing when the cursor is past the newest record", async () => {
    const adapter = new PubmedFixtureAdapter();
    const docs = await adapter.fetchSince("2999-01-01T00:00:00.000Z");
    expect(docs).toHaveLength(0);
  });
});

describe("PubmedFixtureAdapter.normalize", () => {
  it("maps every record to scientific_publication with bibliographic identity", async () => {
    const adapter = new PubmedFixtureAdapter();
    const [c] = await adapter.normalize(makeDoc(GOOD));
    expect(c.eventType).toBe("scientific_publication");
    expect((EVENT_TYPES as readonly string[]).includes(c.eventType!)).toBe(true);
    expect(c.headline).toContain("Journal of Fictional Bone Research");
    expect(c.headline).toContain("41234567");
    expect(c.factualSummary).toContain("Dr. Reddy's Laboratories Ltd");
    expect(c.factualSummary).toContain("DRL-Denosumab");
    expect(c.factualSummary).toContain("CTRI/2023/11/059344");
    expect(c.indication).toBe("Postmenopausal osteoporosis");
    expect(c.phase).toBeNull();
    expect(c.outcome).toBeNull(); // never inferred from publication prose
    expect(c.trialRefs).toEqual([{ registry: "CTRI", registryTrialId: "CTRI/2023/11/059344" }]);
    expect(c.companyNames).toEqual(["Dr. Reddy's Laboratories Ltd"]);
    expect(c.drugNames).toEqual(["DRL-Denosumab"]);
    expect(c.crossSourceKey).toBe(
      crossSourceKey({ registry: "CTRI", registryTrialId: "CTRI/2023/11/059344" }),
    );
    expect(c.publisher).toContain("PubMed");
    expect(c.isPrimary).toBe(true);
    expect(isPublishableCandidate(c)).toBe(true);
  });

  it("parses ClinicalTrials.gov trial ids", async () => {
    const adapter = new PubmedFixtureAdapter();
    const [c] = await adapter.normalize(
      makeDoc({ ...GOOD, pmid: "41234568", trial_id: "NCT06421387" }),
    );
    expect(c.trialRefs).toEqual([{ registry: "ClinicalTrials.gov", registryTrialId: "NCT06421387" }]);
    expect(c.crossSourceKey).toBe(
      crossSourceKey({ registry: "ClinicalTrials.gov", registryTrialId: "NCT06421387" }),
    );
    expect(isPublishableCandidate(c)).toBe(true);
  });

  it("leaves occurredAt null when no usable date — rejected, not guessed", async () => {
    const adapter = new PubmedFixtureAdapter();
    const doc = makeDoc({ ...GOOD, publication_date: "not a date", published_at: "not a date" });
    doc.publishedAt = null;
    const [c] = await adapter.normalize(doc);
    expect(c.occurredAt).toBeNull();
    expect(isPublishableCandidate(c)).toBe(false);
  });

  it("stays publishable when the trial id is absent (no cross-source key)", async () => {
    const adapter = new PubmedFixtureAdapter();
    const [c] = await adapter.normalize(makeDoc({ ...GOOD, pmid: "41234570", trial_id: undefined }));
    expect(c.trialRefs).toEqual([]);
    expect(c.crossSourceKey).toBeNull();
    expect(isPublishableCandidate(c)).toBe(true);
  });
});
