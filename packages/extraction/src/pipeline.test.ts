/**
 * Pipeline tests — Milestone 4 (spec §8).
 *
 * - Content-hash caching: the same document (same hash + provider +
 *   prompt/schema versions) is extracted once; the second call is served
 *   from the `extractions` table without invoking the provider.
 * - Versioning: every row persists provider, prompt_version,
 *   schema_version; a different provider version key misses the cache.
 * - Fallback: provider errors and invalid JSON resolve to the
 *   deterministic fallback — low confidence, flagged for review, never
 *   a crash (spec §17).
 * - Confidence rules: endpoint claims below the threshold go to
 *   pending_review; above the threshold they may publish (spec §8.3).
 *
 * Runs against an isolated `biocatalyst_extraction_test` database.
 */
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, migrate, closePool } from "@biocatalyst/db";
import {
  EXTRACTION_SCHEMA_VERSION,
  PROMPT_VERSION,
  PUBLISH_CONFIDENCE_THRESHOLD,
  FALLBACK_CONFIDENCE,
  cannedExtraction,
  extractDocument,
  MockModelProvider,
  type ExtractionDocument,
  type ExtractionProvider,
} from "./index.js";

function extractionTestDatabaseUrl(): string {
  if (process.env.EXTRACTION_TEST_DATABASE_URL) return process.env.EXTRACTION_TEST_DATABASE_URL;
  return getTestDatabaseUrl().replace(/\/[^/]*$/, "/biocatalyst_extraction_test");
}

function doc(text: string, overrides: Partial<ExtractionDocument> = {}): ExtractionDocument {
  return {
    contentHash: createHash("sha256").update(text).digest("hex"),
    text,
    sourceName: "test-source",
    canonicalUrl: "https://example.com/record/1",
    publishedAt: null,
    ...overrides,
  };
}

/** Provider that always throws — simulates a model outage. */
class ExplodingProvider implements ExtractionProvider {
  readonly providerName = "exploding";
  calls = 0;
  async extract(): Promise<unknown> {
    this.calls += 1;
    throw new Error("model endpoint unreachable");
  }
}

/** Provider that returns unparseable / schema-invalid JSON. */
class GarbageProvider implements ExtractionProvider {
  readonly providerName = "garbage";
  constructor(private readonly payload: unknown) {}
  async extract(): Promise<unknown> {
    return this.payload;
  }
}

let pool: Pool;

beforeAll(async () => {
  pool = new Pool({ connectionString: extractionTestDatabaseUrl(), max: 5 });
  await migrate(pool);
  await pool.query("TRUNCATE extractions RESTART IDENTITY CASCADE");
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await closePool();
});

async function extractionCount(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM extractions");
  return rows[0].n;
}

describe("content-hash caching (spec §8.1)", () => {
  it("extracts once; the second call is served from cache", async () => {
    const provider = new MockModelProvider();
    const d = doc("Cache me once.");
    const first = await extractDocument(pool, provider, d);
    const second = await extractDocument(pool, provider, d);
    expect(provider.calls).toBe(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.extractionId).toBe(first.extractionId);
    expect(await extractionCount()).toBe(1);
  });

  it("different content hashes are extracted independently", async () => {
    const provider = new MockModelProvider();
    await extractDocument(pool, provider, doc("Document A."));
    await extractDocument(pool, provider, doc("Document B."));
    expect(provider.calls).toBe(2);
  });

  it("a different provider name misses the cache (version key component)", async () => {
    const d = doc("Provider-scoped caching.");
    const mock = new MockModelProvider();
    const exploding = new ExplodingProvider();
    const first = await extractDocument(pool, mock, d);
    // "exploding" throws → deterministic fallback, but it must NOT reuse
    // the mock provider's cached row: different provider → cache miss.
    const second = await extractDocument(pool, exploding, d);
    expect(mock.calls).toBe(1);
    expect(exploding.calls).toBe(1);
    expect(second.fromCache).toBe(false);
    expect(second.fallbackUsed).toBe(true);
    expect(second.extractionId).not.toBe(first.extractionId);
  });
});

describe("prompt/schema versioning (spec §8.3)", () => {
  it("persists provider, prompt_version, and schema_version on every row", async () => {
    const d = doc("Version me.");
    const outcome = await extractDocument(pool, new MockModelProvider(), d);
    const { rows } = await pool.query<{
      provider: string;
      prompt_version: string;
      schema_version: string;
      document_hash: string;
    }>(
      "SELECT provider, prompt_version, schema_version, document_hash FROM extractions WHERE id = $1::uuid",
      [outcome.extractionId],
    );
    expect(rows[0].provider).toBe("mock");
    expect(rows[0].prompt_version).toBe(PROMPT_VERSION);
    expect(rows[0].schema_version).toBe(EXTRACTION_SCHEMA_VERSION);
    expect(rows[0].document_hash).toBe(d.contentHash);
  });
});

