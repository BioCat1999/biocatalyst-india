-- First-class listings for the next BioCatalyst regions.
ALTER TABLE securities DROP CONSTRAINT IF EXISTS securities_exchange_check;
ALTER TABLE securities
  ADD CONSTRAINT securities_exchange_check
  CHECK (exchange IN (
    'NSE','BSE','NYSE','NASDAQ','LSE','EPA','XETRA','SWX','TSE',
    'AMS','EBR','HKEX'
  ));

ALTER TABLE securities DROP CONSTRAINT IF EXISTS securities_currency_check;
ALTER TABLE securities
  ADD CONSTRAINT securities_currency_check
  CHECK (currency IN ('INR','USD','CHF','EUR','GBP','JPY','HKD'));

CREATE INDEX IF NOT EXISTS companies_country_name_idx
  ON companies (country, canonical_name, id);
