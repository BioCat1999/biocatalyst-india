/**
 * §8.2 structured extraction schema — Zod-validated TypeScript types.
 *
 * The spec's required extraction payload. Every model-produced record is
 * validated against `extractionSchema` before it can be stored or used;
 * anything that fails validation is rejected and the deterministic
 * fallback path is taken (see pipeline.ts).
 *
 * Versioning (spec §8.3): EXTRACTION_SCHEMA_VERSION is persisted on every
 * `extractions` row. Bump it whenever this schema changes in an
 * incompatible way — the cache key includes it, so a bump forces
 * re-extraction of previously cached documents.
 */
import { z } from "zod";
import { EVENT_TYPES } from "@biocatalyst/types";

export const EXTRACTION_SCHEMA_VERSION = "1.0.0";

/** Prompt template version (spec §8.3: every model-produced record carries
 *  prompt + schema versions for reproducibility). Bump when the extraction
 *  prompt/instructions change; cached extractions under an older version
 *  are never silently reused. */
export const PROMPT_VERSION = "m4-v1";

/** Closed taxonomy outcome values — "unknown" when the source is silent
 *  or ambiguous (spec §8.3). Never guessed. */
export const EXTRACTION_OUTCOMES = [
  "primary_endpoint_met",
  "primary_endpoint_missed",
  "unknown",
] as const;
export type ExtractionOutcome = (typeof EXTRACTION_OUTCOMES)[number];

export const TRIAL_PHASES = [
  "Phase 1",
  "Phase 1/2",
  "Phase 2",
  "Phase 2/3",
  "Phase 3",
  "Phase 4",
  "Preclinical",
] as const;
export type ExtractionPhase = (typeof TRIAL_PHASES)[number];

/**
 * One extracted assertion. `source_span` must be a verbatim substring of
 * the source document (or a quoted record field) so every high-impact
 * assertion is traceable (spec §8.3). `confidence` is the extractor's
 * self-reported 0..1 confidence for THIS claim.
 */
export const extractionFactSchema = z.object({
  claim: z.string().min(1).max(1000),
  source_span: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1),
});
export type ExtractionFact = z.infer<typeof extractionFactSchema>;

export const extractionSchema = z.object({
  /** Closed event taxonomy (spec §6). */
  event_type: z.enum(EVENT_TYPES),
  company_names: z.array(z.string().min(1)).max(20),
  ticker_candidates: z.array(z.string().min(1).max(20)).max(20),
  drug_names: z.array(z.string().min(1)).max(20),
  /** Only IDs literally present in the source — never invented (spec §8.3). */
  trial_ids: z.array(z.string().min(1).max(60)).max(20),
  indications: z.array(z.string().min(1)).max(20),
  /** Null when the source does not state a mappable phase (spec §17). */
  phase: z.enum(TRIAL_PHASES).nullable(),
  outcome: z.enum(EXTRACTION_OUTCOMES),
  facts: z.array(extractionFactSchema).max(25),
  /** ISO 8601 or null when the source gives no parseable date (spec §17). */
  published_at: z.string().datetime({ offset: true }).nullable(),
  /** Overall extraction confidence, 0..1. */
  confidence: z.number().min(0).max(1),
});
export type StructuredExtraction = z.infer<typeof extractionSchema>;

/**
 * Validate a provider's raw output. Returns the typed extraction on
 * success, or the Zod error details on failure — the pipeline treats
 * failure as a trigger for deterministic fallback, never as a crash.
 */
export function validateExtraction(
  raw: unknown,
): { ok: true; value: StructuredExtraction } | { ok: false; issues: string } {
  const parsed = extractionSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, issues };
}
