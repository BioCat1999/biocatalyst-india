/**
 * Tests for the ClinicalTrials.gov live adapter.
 *
 * The API is stubbed via an injected `fetch` — no network in tests. Fixture
 * payloads mirror the real v2 shape observed on 2026-10-01
 * (`protocolSection.sponsorCollaboratorsModule.leadSponsor.name`,
 * `statusModule.overallStatus`, `designModule.phases`,
 * `lastUpdatePostDateStruct.date`).
 */
import { describe, expect, it, vi } from "vitest";
import { CtgovAdapter, CTGOV_SOURCE_NAME, type CtgovStudy } from "./ctgov.js";

function study(overrides: Record<string, unknown> = {}): CtgovStudy {
  return {
    protocolSection: {
      identificationModule: { nctId: "NCT04475588", briefTitle: "Efficacy and Safety of Itolizumab" },
      statusModule: {
        overallStatus: "COMPLETED",
        lastUpdatePostDateStruct: { date: "2021-06-14" },
        primaryCompletionDateStruct: { date: "2020-07-07" },
      },
      sponsorCollaboratorsModule: { leadSponsor: { name: "Biocon Limited" } },
      designModule: { phases: ["PHASE2"] },
      conditionsModule: { conditions: ["COVID-19"] },
      armsInterventionsModule: { interventions: [{ name: "Itolizumab" }] },
      ...overrides,
    },
  } as CtgovStudy;
}

function docOf(s: CtgovStudy) {
  return {
    sourceName: CTGOV_SOURCE_NAME,
    canonicalUrl: "https://clinicaltrials.gov/study/NCT04475588",
    contentHash: "abc",
    retrievedAt: "2026-10-01T00:00:00.000Z",
    publishedAt: "2021-06-14T00:00:00.000Z",
    raw: s,
  };
}

/** Stub fetch returning one page of studies per sponsor query. */
function stubFetch(studies: CtgovStudy[]) {
  return vi.fn(async (url: string) => {
    const u = new URL(String(url));
    if (u.searchParams.get("pageToken")) {
      return { ok: true, json: async () => ({ studies: [] }) };
    }
    return { ok: true, json: async () => ({ studies, totalCount: studies.length }) };
  }) as unknown as typeof fetch;
}

