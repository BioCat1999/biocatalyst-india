/**
 * Summary template tests — Milestone 4 (spec §6, §8).
 *
 * factual_summary must be 80–150 words and built only from extracted
 * facts. catalyst_summary must explain operational relevance with NO
 * investment language (spec §6: "The stock should rise" is not acceptable).
 */
import { describe, expect, it } from "vitest";
import {
  buildCatalystSummary,
  buildFactualSummary,
  containsInvestmentLanguage,
  INVESTMENT_PHRASES,
  wordCount,
} from "./summaries.js";
import type { StructuredExtraction } from "./schema.js";

function extraction(overrides: Partial<StructuredExtraction> = {}): StructuredExtraction {
  return {
    event_type: "clinical_trial_result",
    company_names: ["Sun Pharmaceutical Industries Ltd"],
    ticker_candidates: ["SUNPHARMA"],
    drug_names: ["SUN-103"],
    trial_ids: ["CTRI/2024/08/071902"],
    indications: ["Moderate-to-severe plaque psoriasis"],
    phase: "Phase 3",
    outcome: "primary_endpoint_met",
    facts: [
      { claim: "The sponsor is Sun Pharmaceutical Industries Ltd.", source_span: '"sponsor_name": "Sun Pharmaceutical Industries Ltd"', confidence: 0.95 },
      { claim: "Trial CTRI/2024/08/071902 is a Phase 3 trial for Moderate-to-severe plaque psoriasis.", source_span: "CTRI/2024/08/071902", confidence: 0.95 },
      { claim: "Recruitment status is listed as 'Completed'.", source_span: '"recruitment_status": "Completed"', confidence: 0.95 },
      { claim: "The stated primary outcome is: Proportion of participants achieving PASI 75 at week 16.", source_span: '"primary_outcome": "Proportion of participants achieving PASI 75 at week 16"', confidence: 0.95 },
      { claim: "The primary endpoint was met.", source_span: '"primary_outcome_met": "true"', confidence: 0.95 },
    ],
    published_at: "2026-09-10T00:00:00.000Z",
    confidence: 0.95,
    ...overrides,
  };
}

describe("buildFactualSummary", () => {
  it("is 80–150 words", () => {
    const summary = buildFactualSummary({
      extraction: extraction(),
      publisher: "Clinical Trials Registry - India (CTRI)",
      sourceUrlHost: "ctri.nic.in",
    });
    const words = wordCount(summary);
    expect(words).toBeGreaterThanOrEqual(80);
    expect(words).toBeLessThanOrEqual(150);
  });

  it("stays in range for sparse extractions (unknown outcome, no trial id)", () => {
    const summary = buildFactualSummary({
      extraction: extraction({
        event_type: "clinical_trial_status_changed",
        company_names: [],
        drug_names: [],
        trial_ids: [],
        outcome: "unknown",
        facts: [
          { claim: "Recruitment status is listed as 'Recruiting'.", source_span: '"recruitment_status": "Recruiting"', confidence: 0.95 },
          { claim: "The source does not disclose whether the primary endpoint was met.", source_span: "A vague update.", confidence: 0.6 },
        ],
        published_at: null,
        confidence: 0.8,
      }),
      publisher: "Clinical Trials Registry - India (CTRI)",
      sourceUrlHost: "ctri.nic.in",
    });
    const words = wordCount(summary);
    expect(words).toBeGreaterThanOrEqual(80);
    expect(words).toBeLessThanOrEqual(150);
  });

  it("contains no investment language", () => {
    const summary = buildFactualSummary({
      extraction: extraction(),
      publisher: "CTRI",
      sourceUrlHost: "ctri.nic.in",
    });
    expect(containsInvestmentLanguage(summary)).toBeNull();
  });
});

describe("buildCatalystSummary (spec §6)", () => {
  const eventTypes = [
    "clinical_trial_started",
    "clinical_trial_status_changed",
    "clinical_trial_result",
    "primary_endpoint_met",
    "primary_endpoint_missed",
    "safety_signal",
    "regulatory_submission",
    "regulatory_approval",
    "regulatory_rejection_or_deficiency",
    "regulatory_committee_update",
    "manufacturing_or_inspection_update",
    "licensing_or_partnership",
    "acquisition_or_divestiture",
    "scientific_publication",
    "company_pipeline_update",
  ] as const;

  it("produces neutral operational summaries for every taxonomy event type", () => {
    for (const event_type of eventTypes) {
      const summary = buildCatalystSummary(extraction({ event_type }));
      expect(summary.length).toBeGreaterThan(20);
      expect(containsInvestmentLanguage(summary)).toBeNull();
    }
  });

  it("a missed endpoint explains operational relevance without predictions", () => {
    const summary = buildCatalystSummary(
      extraction({ event_type: "primary_endpoint_missed", outcome: "primary_endpoint_missed" }),
    );
    expect(summary).toMatch(/reassess/i);
    expect(containsInvestmentLanguage(summary)).toBeNull();
  });

  it("the banned-phrase list covers the spec's example", () => {
    expect(containsInvestmentLanguage("The stock should rise after this.")).not.toBeNull();
    expect(INVESTMENT_PHRASES.length).toBeGreaterThan(5);
  });
});
