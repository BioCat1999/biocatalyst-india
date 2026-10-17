/**
 * Source adapter registry — Milestone 7 (+ live sources).
 *
 * One registry owns every source adapter: the CLI (`pnpm ingest`), the
 * admin ingestion endpoint, and tests all resolve adapters through
 * `createAdapter()` / `runAllIngestion()`. Adding a source is: one adapter
 * class, one line in `ADAPTER_FACTORIES` — no runner, CLI, or route changes
 * (spec §7: "Add sources one at a time").
 *
 * Sources: three fixture adapters (offline dev/test data — inert after
 * their first run thanks to cursoring) plus three LIVE adapters that call
 * free, keyless public endpoints:
 *   - `ctgov`: ClinicalTrials.gov API v2 (trials)
 *   - `gdelt`: GDELT DOC 2.0 API (news)
 *   - `press-rss`: company press-release RSS feeds (no API keys)
 *   - `prnewswire`: PR Newswire category wire feeds (no API keys) —
 *     multi-company, per-item attribution; needs hourly polling
 *   - `openfda`: FDA drug approvals + recalls (no API key)
 */
import type { Pool } from "pg";
import type { SourceAdapter } from "./adapter.js";
import { CtriFixtureAdapter } from "./adapters/ctri.js";
import { BseFixtureAdapter } from "./adapters/bse.js";
import { PubmedFixtureAdapter } from "./adapters/pubmed.js";
import { CtgovAdapter } from "./adapters/ctgov.js";
import { GdeltAdapter } from "./adapters/gdelt.js";
import { PressRssAdapter } from "./adapters/rss.js";
import { PrNewswireAdapter } from "./adapters/prnewswire.js";
import { OpenFdaAdapter } from "./adapters/fda.js";
import { PubmedAdapter } from "./adapters/pubmed-live.js";
import { SebiRssAdapter } from "./adapters/sebi.js";
import { runIngestion, type IngestionMetrics } from "./run.js";

export const ADAPTER_FACTORIES: Record<string, () => SourceAdapter> = {
  "ctri-fixture": () => new CtriFixtureAdapter(),
  "bse-fixture": () => new BseFixtureAdapter(),
  "pubmed-fixture": () => new PubmedFixtureAdapter(),
  ctgov: () => new CtgovAdapter(),
  gdelt: () => new GdeltAdapter(),
  "press-rss": () => new PressRssAdapter(),
  prnewswire: () => new PrNewswireAdapter(),
  openfda: () => new OpenFdaAdapter(),
  pubmed: () => new PubmedAdapter(),
  "sebi-rss": () => new SebiRssAdapter(),
};

/** Registered source names, in run order. */
export function listSourceNames(): string[] {
  return Object.keys(ADAPTER_FACTORIES);
}

/** Instantiate the adapter for a source name, or null when unknown. */
export function createAdapter(sourceName: string): SourceAdapter | null {
  const factory = ADAPTER_FACTORIES[sourceName];
  return factory ? factory() : null;
}

/**
 * Run one ingestion pass for EVERY registered adapter, in registration
 * order, and return the per-source metrics. Registration order is the
 * deterministic tie-break for cross-source merges: the first source to
 * describe an event owns the event row; later sources link into it.
 */
export async function runAllIngestion(pool: Pool): Promise<IngestionMetrics[]> {
  const results: IngestionMetrics[] = [];
  for (const name of listSourceNames()) {
    const adapter = createAdapter(name);
    if (!adapter) continue; // cannot happen — registry is the source of truth
    results.push(await runIngestion(pool, adapter));
  }
  return results;
}
