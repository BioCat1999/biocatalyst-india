-- 002_add_source_title.sql — SourceRecord.title exists in the TS contract and
-- in the seed fixtures; the 001 schema omitted the column. Added here for
-- databases already migrated to 001 (001_init.sql includes it for fresh DBs).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS title TEXT;
