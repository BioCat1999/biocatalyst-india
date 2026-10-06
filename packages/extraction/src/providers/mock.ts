/**
 * Mock model provider — a fixture "model" (Milestone 4).
 *
 * Returns canned structured outputs keyed by document content hash. It
 * behaves like a small model for pipeline purposes: output goes through
 * the same JSON validation, confidence rules, caching, and versioning as
 * any provider. It makes no network requests and needs no API keys.
 *
 * Selection: MODEL_PROVIDER=mock. With no canned entry for a document it
 * returns a generic valid extraction (documented behavior; tests rely on
 * it). A `MockModelProvider` can also be constructed with an explicit
 * canned map so tests can feed valid, invalid, ambiguous, and
 * low-confidence outputs.
 */
import type { ExtractionDocument, ExtractionProvider } from "../provider.js";

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const GENERIC_CANNED = {
  event_type: "company_pipeline_update",
  company_names: [],
  ticker_candidates: [],
  drug_names: [],
  trial_ids: [],
  indications: [],
  phase: null,
  outcome: "unknown",
  facts: [
    {
      claim: "The mock model produced a generic extraction.",
      source_span: "mock-provider",
      confidence: 0.5,
    },
  ],
  published_at: null,
  confidence: 0.5,
};

export class MockModelProvider implements ExtractionProvider {
  readonly providerName = "mock";
  /** Content-hash → canned raw output. Counts calls for cache tests. */
  calls = 0;

  constructor(private readonly canned: Record<string, unknown> = {}) {}

  async extract(doc: ExtractionDocument): Promise<unknown> {
    this.calls += 1;
    const entry = this.canned[doc.contentHash];
    return deepClone(entry ?? GENERIC_CANNED);
  }
}

/**
 * Build a canned-map entry from a partial extraction — convenience for
 * tests that want a fully valid payload with a few fields overridden.
 */
export function cannedExtraction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...deepClone(GENERIC_CANNED),
    ...deepClone(overrides),
  };
}
