/**
 * BSE fixture adapter unit tests — Milestone 7.
 *
 * Pure unit tests on the hand-curated exchange-announcement fixtures: no
 * database, no network. Encodes the mapping contract: category → taxonomy,
 * template output, null-on-unknown, cursor semantics, fingerprint stability,
 * and the trial-anchored cross-source key.
 */
import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "@biocatalyst/types";
import { BseFixtureAdapter, type BseRecord } from "./adapters/bse.js";
import { PubmedFixtureAdapter } from "./adapters/pubmed.js";
import type { RawSourceDocument } from "./adapter.js";
import { crossSourceKey, isPublishableCandidate } from "./normalize.js";

function makeDoc(overrides: Partial<BseRecord> & { source_url: string; announcement_id: string }): RawSourceDocument {
  const raw = {
    record_type: "exchange_announcement",
    exchange: "BSE",
    announcement_date: "2026-09-15T09:00:00+05:30",
    published_at: "2026-09-15T09:00:00+05:30",
    ...overrides,
  } as BseRecord;
  return {
    sourceName: "bse-fixture",
    canonicalUrl: overrides.source_url,
    contentHash: "b".repeat(64),
    retrievedAt: "2026-09-30T00:00:00.000Z",
    publishedAt: "2026-09-15T09:00:00+05:30",
    raw,
  };
}

const GOOD = {
  source_url: "https://www.bseindia.com/xml-data/corpfiling/AttachHis/fictional-sun-glp1-approval-2026.pdf",
  announcement_id: "BSE-2026-0915-SUN-001",
  category: "regulatory_approval",
  company_name: "Sun Pharmaceutical Industries Ltd",
  ticker_symbol: "SUNPHARMA",
  drug_name: "SUN-GLP1",
  indication: "Type 2 diabetes",
  public_title: "Sun Pharma receives CDSCO marketing authorisation for oral SUN-GLP1",
};

