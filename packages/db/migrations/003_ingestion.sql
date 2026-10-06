-- 003_ingestion.sql — Milestone 3 ingestion support (spec §7, §20).
--
-- * sources.source_name: provenance requires the source name alongside
--   retrieved_at / published_at / URL / content hash (spec §7).
-- * events.fingerprint: event-level dedupe key (spec §7: canonical URL +
--   content hash + event fingerprint). Nullable so the M1/M2 seed rows are
--   untouched; unique where present.
-- * raw_snapshots: keeps the raw source document per (source, canonical URL)
--   so re-runs can detect changed documents and re-normalize only those.
-- * ingestion_runs / ingestion_cursors: persist run metrics and the
--   per-source cursor that powers health reporting (spec §20).

ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS fingerprint TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS events_fingerprint_uniq ON events (fingerprint);

CREATE TABLE IF NOT EXISTS raw_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name   TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  raw           JSONB NOT NULL,
  retrieved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_name, canonical_url)
);
CREATE INDEX IF NOT EXISTS raw_snapshots_source ON raw_snapshots (source_name);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name      TEXT NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'success', 'failed')),
  docs_fetched     INTEGER NOT NULL DEFAULT 0,
  docs_changed     INTEGER NOT NULL DEFAULT 0,
  events_created   INTEGER NOT NULL DEFAULT 0,
  events_rejected  INTEGER NOT NULL DEFAULT 0,
  newest_source_ts TIMESTAMPTZ,
  error            TEXT
);
CREATE INDEX IF NOT EXISTS ingestion_runs_source ON ingestion_runs (source_name, started_at DESC);

CREATE TABLE IF NOT EXISTS ingestion_cursors (
  source_name TEXT PRIMARY KEY,
  cursor      TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
