/**
 * Adapter unit tests — Milestone 3.
 *
 * Pure unit tests on the hand-curated CTRI fixtures: no database, no
 * network. Encodes the mapping contract: status → taxonomy, template
 * output, null-on-unknown, cursor semantics, fingerprint stability.
 */
import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "@biocatalyst/types";
import { CtriFixtureAdapter, type CtriRecord } from "./adapters/ctri.js";
import type { RawSourceDocument } from "./adapter.js";
import { isPublishableCandidate } from "./normalize.js";

function makeDoc(overrides: Partial<CtriRecord> & { source_url: string; ctri_number: string }): RawSourceDocument {
  const raw = {
    record_type: "ctri_trial_record",
    registration_date: "2025-01-01",
    last_updated: "2026-09-01",
    ...overrides,
  } as CtriRecord;
  return {
    sourceName: "ctri-fixture",
    canonicalUrl: overrides.source_url,
    contentHash: "a".repeat(64),
    retrievedAt: "2026-09-30T00:00:00.000Z",
    publishedAt: "2026-09-01T00:00:00.000Z",
    raw,
  };
}

const GOOD = {
  source_url: "https://ctri.nic.in/Clinicaltrials/pmaindet2.php?trialid=071902",
  ctri_number: "CTRI/2024/08/071902",
  sponsor_name: "Sun Pharmaceutical Industries Ltd",
  phase: "Phase 3",
  recruitment_status: "Recruiting",
  intervention_name: "SUN-103",
  health_condition: "Moderate-to-severe plaque psoriasis",
  public_title: "Phase 3 study of SUN-103",
};

