-- Milestone 7: cross-source event dedupe.
--
-- `events.cross_source_key` is a source-agnostic identity for the same
-- underlying real-world event described by two sources (e.g. a BSE
-- announcement and a PubMed article about the same trial readout). Adapters
-- that can anchor a candidate to a canonical trial registry ID set it
-- (see crossSourceKey() in packages/ingestion/src/normalize.ts); the
-- runner merges same-key candidates into ONE event row and links both
-- sources via event_sources instead of creating duplicate events.
--
-- Partial unique index: NULL keys (the default for seed data and for
-- non-trial-anchored events) are exempt, so existing rows are unaffected.
ALTER TABLE events ADD COLUMN IF NOT EXISTS cross_source_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS events_cross_source_key_uniq
  ON events (cross_source_key)
  WHERE cross_source_key IS NOT NULL;
