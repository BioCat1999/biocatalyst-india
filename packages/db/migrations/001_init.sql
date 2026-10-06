-- 001_init.sql — Canonical schema, spec §5.
--
-- UUID primary keys throughout (spec: "Prefer UUID primary keys").
-- `legacy_id` columns preserve the Milestone 1 seed-fixture string ids for
-- traceability; runtime code uses the UUIDs.
-- Provenance columns (source links, published_at / retrieved_at, content
-- hash) are NOT NULL where the spec requires every surfaced fact to carry
-- a source URL + timestamp.
--
-- Small extensions beyond the spec's suggested table list, kept minimal so
-- the TypeScript contracts in @biocatalyst/types map 1:1:
--   * events.indication / events.phase / events.outcome (nullable)
--   * trials.primary_endpoints TEXT[]  (spec §4.5: "primary endpoints when available")
--   * drug_indications join table     (Drug.indications in the TS contract)

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- trigram search, spec §10

-- NOTE: the schema_migrations bookkeeping table is created by the migrate
-- runner itself (packages/db/src/migrate.ts), not by migration files.

CREATE TABLE companies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id      TEXT UNIQUE,
  canonical_name TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  description    TEXT NOT NULL DEFAULT '',
  country        TEXT NOT NULL DEFAULT '',
  website        TEXT NOT NULL DEFAULT '',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE securities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  exchange   TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE')),
  ticker     TEXT NOT NULL,
  isin       TEXT,
  currency   TEXT NOT NULL DEFAULT 'INR',
  active     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (company_id, exchange, ticker)
);

CREATE TABLE drugs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id      TEXT UNIQUE,
  canonical_name TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  modality       TEXT,
  mechanism      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE indications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL UNIQUE,
  ontology_id    TEXT
);

CREATE TABLE sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id    TEXT UNIQUE,
  source_type  TEXT NOT NULL DEFAULT 'announcement',
  title        TEXT,
  publisher    TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL,
  canonical_url TEXT,
  published_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT,
  UNIQUE (url)
);

CREATE TABLE company_aliases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  alias_type  TEXT,
  confidence  DOUBLE PRECISION,
  source_id   UUID REFERENCES sources(id),
  UNIQUE (company_id, alias)
);

CREATE TABLE drug_aliases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_id    UUID NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  alias      TEXT NOT NULL,
  source_id  UUID REFERENCES sources(id),
  confidence DOUBLE PRECISION,
  UNIQUE (drug_id, alias)
);

CREATE TABLE drug_company_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_id           UUID NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  start_date        DATE,
  end_date          DATE,
  source_id         UUID REFERENCES sources(id),
  UNIQUE (drug_id, company_id, relationship_type)
);

CREATE TABLE drug_indications (
  drug_id       UUID NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  indication_id UUID NOT NULL REFERENCES indications(id) ON DELETE CASCADE,
  PRIMARY KEY (drug_id, indication_id)
);

CREATE TABLE trials (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id               TEXT UNIQUE,
  registry                TEXT NOT NULL,
  registry_trial_id       TEXT NOT NULL,
  title                   TEXT NOT NULL DEFAULT '',
  phase                   TEXT,
  status                  TEXT,
  enrollment              INTEGER,
  sponsor_company_id      UUID REFERENCES companies(id),
  start_date              DATE,
  primary_completion_date DATE,
  source_url              TEXT NOT NULL DEFAULT '',
  primary_endpoints       TEXT[],
  UNIQUE (registry, registry_trial_id)
);

CREATE TABLE trial_drugs (
  trial_id UUID NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  drug_id  UUID NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  role     TEXT,
  PRIMARY KEY (trial_id, drug_id)
);

CREATE TABLE trial_indications (
  trial_id      UUID NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  indication_id UUID NOT NULL REFERENCES indications(id) ON DELETE CASCADE,
  PRIMARY KEY (trial_id, indication_id)
);

CREATE TABLE events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        TEXT UNIQUE,
  event_type       TEXT NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL,
  published_at     TIMESTAMPTZ,
  headline         TEXT NOT NULL DEFAULT '',
  factual_summary  TEXT NOT NULL DEFAULT '',
  catalyst_summary TEXT NOT NULL DEFAULT '',
  confidence       DOUBLE PRECISION,
  review_status    TEXT NOT NULL DEFAULT 'published',
  indication       TEXT,
  phase            TEXT,
  outcome          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_entities (
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('company', 'drug', 'trial')),
  entity_id   UUID NOT NULL,
  relationship TEXT,
  PRIMARY KEY (event_id, entity_type, entity_id)
);
CREATE INDEX event_entities_entity ON event_entities (entity_type, entity_id);

CREATE TABLE event_sources (
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_id    UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  support_type TEXT,
  PRIMARY KEY (event_id, source_id)
);

CREATE TABLE market_prices (
  security_id     UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  ts              TIMESTAMPTZ NOT NULL,
  open            DOUBLE PRECISION,
  high            DOUBLE PRECISION,
  low             DOUBLE PRECISION,
  close           DOUBLE PRECISION,
  volume          BIGINT,
  source_provider TEXT,
  PRIMARY KEY (security_id, ts)
);

CREATE TABLE market_reactions (
  event_id             UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  security_id          UUID NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
  price_before         DOUBLE PRECISION NOT NULL,
  price_after          DOUBLE PRECISION NOT NULL,
  pct_change           DOUBLE PRECISION NOT NULL,
  benchmark_name       TEXT,
  benchmark_pct_change DOUBLE PRECISION,
  relative_change      DOUBLE PRECISION,
  window_definition    TEXT NOT NULL DEFAULT '',
  provider             TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (event_id, security_id)
);

CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE watchlist_items (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('company', 'drug')),
  entity_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entity_type, entity_id)
);

CREATE TABLE alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  UNIQUE (user_id, event_id, channel)
);

-- Trigram indexes for prefix/fuzzy search, spec §10 ("Postgres
-- full-text/trigram initially" — trigram first, no Elasticsearch).
CREATE INDEX companies_name_trgm      ON companies       USING gin (canonical_name gin_trgm_ops);
CREATE INDEX company_aliases_trgm     ON company_aliases USING gin (alias gin_trgm_ops);
CREATE INDEX drugs_name_trgm          ON drugs           USING gin (canonical_name gin_trgm_ops);
CREATE INDEX drug_aliases_trgm        ON drug_aliases    USING gin (alias gin_trgm_ops);
CREATE INDEX trials_title_trgm        ON trials          USING gin (title gin_trgm_ops);
CREATE INDEX trials_regid_trgm        ON trials          USING gin (registry_trial_id gin_trgm_ops);
CREATE INDEX events_headline_trgm     ON events          USING gin (headline gin_trgm_ops);
CREATE INDEX events_factual_trgm       ON events          USING gin (factual_summary gin_trgm_ops);
