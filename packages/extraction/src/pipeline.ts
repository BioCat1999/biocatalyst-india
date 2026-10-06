/**
 * Extraction pipeline — Milestone 4 (spec §8).
 *
 * Per document:
 *   cache lookup (content hash + provider + prompt_version + schema_version)
 *     → provider.extract → JSON validation (Zod)
 *       → on error/invalid: deterministic fallback (low confidence, flagged)
 *     → confidence rules → template summaries → store extraction
 *
 * The pipeline NEVER throws for a single document's extraction problems:
 * provider errors and invalid JSON both resolve to the deterministic
 * fallback, marked `fallback_used` with low confidence and routed to
 * `pending_review` (spec §17: a source adapter/extraction failure must not
 * crash the pipeline). Only database failures propagate, and those are
 * caught by the ingestion runner's per-document rejection counting.
 */
import type { Pool } from "pg";
import type { ExtractionDocument, ExtractionProvider } from "./provider.js";
import {
  EXTRACTION_SCHEMA_VERSION,
  PROMPT_VERSION,
  validateExtraction,
  type StructuredExtraction,
} from "./schema.js";
import { DeterministicExtractor } from "./providers/deterministic.js";
import { buildCatalystSummary, buildFactualSummary } from "./summaries.js";
import { FALLBACK_CONFIDENCE, resolveReviewStatus, type ReviewDecision } from "./review.js";

export interface ExtractionOutcome {
  /** Validated structured extraction (spec §8.2). */
  extraction: StructuredExtraction;
  provider: string;
  promptVersion: string;
  schemaVersion: string;
  /** True when the result was reused from the `extractions` cache. */
  fromCache: boolean;
  /** True when the provider failed/invalid and the deterministic fallback was used. */
  fallbackUsed: boolean;
  /** Effective event confidence (fallback caps at FALLBACK_CONFIDENCE). */
  confidence: number;
  reviewStatus: ReviewDecision;
  factualSummary: string;
  catalystSummary: string;
  /** UUID of the persisted `extractions` row. */
  extractionId: string;
}

interface ExtractionRow {
  id: string;
  provider: string;
  prompt_version: string;
  schema_version: string;
  output: StructuredExtraction;
  factual_summary: string;
  catalyst_summary: string;
  confidence: number;
  review_status: ReviewDecision;
  fallback_used: boolean;
}

function rowToOutcome(row: ExtractionRow, fromCache: boolean): ExtractionOutcome {
  return {
    extraction: row.output,
    provider: row.provider,
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    fromCache,
    fallbackUsed: row.fallback_used,
    confidence: row.confidence,
    reviewStatus: row.review_status,
    factualSummary: row.factual_summary,
    catalystSummary: row.catalyst_summary,
    extractionId: row.id,
  };
}

async function findCached(
  pool: Pool,
  providerName: string,
  doc: ExtractionDocument,
): Promise<ExtractionRow | null> {
  const { rows } = await pool.query<ExtractionRow>(
    `SELECT id::text AS id, provider, prompt_version, schema_version,
            output, factual_summary, catalyst_summary, confidence,
            review_status, fallback_used
       FROM extractions
      WHERE document_hash = $1 AND provider = $2
        AND prompt_version = $3 AND schema_version = $4
      LIMIT 1`,
    [doc.contentHash, providerName, PROMPT_VERSION, EXTRACTION_SCHEMA_VERSION],
  );
  return rows[0] ?? null;
}

async function persistExtraction(
  pool: Pool,
  providerName: string,
  doc: ExtractionDocument,
  extraction: StructuredExtraction,
  derived: { confidence: number; reviewStatus: ReviewDecision; fallbackUsed: boolean; factualSummary: string; catalystSummary: string },
): Promise<ExtractionRow> {
  const { rows } = await pool.query<ExtractionRow>(
    `INSERT INTO extractions
       (document_hash, provider, prompt_version, schema_version, output,
        factual_summary, catalyst_summary, confidence, review_status, fallback_used)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)
     ON CONFLICT (document_hash, provider, prompt_version, schema_version) DO NOTHING
     RETURNING id::text AS id, provider, prompt_version, schema_version,
               output, factual_summary, catalyst_summary, confidence,
               review_status, fallback_used`,
    [
      doc.contentHash,
      providerName,
      PROMPT_VERSION,
      EXTRACTION_SCHEMA_VERSION,
      JSON.stringify(extraction),
      derived.factualSummary,
      derived.catalystSummary,
      derived.confidence,
      derived.reviewStatus,
      derived.fallbackUsed,
    ],
  );
  if (rows[0]) return rows[0];
  // Lost a race with a concurrent insert — read the winner (cache semantics).
  const cached = await findCached(pool, providerName, doc);
  if (!cached) throw new Error("extraction: cache insert raced and row is missing");
  return cached;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "the source record";
  }
}

/**
 * Extract one document, honoring the content-hash cache and falling back
 * to deterministic templates on any provider/validation failure.
 */
export async function extractDocument(
  pool: Pool,
  provider: ExtractionProvider,
  doc: ExtractionDocument,
): Promise<ExtractionOutcome> {
  if (!/^[0-9a-f]{64}$/.test(doc.contentHash)) {
    throw new Error("extraction: document contentHash must be a 64-char sha256 hex string");
  }

  const cached = await findCached(pool, provider.providerName, doc);
  if (cached) return rowToOutcome(cached, true);

  let extraction: StructuredExtraction;
  let fallbackUsed = false;
  try {
    const raw = await provider.extract(doc);
    const validated = validateExtraction(raw);
    if (!validated.ok) {
      throw new Error(`invalid extraction JSON: ${validated.issues}`);
    }
    extraction = validated.value;
  } catch (err) {
    // Deterministic fallback: never crash, flag for review (spec §17).
    console.error(
      `[extraction] ${provider.providerName}: falling back to deterministic extractor:`,
      (err as Error).message,
    );
    extraction = await new DeterministicExtractor().extract(doc);
    fallbackUsed = true;
  }

  const confidence = fallbackUsed
    ? Math.min(extraction.confidence, FALLBACK_CONFIDENCE)
    : extraction.confidence;
  const reviewStatus = resolveReviewStatus({
    outcome: extraction.outcome,
    confidence,
    fallbackUsed,
  });

  const factualSummary = buildFactualSummary({
    extraction,
    publisher: doc.publisher ?? doc.sourceName,
    sourceUrlHost: hostOf(doc.canonicalUrl),
  });
  const catalystSummary = buildCatalystSummary(extraction);

  const row = await persistExtraction(pool, provider.providerName, doc, extraction, {
    confidence,
    reviewStatus,
    fallbackUsed,
    factualSummary,
    catalystSummary,
  });
  return rowToOutcome(row, false);
}

/** Re-exported for tests and the ingestion runner. */
export { EXTRACTION_SCHEMA_VERSION, PROMPT_VERSION };