describe("CtgovAdapter.normalize", () => {
  it("maps a completed Biocon trial to a clinical_trial_result event", async () => {
    const adapter = new CtgovAdapter();
    const [c] = await adapter.normalize(docOf(study()));
    expect(c.eventType).toBe("clinical_trial_result");
    expect(c.companyNames).toEqual(["Biocon Ltd"]);
    expect(c.phase).toBe("Phase 2");
    expect(c.indication).toBe("COVID-19");
    expect(c.occurredAt).toBe("2021-06-14T00:00:00.000Z");
    expect(c.headline).toContain("Biocon Ltd");
    expect(c.headline).toContain("NCT04475588");
    expect(c.trialRefs).toEqual([
      { registry: "ClinicalTrials.gov", registryTrialId: "NCT04475588" },
    ]);
    expect(c.trialRecord).toMatchObject({
      registry: "ClinicalTrials.gov",
      registryTrialId: "NCT04475588",
      sponsorCompanyName: "Biocon Ltd",
      primaryCompletionDate: "2020-07-07",
    });
    expect(c.isPrimary).toBe(true);
    expect(c.publisher).toBe("ClinicalTrials.gov");
    expect(c.drugNames).toEqual([]); // "Itolizumab" is not a tracked drug — omitted, never guessed
  });

  it("maps NOT_YET_RECRUITING to clinical_trial_started", async () => {
    const adapter = new CtgovAdapter();
    const s = study({
      statusModule: { overallStatus: "NOT_YET_RECRUITING", lastUpdatePostDateStruct: { date: "2026-09-20" } },
      sponsorCollaboratorsModule: { leadSponsor: { name: "Sun Pharmaceutical Industries Ltd." } },
    });
    const [c] = await adapter.normalize({ ...docOf(s), publishedAt: "2026-09-20T00:00:00.000Z" });
    expect(c.eventType).toBe("clinical_trial_started");
    expect(c.companyNames).toEqual(["Sun Pharmaceutical Industries Ltd"]);
  });

  it("maps RECRUITING to clinical_trial_status_changed", async () => {
    const adapter = new CtgovAdapter();
    const s = study({
      statusModule: { overallStatus: "RECRUITING", lastUpdatePostDateStruct: { date: "2026-09-20" } },
      sponsorCollaboratorsModule: { leadSponsor: { name: "Cipla Ltd" } },
    });
    const [c] = await adapter.normalize({ ...docOf(s), publishedAt: "2026-09-20T00:00:00.000Z" });
    expect(c.eventType).toBe("clinical_trial_status_changed");
    expect(c.companyNames).toEqual(["Cipla Ltd"]);
  });

  it("drops trials whose lead sponsor is not a tracked company", async () => {
    const adapter = new CtgovAdapter();
    const s = study({
      sponsorCollaboratorsModule: { leadSponsor: { name: "Genentech, Inc." } },
    });
    expect(await adapter.normalize(docOf(s))).toEqual([]);
  });

  it("maps a marketed drug name to the canonical drug", async () => {
    const adapter = new CtgovAdapter();
    const s = study({
      armsInterventionsModule: { interventions: [{ name: "Saroglitazar 4 mg" }] },
      sponsorCollaboratorsModule: { leadSponsor: { name: "Zydus Lifesciences Limited" } },
    });
    const [c] = await adapter.normalize(docOf(s));
    expect(c.companyNames).toEqual(["Zydus Lifesciences Ltd"]);
    expect(c.drugNames).toEqual(["Saroglitazar"]);
  });

  it("leaves eventType null for unknown statuses (runner rejects)", async () => {
    const adapter = new CtgovAdapter();
    const s = study({
      statusModule: { overallStatus: "SOME_FUTURE_STATUS", lastUpdatePostDateStruct: { date: "2026-09-20" } },
    });
    const [c] = await adapter.normalize({ ...docOf(s), publishedAt: "2026-09-20T00:00:00.000Z" });
    expect(c.eventType).toBeNull();
  });

  it("produces a stable fingerprint for the same trial+status", async () => {
    const adapter = new CtgovAdapter();
    const d = docOf(study());
    const [a] = await adapter.normalize(d);
    const [b] = await adapter.normalize(d);
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe("CtgovAdapter.fetchSince", () => {
  it("filters by cursor (inclusive boundary) and advances the cursor", async () => {
    const oldStudy = study();
    const newStudy = study({
      identificationModule: { nctId: "NCT07581509", briefTitle: "Bmab1800 PK study" },
      statusModule: { overallStatus: "NOT_YET_RECRUITING", lastUpdatePostDateStruct: { date: "2026-09-28" } },
      sponsorCollaboratorsModule: { leadSponsor: { name: "Biocon Biologics UK PLC" } },
    });
    const adapter = new CtgovAdapter(stubFetch([oldStudy, newStudy]), { politenessDelayMs: 0 });
    const docs = await adapter.fetchSince("2026-09-01T00:00:00.000Z");
    // The adapter queries once per sponsor (10 sponsors); the stub returns
    // both studies every time, but NCT dedupe keeps one copy each.
    const ids = docs.map((d) => d.canonicalUrl);
    expect(ids).toContain("https://clinicaltrials.gov/study/NCT07581509");
    expect(ids).not.toContain("https://clinicaltrials.gov/study/NCT04475588"); // older than cursor
    expect(adapter.getNextCursor()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("skips records without any usable date", async () => {
    const dateless = study({
      identificationModule: { nctId: "NCT00000000", briefTitle: "Dateless" },
      statusModule: { overallStatus: "RECRUITING" },
    });
    const adapter = new CtgovAdapter(stubFetch([dateless]), { politenessDelayMs: 0 });
    const docs = await adapter.fetchSince("2026-01-01T00:00:00.000Z");
    expect(docs).toEqual([]);
  });

  it("propagates API errors (runner records a failed run)", async () => {
    const failing = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    const adapter = new CtgovAdapter(failing as unknown as typeof fetch, { politenessDelayMs: 0 });
    await expect(adapter.fetchSince("2026-01-01T00:00:00.000Z")).rejects.toThrow("HTTP 429");
  }, 20000); // 3 attempts with backoff exceed the default 5s timeout
});
