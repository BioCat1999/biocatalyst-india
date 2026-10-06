/**
 * Model provider interface — Milestone 4 (spec §8).
 *
 * The extractor is ALWAYS behind this interface. No code path may call a
 * real model API directly. Default selection is the offline deterministic
 * extractor; a fixture "mock" provider is available for tests and for
 * exercising model-like behavior without any network or API keys.
 *
 * Why no real model is wired: cost, key management, and offline-first
 * operation — see docs/decisions.md ("M4 — No real model API"). When a
 * real provider is wanted, implement this interface (e.g. a
 * `LocalModelProvider` shelling out to an on-device model, or an
 * HTTP-backed provider), add it to `selectProvider()`, and bump
 * PROMPT_VERSION.
 */
import type { StructuredExtraction } from "./schema.js";

/**
 * One document to extract from. `contentHash` is the cache key component;
 * `text` is free text the provider may quote `source_span`s from;
 * `structured` carries adapter-known fields (record columns) verbatim.
 */
export interface ExtractionDocument {
  /** SHA-256 hex of the canonicalized source payload — the cache key. */
  contentHash: string;
  /** Free text to extract from (headline + summary + record text). */
  text: string;
  /** Adapter-known structured fields, quoted verbatim in source_spans. */
  structured?: Record<string, unknown>;
  sourceName: string;
  canonicalUrl: string;
  /** Human-readable publisher for summary templates (defaults to sourceName). */
  publisher?: string;
  publishedAt: string | null;
  /** Adapter's taxonomy classification (closed union); may be undefined. */
  eventType?: string;
}

export interface ExtractionProvider {
  /**
   * Provider name — persisted on `extractions.provider` and part of the
   * cache key. Must be stable: "deterministic" | "mock" | ...
   */
  readonly providerName: string;
  /**
   * Extract structured facts from the document. May return raw JSON
   * (validated by the pipeline) or throw — the pipeline converts both
   * into deterministic fallback, never into a crash (spec §17).
   */
  extract(doc: ExtractionDocument): Promise<unknown>;
}

/** `MODEL_PROVIDER`: "deterministic" (default) | "mock". Unknown values
 *  warn and fall back to deterministic — the build always works offline. */
export const MODEL_PROVIDER_ENV = "MODEL_PROVIDER";

export async function selectProvider(): Promise<ExtractionProvider> {
  const raw = (process.env[MODEL_PROVIDER_ENV] ?? "deterministic").trim().toLowerCase();
  if (raw === "mock") {
    const { MockModelProvider } = await import("./providers/mock.js");
    return new MockModelProvider();
  }
  if (raw !== "deterministic") {
    console.warn(
      `[extraction] unknown ${MODEL_PROVIDER_ENV}="${raw}" — using deterministic extractor`,
    );
  }
  const { DeterministicExtractor } = await import("./providers/deterministic.js");
  return new DeterministicExtractor();
}

/** Synchronous variant for tests (providers are importable directly). */
export function providerNameFromEnv(): "deterministic" | "mock" {
  const raw = (process.env[MODEL_PROVIDER_ENV] ?? "deterministic").trim().toLowerCase();
  return raw === "mock" ? "mock" : "deterministic";
}

export type { StructuredExtraction };