describe("BseFixtureAdapter.fetchSince", () => {
  it("loads the 5 hand-curated fixtures, oldest first", async () => {
    const adapter = new BseFixtureAdapter();
    const docs = await adapter.fetchSince("");
    expect(docs).toHaveLength(5);
    const published = docs.map((d) => d.publishedAt);
    expect(published).toEqual([...published].sort());
    for (const d of docs) {
      expect(d.sourceName).toBe("bse-fixture");
      expect(d.canonicalUrl).toMatch(/^https:\/\/(www\.)?(bseindia|nseindia)\.com\//);
      expect(d.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(d.retrievedAt).toBeTruthy();
      expect(d.publishedAt).not.toBeNull();
    }
  });

  it("filters by cursor and advances getNextCursor", async () => {
    const adapter = new BseFixtureAdapter();
    const all = await adapter.fetchSince("");
    const cursor = all[1].publishedAt!;
    const rest = await adapter.fetchSince(cursor);
    expect(rest).toHaveLength(3);
    expect(rest.every((d) => (d.publishedAt ?? "") > cursor)).toBe(true);
    expect(adapter.getNextCursor()).toBe(all[all.length - 1].publishedAt);
  });

  it("returns nothing when the cursor is past the newest record", async () => {
    const adapter = new BseFixtureAdapter();
    const docs = await adapter.fetchSince("2999-01-01T00:00:00.000Z");
    expect(docs).toHaveLength(0);
  });

  it("skips corrupt fixture files instead of crashing", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "bse-corrupt-"));
    writeFileSync(join(dir, "broken.json"), "{ this is not json");
    try {
      const adapter = new BseFixtureAdapter(dir);
      const docs = await adapter.fetchSince("");
      expect(docs).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("BseFixtureAdapter.normalize", () => {
  it("maps regulatory_approval with template text and entity links", async () => {
    const adapter = new BseFixtureAdapter();
    const [c] = await adapter.normalize(makeDoc(GOOD));
    expect(c.eventType).toBe("regulatory_approval");
    expect((EVENT_TYPES as readonly string[]).includes(c.eventType!)).toBe(true);
    expect(c.headline).toContain("Sun Pharmaceutical Industries Ltd");
    expect(c.headline).toContain("SUN-GLP1");
    expect(c.indication).toBe("Type 2 diabetes");
    expect(c.phase).toBeNull();
    expect(c.outcome).toBeNull();
    expect(c.companyNames).toEqual(["Sun Pharmaceutical Industries Ltd"]);
    expect(c.drugNames).toEqual(["SUN-GLP1"]);
    expect(c.trialRefs).toEqual([]);
    expect(c.crossSourceKey).toBeNull();
    expect(c.publisher).toContain("BSE");
    expect(c.isPrimary).toBe(true);
    expect(c.confidence).toBeGreaterThan(0);
    expect(isPublishableCandidate(c)).toBe(true);
  });

  it("maps licensing_or_partnership; the partner stays text-only (never an entity)", async () => {
    const adapter = new BseFixtureAdapter();
    const [c] = await adapter.normalize(
      makeDoc({
        ...GOOD,
        announcement_id: "NSE-2026-0918-LUP-004",
        category: "licensing_or_partnership",
        company_name: "Lupin Ltd",
        drug_name: "LPN-Etanercept",
        indication: "Rheumatoid arthritis",
        partner_name: "GulfMed BioPharma FZC",
        deal_summary: "Exclusive distribution and supply agreement.",
      }),
    );
    expect(c.eventType).toBe("licensing_or_partnership");
    expect(c.headline).toContain("GulfMed BioPharma FZC");
    // The fictional counterparty is a text mention only — it must not
    // become a canonical entity link.
    expect(c.companyNames).toEqual(["Lupin Ltd"]);
    expect(c.drugNames).toEqual(["LPN-Etanercept"]);
    expect(isPublishableCandidate(c)).toBe(true);
  });

  it("maps acquisition_or_divestiture; the target stays text-only", async () => {
    const adapter = new BseFixtureAdapter();
    const [c] = await adapter.normalize(
      makeDoc({
        ...GOOD,
        announcement_id: "BSE-2026-0921-ZYD-002",
        category: "acquisition_or_divestiture",
        company_name: "Zydus Lifesciences Ltd",
        drug_name: undefined,
        indication: "Atopic dermatitis",
        acquired_company: "NovaDerm Therapeutics Pvt Ltd",
      }),
    );
    expect(c.eventType).toBe("acquisition_or_divestiture");
    expect(c.headline).toContain("NovaDerm Therapeutics Pvt Ltd");
    expect(c.companyNames).toEqual(["Zydus Lifesciences Ltd"]);
    expect(c.drugNames).toEqual([]);
    expect(isPublishableCandidate(c)).toBe(true);
  });

  it("maps clinical_trial_result with a trial ref and sets the cross-source key", async () => {
    const adapter = new BseFixtureAdapter();
    const [c] = await adapter.normalize(
      makeDoc({
        ...GOOD,
        announcement_id: "BSE-2026-0924-DRL-007",
        category: "clinical_trial_result",
        company_name: "Dr. Reddy's Laboratories Ltd",
        drug_name: "DRL-Denosumab",
        indication: "Postmenopausal osteoporosis",
        trial_id: "CTRI/2023/11/059344",
        primary_outcome_met: true,
        primary_outcome: "Percent change in lumbar spine bone mineral density at month 12",
      }),
    );
    expect(c.eventType).toBe("clinical_trial_result");
    expect(c.outcome).toBe("primary_endpoint_met");
    expect(c.headline).toContain("primary endpoint met");
    expect(c.trialRefs).toEqual([{ registry: "CTRI", registryTrialId: "CTRI/2023/11/059344" }]);
    expect(c.crossSourceKey).toBe(
      crossSourceKey({ registry: "CTRI", registryTrialId: "CTRI/2023/11/059344" }),
    );
    expect(c.factualSummary).toContain("CTRI/2023/11/059344");
    expect(isPublishableCandidate(c)).toBe(true);
  });

  it("leaves eventType null for an unmappable category — never guessed", async () => {
    const adapter = new BseFixtureAdapter();
    const [c] = await adapter.normalize(makeDoc({ ...GOOD, category: "Mystery Category" }));
    expect(c.eventType).toBeNull();
    expect(isPublishableCandidate(c)).toBe(false);
  });

  it("leaves occurredAt null when no usable date — rejected, not guessed", async () => {
    const adapter = new BseFixtureAdapter();
    const doc = makeDoc({ ...GOOD, announcement_date: "not a date", published_at: "not a date" });
    doc.publishedAt = null;
    const [c] = await adapter.normalize(doc);
    expect(c.occurredAt).toBeNull();
    expect(isPublishableCandidate(c)).toBe(false);
  });

  it("shares its cross-source key with the PubMed record for the same trial", async () => {
    const bse = new BseFixtureAdapter();
    const pubmed = new PubmedFixtureAdapter();
    const [b] = await bse.normalize(
      makeDoc({ ...GOOD, category: "clinical_trial_result", trial_id: "CTRI/2023/11/059344" }),
    );
    const pubDocs = await pubmed.fetchSince("");
    const pair = pubDocs.find((d) =>
      (d.raw as { trial_id?: unknown }).trial_id === "CTRI/2023/11/059344",
    );
    expect(pair).toBeDefined();
    const [p] = await pubmed.normalize(pair!);
    expect(b.crossSourceKey).not.toBeNull();
    expect(p.crossSourceKey).toBe(b.crossSourceKey);
    // …but the per-source fingerprints stay distinct (different sourceName).
    expect(b.fingerprint).not.toBe(p.fingerprint);
  });
});
