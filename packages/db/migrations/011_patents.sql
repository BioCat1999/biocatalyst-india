-- 011: Orange Book patents table.
--
-- Monthly FDA Orange Book snapshot: patents listed against approved NDAs
-- (patent.txt joined to products.txt on appl_no + product_no). Only NDA
-- patents are listed in the Orange Book (appl_type is always 'N'); ANDA
-- products reference these patents but hold none of their own.
--
-- company_id / drug_id resolve to tracked catalog rows where the applicant
-- or trade name matches; null when unmatched (the cliff tracker still
-- surfaces them). Delisted rows are kept with delisted=true so a re-list
-- is an update, not a surprise insert.
CREATE TABLE patents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patent_number       TEXT NOT NULL,
  appl_no             TEXT NOT NULL,
  product_no          TEXT NOT NULL,
  trade_name          TEXT NOT NULL DEFAULT '',
  applicant           TEXT NOT NULL DEFAULT '',
  active_ingredient   TEXT NOT NULL DEFAULT '',
  expiry_date         DATE,
  drug_substance_flag BOOLEAN NOT NULL DEFAULT FALSE,
  drug_product_flag   BOOLEAN NOT NULL DEFAULT FALSE,
  patent_use_code     TEXT,
  delisted            BOOLEAN NOT NULL DEFAULT FALSE,
  company_id          UUID REFERENCES companies(id) ON DELETE SET NULL,
  drug_id             UUID REFERENCES drugs(id) ON DELETE SET NULL,
  source_id           UUID REFERENCES sources(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patent_number, appl_no, product_no)
);

CREATE INDEX patents_expiry_date_idx ON patents (expiry_date)
  WHERE delisted = FALSE AND expiry_date IS NOT NULL;
CREATE INDEX patents_company_id_idx ON patents (company_id)
  WHERE company_id IS NOT NULL;
CREATE INDEX patents_applicant_idx ON patents (applicant);
