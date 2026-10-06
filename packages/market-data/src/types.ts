/**
 * Market-data provider contract — Milestone 5 (spec §9).
 *
 * All price access goes through this interface so the provider is replaceable:
 * the default is the offline fixture provider (`MARKET_DATA_PROVIDER=fixture`),
 * and a future licensed provider implements the same interface without any
 * caller changes. No code path may require a real provider API key.
 */

import type { Exchange } from "@biocatalyst/types";

/** A listed security, identified the way an exchange would quote it. */
export interface SecurityRef {
  exchange: Exchange;
  ticker: string;
}

/**
 * One daily price bar. End-of-day data is acceptable for MVP (spec §2.2);
 * `date` is the exchange-local trading date (YYYY-MM-DD). Intraday fields are
 * optional — the §9 calculation only needs closes.
 */
export interface PriceBar {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface MarketDataProvider {
  /**
   * Provider name — persisted on `market_reactions.provider`. Must be stable:
   * "fixture" | ... (a future licensed provider picks its own name).
   */
  readonly providerName: string;
  /**
   * License/usage note persisted on `market_reactions.license_metadata`
   * (spec §9: "Store provider and license/usage metadata").
   */
  readonly licenseMetadata: string;
  /**
   * Benchmark this provider can supply (e.g. "NIFTY_PHARMA"), if any.
   * Absent when the provider has no licensed benchmark — callers then omit
   * benchmark fields rather than fabricating them (spec §9).
   */
  readonly benchmarkId?: string;
  readonly benchmarkName?: string;
  /**
   * Daily bars for `security` with `from <= date <= to` (inclusive,
   * YYYY-MM-DD), ascending by date. Returns [] for unknown securities —
   * never throws for missing data (missing → nulls downstream).
   */
  getPrices(security: SecurityRef, from: string, to: string): Promise<PriceBar[]>;
  /**
   * Daily bars for a benchmark index. Optional: providers without a licensed
   * benchmark leave this unimplemented and the calculation stores nulls.
   */
  getBenchmarkPrices?(benchmarkId: string, from: string, to: string): Promise<PriceBar[]>;
}
