/**
 * @biocatalyst/extraction — Milestone 4: small-model structured extraction
 * (spec §8), fully offline.
 *
 * The model provider is always behind the `ExtractionProvider` interface
 * (`provider.ts`). Default: deterministic rule/template extractor.
 * `MODEL_PROVIDER=mock` selects a fixture "model" returning canned outputs.
 * No real third-party model API is wired — see docs/decisions.md.
 */
export {
  EXTRACTION_SCHEMA_VERSION,
  PROMPT_VERSION,
  extractionFactSchema,
  extractionSchema,
  validateExtraction,
  EXTRACTION_OUTCOMES,
  TRIAL_PHASES,
  type ExtractionFact,
  type StructuredExtraction,
  type ExtractionOutcome as ExtractionOutcomeValue,
} from "./schema.js";
export {
  type ExtractionDocument,
  type ExtractionProvider,
  MODEL_PROVIDER_ENV,
  providerNameFromEnv,
  selectProvider,
} from "./provider.js";
export { DeterministicExtractor, extractDeterministic } from "./providers/deterministic.js";
export { MockModelProvider, cannedExtraction } from "./providers/mock.js";
export {
  INVESTMENT_PHRASES,
  buildCatalystSummary,
  buildFactualSummary,
  containsInvestmentLanguage,
  wordCount,
} from "./summaries.js";
export {
  FALLBACK_CONFIDENCE,
  PUBLISH_CONFIDENCE_THRESHOLD,
  resolveReviewStatus,
  type ReviewDecision,
  type ReviewInput,
} from "./review.js";
export {
  extractDocument,
  type ExtractionOutcome,
} from "./pipeline.js";
