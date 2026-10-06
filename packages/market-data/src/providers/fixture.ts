/**
 * Fixture market-data provider — Milestone 5 (spec §9).
 *
 * ---------------------------------------------------------------------------
 * ILLUSTRATIVE FIXTURE DATA — NOT REAL MARKET PRICES. FOR DEV/TESTS ONLY.
 * ---------------------------------------------------------------------------
 * Base price levels per ticker are hand-chosen to look plausible for large
 * Indian pharma names; the daily path is a deterministic synthetic walk
 * (FNV-1a hash of "ticker|date", so every run produces the identical series
 * with no randomness and no network). Nothing here is a real quote, and the
 * provider name + license metadata say so on every stored row.
 *
 * Coverage: NSE daily bars for 9 of the 10 seeded tickers, 2026-08-03 ..
 * 2026-09-30 (Mon–Fri; no holiday calendar in fixtures — documented in
 * docs/decisions.md). MANKIND is deliberately absent: it is the permanent
 * missing-data canary proving the pipeline stores nulls instead of
 * fabricating prices (spec §9, §17).
 *
 * Benchmark: a NIFTY-Pharma-like synthetic index, clearly labeled
 * "NIFTY Pharma (fixture)" — it is NOT the real NIFTY Pharma index.
 */
import type { MarketDataProvider, PriceBar, SecurityRef } from "../types.js";

export const FIXTURE_PROVIDER_NAME = "fixture";

export const FIXTURE_LICENSE =
  "Illustrative fixture prices — not real market data. " +
  "Generated locally for development and tests; no redistribution.";

export const NIFTY_PHARMA_FIXTURE_ID = "NIFTY_PHARMA_FIXTURE";
export const NIFTY_PHARMA_FIXTURE_NAME = "NIFTY Pharma (fixture)";

/** Hand-picked plausible base levels (INR) for the seeded NSE tickers. */
const BASE_CLOSE: Record<string, number> = {
  SUNPHARMA: 1840.0,
  DRREDDY: 1352.0,
  CIPLA: 1549.0,
  BIOCON: 377.0,
  DIVISLAB: 6120.0,
  LUPIN: 2095.0,
  AUROPHARMA: 1132.0,
  ZYDUSLIFE: 1048.0,
  TORNTPHARM: 3415.0,
  // NOTE: MANKIND intentionally omitted (missing-data canary — see above).
};

const BENCHMARK_BASE = 22850.0;

/** FNV-1a 32-bit hash → deterministic pseudo-random in [0, 1). */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** Weekday trading dates (Mon–Fri) in YYYY-MM-DD, fixtures have no holiday calendar. */
function tradingDays(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Deterministic synthetic daily closes anchored at a hand-picked base level. */
function buildSeries(key: string, base: number, dailyVol: number): PriceBar[] {
  const bars: PriceBar[] = [];
  let prev = base;
  for (const date of tradingDays("2026-08-01", "2026-09-30")) {
    const ret = (hash01(`${key}|${date}`) - 0.5) * 2 * dailyVol;
    const close = round2(prev * (1 + ret));
    bars.push({ date, close });
    prev = close;
  }
  return bars;
}

/** Fixture daily bars per NSE ticker (illustrative — not real quotes). */
export const FIXTURE_PRICE_SERIES: Record<string, PriceBar[]> = Object.fromEntries(
  Object.entries(BASE_CLOSE).map(([ticker, base]) => [ticker, buildSeries(ticker, base, 0.012)]),
);

/** Fixture benchmark bars (illustrative — not the real NIFTY Pharma index). */
export const NIFTY_PHARMA_FIXTURE_BARS: PriceBar[] = buildSeries(
  NIFTY_PHARMA_FIXTURE_ID,
  BENCHMARK_BASE,
  0.008,
);

export class FixtureMarketDataProvider implements MarketDataProvider {
  readonly providerName = FIXTURE_PROVIDER_NAME;
  readonly licenseMetadata = FIXTURE_LICENSE;
  readonly benchmarkId = NIFTY_PHARMA_FIXTURE_ID;
  readonly benchmarkName = NIFTY_PHARMA_FIXTURE_NAME;

  async getPrices(security: SecurityRef, from: string, to: string): Promise<PriceBar[]> {
    const series = FIXTURE_PRICE_SERIES[security.ticker.toUpperCase()];
    if (!series) return []; // unknown security → no data, never fabricated
    return series.filter((b) => b.date >= from && b.date <= to);
  }

  async getBenchmarkPrices(benchmarkId: string, from: string, to: string): Promise<PriceBar[]> {
    if (benchmarkId !== NIFTY_PHARMA_FIXTURE_ID) return [];
    return NIFTY_PHARMA_FIXTURE_BARS.filter((b) => b.date >= from && b.date <= to);
  }
}
