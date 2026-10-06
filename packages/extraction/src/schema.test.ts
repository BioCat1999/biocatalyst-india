/**
 * Schema validation tests — Milestone 4, spec §8.2.
 *
 * The §8.2 extraction payload must validate as a closed-taxonomy,
 * confidence-carrying structure. Invalid payloads are rejected (the
 * pipeline then takes the deterministic fallback path).
 */
import { describe, expect, it } from "vitest";
import {
  EXTRACTION_SCHEMA_VERSION,
  extractionSchema,
  validateExtraction,
} from "./schema.js";

const validPayload = {
  event_type: "clinical_trial_result",
  company_names: ["Example Pharma Ltd"],
  ticker_candidates: ["EXAMPLE"],
  drug_names: ["ABC-101"],
  trial_ids: ["CTRI/2024/08/071902"],
  indications: ["Psoriasis"],
  phase: "Phase 3",
  outcome: "primary_endpoint_met",
  facts: [{ claim: "The primary endpoint was met.", source_span: "primary_outcome_met: true", confidence: 0.96 }],
  published_at: "2026-09-10T00:00:00.000Z",
  confidence: 0.94,
};

describe("extractionSchema — valid payloads", () => {
  it("accepts the spec §8.2 example shape", () => {
    const result = validateExtraction(validPayload);
    expect(result.ok).toBe(true);
  });

  it("accepts minimal payloads with nulls for unknown fields (spec §17)", () => {
    const result = validateExtraction({
      ...validPayload,
      company_names: [],
      ticker_candidates: [],
      drug_names: [],
      trial_ids: [],
      indications: [],
      phase: null,
      outcome: "unknown",
      facts: [],
      published_at: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phase).toBeNull();
      expect(result.value.published_at).toBeNull();
    }
  });

  it("pins the schema version", () => {
    expect(EXTRACTION_SCHEMA_VERSION).toBe("1.0.0");
    expect(extractionSchema).toBeDefined();
  });
});

describe("extractionSchema — invalid payloads are rejected", () => {
  it("rejects an event_type outside the closed taxonomy", () => {
    const result = validateExtraction({ ...validPayload, event_type: "stock_moonshot" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toMatch(/event_type/);
  });

  it("rejects confidence outside 0..1", () => {
    for (const confidence of [-0.1, 1.5]) {
      const result = validateExtraction({ ...validPayload, confidence });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a fact without a source_span (traceability, spec §8.3)", () => {
    const result = validateExtraction({
      ...validPayload,
      facts: [{ claim: "Something happened.", confidence: 0.9 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toMatch(/source_span/);
  });

  it("rejects a fact with per-claim confidence outside 0..1", () => {
    const result = validateExtraction({
      ...validPayload,
      facts: [{ claim: "x", source_span: "y", confidence: 2 }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an outcome outside the closed set", () => {
    const result = validateExtraction({ ...validPayload, outcome: "probably_met" });
    expect(result.ok).toBe(false);
  });

  it("rejects a phase outside the closed set", () => {
    const result = validateExtraction({ ...validPayload, phase: "Phase 9" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-ISO published_at", () => {
    const result = validateExtraction({ ...validPayload, published_at: "sometime last week" });
    expect(result.ok).toBe(false);
  });

  it("rejects non-object / empty payloads", () => {
    expect(validateExtraction(null).ok).toBe(false);
    expect(validateExtraction({}).ok).toBe(false);
    expect(validateExtraction("not json").ok).toBe(false);
  });
});
