/**
 * @biocatalyst/ingestion — Milestone 3: one compliant source adapter behind
 * the SourceAdapter interface (spec §7), with fixture-based records, dedupe,
 * provenance, and health metrics (spec §20).
 *
 * Milestone 7: two more fixture sources (`bse-fixture`, `pubmed-fixture`),
 * a multi-adapter registry (CLI `--source` / run-all), and cross-source
 * dedupe (trial-anchored `crossSourceKey` merges same-event candidates from
 * different sources into one event).
 */
export type {
  Cursor,
  NormalizedCandidate,
  RawSourceDocument,
  SourceAdapter,
} from "./adapter.js";
export {
  CtriFixtureAdapter,
  type CtriRecord,
} from "./adapters/ctri.js";
export {
  BseFixtureAdapter,
  type BseRecord,
} from "./adapters/bse.js";
export {
  PubmedFixtureAdapter,
  type PubmedRecord,
} from "./adapters/pubmed.js";
export {
  CtgovAdapter,
  CTGOV_SOURCE_NAME,
  type CtgovStudy,
} from "./adapters/ctgov.js";
export {
  GdeltAdapter,
  GDELT_SOURCE_NAME,
  parseSeendate,
  type GdeltArticle,
} from "./adapters/gdelt.js";
export {
  PressRssAdapter,
  PRESS_RSS_SOURCE_NAME,
  PRESS_FEEDS,
  parseRss,
  cleanText,
  classifyPressRelease,
  type PressFeed,
  type RssItem,
} from "./adapters/rss.js";
export {
  ADAPTER_FACTORIES,
  createAdapter,
  listSourceNames,
  runAllIngestion,
} from "./registry.js";
export {
  canonicalizeUrl,
  contentHash,
  crossSourceKey,
  eventFingerprint,
  isPublishableCandidate,
  normalizedCandidateSchema,
  parseIso,
  stableStringify,
  TEMPLATE_CONFIDENCE,
  type PublishableCandidate,
} from "./normalize.js";
export { getSourceHealth, isSourceStale, type SourceHealth } from "./health.js";
export { runIngestion, type IngestionMetrics } from "./run.js";
