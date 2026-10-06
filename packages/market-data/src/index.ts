/**
 * @biocatalyst/market-data — Milestone 5: market-data adapter + §9
 * market-reaction calculations.
 *
 * The provider is always behind the `MarketDataProvider` interface
 * (`getPrices(security, from, to)`), selected by `MARKET_DATA_PROVIDER`
 * ("fixture" default — offline, no API keys). The §9 math lives in
 * `calculate.ts`; `store.ts` wires computation into the `market_reactions`
 * table idempotently.
 */
export type { MarketDataProvider, PriceBar, SecurityRef } from "./types.js";
export {
  MARKET_DATA_PROVIDER_ENV,
  selectProvider,
} from "./provider.js";
export {
  FixtureMarketDataProvider,
  FIXTURE_PROVIDER_NAME,
  FIXTURE_LICENSE,
  FIXTURE_PRICE_SERIES,
  NIFTY_PHARMA_FIXTURE_ID,
  NIFTY_PHARMA_FIXTURE_NAME,
  NIFTY_PHARMA_FIXTURE_BARS,
} from "./providers/fixture.js";
export {
  YahooFinanceProvider,
  YAHOO_PROVIDER_NAME,
  YAHOO_LICENSE,
} from "./providers/yahoo.js";
export type { ComputedReaction, ReactionInput } from "./calculate.js";
export { computeReaction } from "./calculate.js";
export type { DbLike, ReactionRunMetrics } from "./store.js";
export { computeAndStoreReactions } from "./store.js";
