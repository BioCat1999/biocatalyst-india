-- Saved filters / keyword alerts. One rule can combine dimensions; empty
-- arrays mean "any" for that dimension.
CREATE TABLE IF NOT EXISTS monitor_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  keyword     TEXT,
  event_types TEXT[] NOT NULL DEFAULT '{}',
  countries   TEXT[] NOT NULL DEFAULT '{}',
  indications TEXT[] NOT NULL DEFAULT '{}',
  phases      TEXT[] NOT NULL DEFAULT '{}',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (keyword IS NOT NULL OR cardinality(event_types) > 0 OR cardinality(countries) > 0
         OR cardinality(indications) > 0 OR cardinality(phases) > 0),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS monitor_rules_user_idx ON monitor_rules (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS monitor_rules_enabled_idx ON monitor_rules (user_id) WHERE enabled = true;
