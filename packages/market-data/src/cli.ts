#!/usr/bin/env node
/**
 * Market-reaction CLI — Milestone 5.
 *
 *   pnpm market:reaction
 *   # or: pnpm --filter @biocatalyst/market-data market:reaction
 *
 * Computes §9 market reactions for published events with a known event_time
 * and upserts them into `market_reactions` (idempotent — re-runs refresh
 * rather than duplicate). Applies migrations first. Uses the provider
 * selected by MARKET_DATA_PROVIDER (default "fixture"); fully offline, no
 * API keys required. Prints run metrics as JSON.
 */
import { getPool, closePool, migrate } from "@biocatalyst/db";
import { selectProvider, MARKET_DATA_PROVIDER_ENV } from "./provider.js";
import { computeAndStoreReactions } from "./store.js";

const pool = getPool();
try {
  await migrate(pool);
  const provider = await selectProvider();
  console.error(
    `[market:reaction] provider=${provider.providerName} (via ${MARKET_DATA_PROVIDER_ENV})`,
  );
  const metrics = await computeAndStoreReactions(pool, provider);
  console.log(JSON.stringify(metrics, null, 2));
  if (metrics.errors.length > 0) process.exitCode = 1;
} finally {
  await closePool();
}
