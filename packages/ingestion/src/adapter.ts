/**
 * SourceAdapter contract — spec §7.
 *
 * Every source (live or fixture-backed) implements this interface. The
 * ingestion runner (`run.ts`) only talks to this interface, so adding a
 * second source is a matter of adding one adapter class plus fixtures —
 * never runner changes.
 *
 * Cursor is an opaque string owned by the adapter. For the M3 fixture
 * adapter it is an ISO-8601 timestamp ("only documents published after
 * this"). `fetchSince` returns raw documents newer than the cursor;
 * `getNextCursor` reports the cursor that would resume after the docs
 * returned by the most recent `fetchSince` call.
 */
export type Cursor = string;

/**
 * A single source document as fetched, before normalization.
 * Provenance (spec §7) starts here: canonical URL, content hash,
 * retrieved_at, published_at, and the source name travel with the document
 * all the way into the `sources` table.
 */
export interface RawSourceDocument {
  /** Adapter's sourceName — provenance, spec §7. */
  sourceName: string;
  /** Canonicalized URL of the source record. */
  canonicalUrl: string;
  /** SHA-256 hex of the canonicalized raw payload. */
  contentHash: string;
  /** When we retrieved/captured this document (ISO 8601). */
  retrievedAt: string;
  /** When the source published it (ISO 8601), or null if unknown. */
  publishedAt: string | null;
  /** The original payload — kept verbatim in `raw_snapshots`. */
  raw: unknown;
}

/**
 * One publishable event candidate produced from a raw document.
 * Unknown or unmappable fields stay null (spec §17) — the runner rejects
 * candidates that cannot fill the required canonical columns instead of
 * guessing.
 */
export interface NormalizedCandidate {
  sourceName: string;
  canonicalUrl: string;
  contentHash: string;
  retrievedAt: string;
  publishedAt: string | null;
  /** Null when the record cannot be mapped to the closed taxonomy. */
  eventType: string | null;
  /** ISO 8601. Null when not derivable from the record. */
  occurredAt: string | null;
  headline: string;
  factualSummary: string;
  catalystSummary: string;
  /** 0..1 — deterministic template extraction is 0.9 (see normalize.ts). */
  confidence: number;
  indication: string | null;
  phase: string | null;
  outcome: string | null;
  trialRefs: { registry: string; registryTrialId: string }[];
  companyNames: string[];
  drugNames: string[];
  sourceTitle: string;
  publisher: string;
  isPrimary: boolean;
  /** Event-level dedupe key (spec §7), computed by the adapter. */
  fingerprint: string;
  /**
   * Optional cross-source dedupe key (M7): set only when the adapter can
   * anchor the candidate to a canonical trial registry ID
   * (`crossSourceKey()` in normalize.ts). The runner merges candidates
   * sharing a key into ONE event with all sources linked via
   * `event_sources`; first writer wins on headline/type/summaries.
   */
  crossSourceKey?: string | null;
  /** Verbatim raw record for the snapshot store. */
  rawSnapshot: unknown;
}

export interface SourceAdapter {
  readonly sourceName: string;
  fetchSince(cursor: Cursor): Promise<RawSourceDocument[]>;
  normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]>;
  getNextCursor(): Cursor;
}
