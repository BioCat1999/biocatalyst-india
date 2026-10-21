-- Unified forward-looking calendar. Registry trial completions and patent
-- expiries are read from their canonical tables; this stores dates that do
-- not naturally belong there (PDUFA, advisory committees, conferences,
-- earnings and company-guided readouts).
CREATE TABLE IF NOT EXISTS catalyst_milestones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           TEXT NOT NULL CHECK (kind IN (
    'pdufa','advisory_committee','regulatory_decision','trial_readout',
    'conference','earnings','ipo','other'
  )),
  event_date     DATE NOT NULL,
  date_precision TEXT NOT NULL DEFAULT 'day' CHECK (date_precision IN ('day','month','quarter','year')),
  title          TEXT NOT NULL,
  detail         TEXT NOT NULL DEFAULT '',
  company_id     UUID REFERENCES companies(id) ON DELETE SET NULL,
  drug_id        UUID REFERENCES drugs(id) ON DELETE SET NULL,
  trial_id       UUID REFERENCES trials(id) ON DELETE SET NULL,
  country        TEXT NOT NULL DEFAULT '',
  source_url     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','estimated','completed','cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, event_date, source_url)
);

CREATE INDEX IF NOT EXISTS catalyst_milestones_date_idx
  ON catalyst_milestones (event_date, kind);
CREATE INDEX IF NOT EXISTS catalyst_milestones_country_date_idx
  ON catalyst_milestones (country, event_date);
