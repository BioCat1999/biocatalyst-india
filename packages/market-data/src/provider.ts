/**
 * Market-data provider selection — Milestone 5 (+ Yahoo Finance).
 *
 * The provider is ALWAYS behind the `MarketDataProvider` interface. No code
 * path may call a real market-data API directly.
 *
 * - `fixture` (default): offline fixture provider — illustrative synthetic
 *   prices, no network, no keys. Safe default for dev/tests and offline use.
 * - `yahoo`: Yahoo Finance chart API — real delayed NSE/BSE daily bars via a
 *   free, keyless (unofficial) endpoint. Needs no API key, which satisfies
 *   the global privacy constraint; see docs/decisions.md ("Market-data
 *   provider: Yahoo Finance").
 */
import type { MarketDataProvider } from "./types.js";

/** `MARKET_DATA_PROVIDER`: "fixture" (default) | "yahoo". Unknown values warn and fall back. */
export const MARKET_DATA_PROVIDER_ENV = "MARKET_DATA_PROVIDER";

export async function selectProvider(): Promise<MarketDataProvider> {
  const raw = (process.env[MARKET_DATA_PROVIDER_ENV] ?? "fixture").trim().toLowerCase();
  if (raw === "yahoo") {
    const { YahooFinanceProvider } = await import("./providers/yahoo.js");
    return new YahooFinanceProvider();
  }
  if (raw === "fixture" || raw === "") {
    const { FixtureMarketDataProvider } = await import("./providers/fixture.js");
    return new FixtureMarketDataProvider();
  }
  console.warn(
    `[market-data] unknown ${MARKET_DATA_PROVIDER_ENV}="${raw}"; falling back to "fixture" (offline).`,
  );
  const { FixtureMarketDataProvider } = await import("./providers/fixture.js");
  return new FixtureMarketDataProvider();
}
