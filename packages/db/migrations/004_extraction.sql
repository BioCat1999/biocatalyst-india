-- 004_extraction.sql — Milestone 4 AI extraction support (spec §8).
--
-- * extractions: every model-produced record, keyed by
--   (document_hash, provider, prompt_version, schema_version) so the same
--   document is never re-extracted under the same prompt/schema version
--   (spec §8.1 content-hash caching; §8.3 prompt/schema versioning).
--   Stores the validated §8.2 output JSON, derived summaries, effective
--   confidence, review status, and whether the deterministic fallback was
--   used.
-- * events.extraction_id: links a canonical event to its extraction.
--   Nullable so M1/M2 seed rows are untouched.

CREATE TABLE IF NOT EXISTS extractions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_hash   TEXT NOT NULL,
  provider        TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  schema_version  TEXT NOT NULL,
  output          JSONB NOT NULL,
  factual_summary TEXT NOT NULL,
  catalyst_summary TEXT NOT NULL,
  confidence      REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  review_status   TEXT NOT NULL DEFAULT 'pending_review'
                  CHECK (review_status IN ('published', 'pending_review', 'rejected')),
  fallback_used   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_hash, provider, prompt_version, schema_version)
);
CREATE INDEX IF NOT EXISTS extractions_document_hash ON extractions (document_hash);
CREATE INDEX IF NOT EXISTS extractions_review_status ON extractions (review_status);

ALTER TABLE events ADD COLUMN IF NOT EXISTS extraction_id UUID REFERENCES extractions(id);
