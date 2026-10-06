-- Widen securities.exchange to cover the global exchanges used by the
-- global pharma company catalog (NYSE, NASDAQ, LSE, EPA, XETRA, SWX, TSE).
-- Also widen the currency CHECK to cover USD/CHF/EUR/GBP/JPY.
-- Safe to run repeatedly (IF NOT EXISTS / guarded drops).

ALTER TABLE securities DROP CONSTRAINT IF EXISTS securities_exchange_check;
ALTER TABLE securities
  ADD CONSTRAINT securities_exchange_check
  CHECK (exchange IN ('NSE','BSE','NYSE','NASDAQ','LSE','EPA','XETRA','SWX','TSE'));

ALTER TABLE securities DROP CONSTRAINT IF EXISTS securities_currency_check;
ALTER TABLE securities
  ADD CONSTRAINT securities_currency_check
  CHECK (currency IN ('INR','USD','CHF','EUR','GBP','JPY'));