describe("CtriFixtureAdapter.fetchSince", () => {
  it("loads the 5 hand-curated fixtures, oldest first", async () => {
    const adapter = new CtriFixtureAdapter();
    const docs = await adapter.fetchSince("");
    expect(docs).toHaveLength(5);
    const published = docs.map((d) => d.publishedAt);
    expect(published).toEqual([...published].sort());
    for (const d of docs) {
      expect(d.sourceName).toBe("ctri-fixture");
      expect(d.canonicalUrl).toMatch(/^https:\/\/ctri\.nic\.in\//);
      expect(d.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(d.retrievedAt).toBeTruthy();
    }
  });

  it("filters by cursor and advances getNextCursor", async () => {
    const adapter = new CtriFixtureAdapter();
    const all = await adapter.fetchSince("");
    const cursor = all[1].publishedAt!;
    const rest = await adapter.fetchSince(cursor);
    expect(rest).toHaveLength(3);
    expect(rest.every((d) => (d.publishedAt ?? "") > cursor)).toBe(true);
    expect(adapter.getNextCursor()).toBe(all[all.length - 1].publishedAt);
  });

  it("returns nothing when the cursor is past the newest record", async () => {
    const adapter = new CtriFixtureAdapter();
    const docs = await adapter.fetchSince("2999-01-01T00:00:00.000Z");
    expect(docs).toHaveLength(0);
  });

  it("skips corrupt fixture files instead of crashing", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "ctri-corrupt-"));
    writeFileSync(join(dir, "broken.json"), "{ this is not json");
    try {
      const adapter = new CtriFixtureAdapter(dir);
      const docs = await adapter.fetchSince("");
      expect(docs).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("CtriFixtureAdapter.normalize", () => {
  it("maps Recruiting → clinical_trial_status_changed with template text", async () => {
    const adapter = new CtriFixtureAdapter();
    const [c] = await adapter.normalize(makeDoc(GOOD));
    expect(c.eventType).toBe("clinical_trial_status_changed");
    expect((EVENT_TYPES as readonly string[]).includes(c.eventType!)).toBe(true);
    expect(c.headline).toContain("Sun Pharmaceutical Industries Ltd");
    expect(c.headline).toContain("SUN-103");
    expect(c.headline).toContain("CTRI/2024/08/071902");
    expect(c.headline).toContain("Recruiting");
    expect(c.indication).toBe("Moderate-to-severe plaque psoriasis");
    expect(c.phase).toBe("Phase 3");
    expect(c.outcome).toBeNull();
    expect(c.trialRefs).toEqual([{ registry: "CTRI", registryTrialId: "CTRI/2024/08/071902" }]);
    expect(c.companyNames).toEqual(["Sun Pharmaceutical Industries Ltd"]);
    expect(c.drugNames).toEqual(["SUN-103"]);
    expect(c.occurredAt).toBe("2026-09-01T00:00:00.000Z");
    expect(c.publisher).toContain("CTRI");
    expect(c.isPrimary).toBe(true);
    expect(c.confidence).toBeGreaterThan(0);
    expect(isPublishableCandidate(c)).toBe(true);
  });

  it("maps Completed + primary_outcome_met → clinical_trial_result / primary_endpoint_met", async () => {
    const adapter = new CtriFixtureAdapter();
    const [c] = await adapter.normalize(
      makeDoc({ ...GOOD, recruitment_status: "Completed", primary_outcome_met: true }),
    );
    expect(c.eventType).toBe("clinical_trial_result");
    expect(c.outcome).toBe("primary_endpoint_met");
    expect(c.headline).toContain("primary endpoint met");
  });

  it("maps Completed without outcome data → result with null outcome (unknown stays null)", async () => {
    const adapter = new CtriFixtureAdapter();
    const [c] = await adapter.normalize(makeDoc({ ...GOOD, recruitment_status: "Completed" }));
    expect(c.eventType).toBe("clinical_trial_result");
    expect(c.outcome).toBeNull();
    expect(c.headline).toContain("outcome not disclosed");
  });

  it("maps Not yet recruiting → clinical_trial_started", async () => {
    const adapter = new CtriFixtureAdapter();
    const [c] = await adapter.normalize(makeDoc({ ...GOOD, recruitment_status: "Not yet recruiting" }));
    expect(c.eventType).toBe("clinical_trial_started");
    expect(c.headline).toContain("starts Phase 3 trial");
  });

  it("maps Active, not recruiting → clinical_trial_status_changed", async () => {
    const adapter = new CtriFixtureAdapter();
    const [c] = await adapter.normalize(
      makeDoc({ ...GOOD, recruitment_status: "Active, not recruiting" }),
    );
    expect(c.eventType).toBe("clinical_trial_status_changed");
  });

  it("unknown recruitment status → eventType null (never guessed)", async () => {
    const adapter = new CtriFixtureAdapter();
    const [c] = await adapter.normalize(
      makeDoc({ ...GOOD, recruitment_status: "Mystery Status" }),
    );
    expect(c.eventType).toBeNull();
    expect(isPublishableCandidate(c)).toBe(false);
  });

  it("missing optional fields stay null instead of being invented", async () => {
    const adapter = new CtriFixtureAdapter();
    const [c] = await adapter.normalize(
      makeDoc({
        source_url: "https://ctri.nic.in/Clinicaltrials/pmaindet2.php?trialid=000001",
        ctri_number: "CTRI/2026/01/000001",
        recruitment_status: "Recruiting",
      }),
    );
    expect(c.indication).toBeNull();
    expect(c.phase).toBeNull();
    expect(c.outcome).toBeNull();
    expect(c.companyNames).toEqual([]);
    expect(c.drugNames).toEqual([]);
  });

  it("unparseable phase stays null", async () => {
    const adapter = new CtriFixtureAdapter();
    const [c] = await adapter.normalize(makeDoc({ ...GOOD, phase: "Phase 9 (experimental)" }));
    expect(c.phase).toBeNull();
  });

  it("fingerprint is stable for the same record and differs across records", async () => {
    const adapter = new CtriFixtureAdapter();
    const [a1] = await adapter.normalize(makeDoc(GOOD));
    const [a2] = await adapter.normalize(makeDoc(GOOD));
    const [b] = await adapter.normalize(
      makeDoc({ ...GOOD, ctri_number: "CTRI/2024/08/071903", source_url: "https://ctri.nic.in/x?trialid=2" }),
    );
    expect(a1.fingerprint).toBe(a2.fingerprint);
    expect(a1.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a1.fingerprint).not.toBe(b.fingerprint);
  });

  it("returns no candidates for a non-object raw payload", async () => {
    const adapter = new CtriFixtureAdapter();
    const doc = makeDoc(GOOD);
    const out = await adapter.normalize({ ...doc, raw: "not-an-object" });
    expect(out).toHaveLength(0);
  });
});
