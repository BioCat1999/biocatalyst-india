-- 005_market_reaction_nullable.sql — Milestone 5 (spec §9).
--
-- Market-reaction math must never fabricate or interpolate prices: when a
-- price is unavailable for the measurement window it is stored as NULL, so
-- price_before / price_after / pct_change become nullable (they were NOT NULL
-- in 001_init.sql, written when reactions were hand-seeded).
--
-- Also records the exact measurement-window bounds and the provider's
-- license/usage metadata on every row, per spec §9 ("Store provider and
-- license/usage metadata").
ALTER TABLE market_reactions
  ALTER COLUMN price_before DROP NOT NULL,
  ALTER COLUMN price_after DROP NOT NULL,
  ALTER COLUMN pct_change DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS window_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS license_metadata TEXT;