describe("deterministic fallback (spec §17)", () => {
  it("a throwing provider falls back: low confidence, flagged, pending_review", async () => {
    const d = doc("Sun Pharma reports Phase 3 results for SUN-103 (CTRI/2024/08/071902).", {
      structured: {
        sponsor_name: "Sun Pharmaceutical Industries Ltd",
        intervention_name: "SUN-103",
        ctri_number: "CTRI/2024/08/071902",
        phase: "Phase 3",
        recruitment_status: "Completed",
      },
    });
    const outcome = await extractDocument(pool, new ExplodingProvider(), d);
    expect(outcome.fallbackUsed).toBe(true);
    expect(outcome.confidence).toBeLessThanOrEqual(FALLBACK_CONFIDENCE);
    expect(outcome.reviewStatus).toBe("pending_review");
    // The fallback still produces schema-valid structured facts — no crash.
    expect(outcome.extraction.trial_ids).toEqual(["CTRI/2024/08/071902"]);
    expect(outcome.extraction.company_names).toEqual(["Sun Pharmaceutical Industries Ltd"]);
    const { rows } = await pool.query<{ fallback_used: boolean; review_status: string }>(
      "SELECT fallback_used, review_status FROM extractions WHERE id = $1::uuid",
      [outcome.extractionId],
    );
    expect(rows[0].fallback_used).toBe(true);
    expect(rows[0].review_status).toBe("pending_review");
  });

  it("invalid JSON from a provider falls back instead of crashing", async () => {
    const d = doc("Garbage in, deterministic summary out.");
    const outcome = await extractDocument(
      pool,
      new GarbageProvider({ event_type: "not-a-real-type", confidence: "high" }),
      d,
    );
    expect(outcome.fallbackUsed).toBe(true);
    expect(outcome.reviewStatus).toBe("pending_review");
    expect(outcome.extraction.outcome).toBe("unknown");
  });
});

describe("confidence-threshold review rules (spec §8.3)", () => {
  function endpointCanned(confidence: number) {
    return cannedExtraction({
      event_type: "clinical_trial_result",
      outcome: "primary_endpoint_met",
      confidence,
      facts: [
        { claim: "The primary endpoint was met.", source_span: "primary endpoint was met", confidence },
      ],
    });
  }

  it("low-confidence endpoint claim → pending_review, never auto-published", async () => {
    const d = doc("Low-confidence endpoint claim.");
    const provider = new MockModelProvider({ [d.contentHash]: endpointCanned(0.7) });
    const outcome = await extractDocument(pool, provider, d);
    expect(outcome.fallbackUsed).toBe(false);
    expect(outcome.extraction.outcome).toBe("primary_endpoint_met");
    expect(outcome.confidence).toBeLessThan(PUBLISH_CONFIDENCE_THRESHOLD);
    expect(outcome.reviewStatus).toBe("pending_review");
  });

  it("high-confidence endpoint claim may publish", async () => {
    const d = doc("High-confidence endpoint claim.");
    const provider = new MockModelProvider({ [d.contentHash]: endpointCanned(0.95) });
    const outcome = await extractDocument(pool, provider, d);
    expect(outcome.reviewStatus).toBe("published");
  });

  it("boundary: exactly at the threshold publishes", async () => {
    const d = doc("Boundary confidence claim.");
    const provider = new MockModelProvider({ [d.contentHash]: endpointCanned(0.85) });
    const outcome = await extractDocument(pool, provider, d);
    expect(outcome.reviewStatus).toBe("published");
  });

  it("high-confidence non-endpoint extraction publishes", async () => {
    const d = doc("Routine status update.");
    const provider = new MockModelProvider({
      [d.contentHash]: cannedExtraction({
        event_type: "clinical_trial_status_changed",
        outcome: "unknown",
        confidence: 0.92,
      }),
    });
    const outcome = await extractDocument(pool, provider, d);
    expect(outcome.reviewStatus).toBe("published");
  });
});

describe("stored summaries", () => {
  it("persists factual + catalyst summaries on the extraction row", async () => {
    const d = doc("Summary persistence check.", {
      structured: {
        sponsor_name: "Biocon Ltd",
        intervention_name: "BCN-Trastuzumab",
        health_condition: "HER2-positive metastatic breast cancer",
        phase: "Phase 3",
        recruitment_status: "Active, not recruiting",
        ctri_number: "CTRI/2023/05/051208",
        last_updated: "2026-07-30",
      },
    });
    const outcome = await extractDocument(pool, new MockModelProvider(), d);
    const { rows } = await pool.query<{ factual_summary: string; catalyst_summary: string }>(
      "SELECT factual_summary, catalyst_summary FROM extractions WHERE id = $1::uuid",
      [outcome.extractionId],
    );
    expect(rows[0].factual_summary.length).toBeGreaterThan(50);
    expect(rows[0].catalyst_summary.length).toBeGreaterThan(20);
    expect(outcome.factualSummary).toBe(rows[0].factual_summary);
  });
});
