/**
 * Guardrail tests — Milestone 4, spec §8.3.
 *
 * The extractor may extract or summarize; it may NEVER invent numeric
 * values, trial IDs, endpoints, dates, or company relationships. Missing
 * → null/empty. Ambiguous outcome language → "unknown" + lowered
 * confidence. Every fact carries a source span.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DeterministicExtractor } from "./providers/deterministic.js";
import { resolveReviewStatus, PUBLISH_CONFIDENCE_THRESHOLD } from "./review.js";
import type { ExtractionDocument } from "./provider.js";

function doc(overrides: Partial<ExtractionDocument> = {}): ExtractionDocument {
  const text = overrides.text ?? "A registry update.";
  return {
    contentHash: createHash("sha256").update(text).digest("hex"),
    text,
    sourceName: "test-source",
    canonicalUrl: "https://example.com/record/1",
    publishedAt: null,
    ...overrides,
  };
}

const extractor = new DeterministicExtractor();

describe("no invented facts (spec §8.3)", () => {
  it("emits no trial IDs when none appear in the source", async () => {
    const ex = await extractor.extract(
      doc({
        text: "Sun Pharma announced a trial update for its psoriasis program.",
        structured: { sponsor_name: "Sun Pharmaceutical Industries Ltd" },
      }),
    );
    expect(ex.trial_ids).toEqual([]);
    expect(ex.company_names).toEqual(["Sun Pharmaceutical Industries Ltd"]);
  });

  it("extracts only trial IDs literally present in the source", async () => {
    const ex = await extractor.extract(
      doc({
        text: "Results for CTRI/2024/08/071902 were disclosed.",
        structured: { ctri_number: "CTRI/2024/08/071902" },
      }),
    );
    expect(ex.trial_ids).toEqual(["CTRI/2024/08/071902"]);
  });

  it("leaves published_at null when no parseable date exists", async () => {
    const ex = await extractor.extract(
      doc({
        text: "An update with no dates.",
        structured: { last_updated: "not a date", registration_date: "" },
      }),
    );
    expect(ex.published_at).toBeNull();
  });

  it("parses published_at only from real ISO dates in the record", async () => {
    const ex = await extractor.extract(
      doc({ structured: { last_updated: "2026-09-10" } }),
    );
    expect(ex.published_at).toBe("2026-09-10T00:00:00.000Z");
  });

  it("leaves company/drug/indication empty when the source is silent", async () => {
    const ex = await extractor.extract(doc({ text: "A vague market update." }));
    expect(ex.company_names).toEqual([]);
    expect(ex.drug_names).toEqual([]);
    expect(ex.indications).toEqual([]);
  });

  it("leaves phase null for unmappable phase values", async () => {
    const ex = await extractor.extract(
      doc({ structured: { phase: "Phase 9 (fictional)" } }),
    );
    expect(ex.phase).toBeNull();
  });

  it("emits no numeric enrollment claim without an explicit pattern", async () => {
    const ex = await extractor.extract(
      doc({ text: "The trial enrolled many patients across sites." }),
    );
    expect(ex.facts.some((f) => /enrollment/i.test(f.claim))).toBe(false);
  });

  it("extracts enrollment only from an explicit enrollment pattern", async () => {
    const ex = await extractor.extract(
      doc({ text: "The trial enrolled 450 participants across 12 sites." }),
    );
    const fact = ex.facts.find((f) => /enrollment/i.test(f.claim));
    expect(fact?.claim).toContain("450");
    expect(fact?.source_span).toContain("450");
  });
});

describe("outcome rules (spec §8.3)", () => {
  it("maps primary_outcome_met=true to primary_endpoint_met", async () => {
    const ex = await extractor.extract(
      doc({ structured: { primary_outcome_met: true, recruitment_status: "Completed" } }),
    );
    expect(ex.outcome).toBe("primary_endpoint_met");
    expect(ex.event_type).toBe("clinical_trial_result");
  });

  it("maps primary_outcome_met=false to primary_endpoint_missed", async () => {
    const ex = await extractor.extract(
      doc({ structured: { primary_outcome_met: false } }),
    );
    expect(ex.outcome).toBe("primary_endpoint_missed");
  });

  it("ambiguous outcome language → unknown with lowered confidence", async () => {
    const ex = await extractor.extract(
      doc({
        text: "Early results suggest the drug may show an encouraging trend toward the primary endpoint.",
        structured: { recruitment_status: "Completed" },
      }),
    );
    expect(ex.outcome).toBe("unknown");
    expect(ex.confidence).toBeLessThan(PUBLISH_CONFIDENCE_THRESHOLD);
    expect(
      resolveReviewStatus({ outcome: ex.outcome, confidence: ex.confidence, fallbackUsed: false }),
    ).toBe("pending_review");
  });

  it("silent outcome → unknown, not guessed", async () => {
    const ex = await extractor.extract(
      doc({ structured: { recruitment_status: "Completed" } }),
    );
    expect(ex.outcome).toBe("unknown");
  });
});

describe("traceability (spec §8.3)", () => {
  it("every fact has a non-empty source_span", async () => {
    const ex = await extractor.extract(
      doc({
        text: "Sun Pharma reports Phase 3 results for SUN-103 (CTRI/2024/08/071902): the primary endpoint was met.",
        structured: {
          sponsor_name: "Sun Pharmaceutical Industries Ltd",
          intervention_name: "SUN-103",
          health_condition: "Psoriasis",
          phase: "Phase 3",
          recruitment_status: "Completed",
          ctri_number: "CTRI/2024/08/071902",
          last_updated: "2026-09-10",
        },
      }),
    );
    expect(ex.facts.length).toBeGreaterThan(0);
    for (const fact of ex.facts) {
      expect(fact.source_span.trim().length).toBeGreaterThan(0);
      expect(fact.confidence).toBeGreaterThanOrEqual(0);
      expect(fact.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic: same document → same output", async () => {
    const d = doc({
      text: "Biocon Ltd starts a Phase 3 trial of BCN-Trastuzumab (CTRI/2023/05/051208).",
      structured: { sponsor_name: "Biocon Ltd", phase: "Phase 3", ctri_number: "CTRI/2023/05/051208" },
    });
    const a = await extractor.extract(d);
    const b = await extractor.extract(d);
    expect(a).toEqual(b);
  });
});
