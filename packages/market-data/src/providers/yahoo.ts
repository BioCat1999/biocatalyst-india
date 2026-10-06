/**
 * Yahoo Finance market-data provider — real (delayed) NSE/BSE daily bars.
 *
 * Source: Yahoo Finance's chart API (`query1.finance.yahoo.com/v8/finance/
 * chart`), a free endpoint that requires no API key. NSE tickers map to
 * `<TICKER>.NS`, BSE tickers to `<TICKER>.BO`. Select with
 * `MARKET_DATA_PROVIDER=yahoo` (default remains the offline `fixture`
 * provider).
 *
 * Honesty notes, persisted on every row via `licenseMetadata`:
 * - Unofficial API, delayed quotes (~15 minutes), for personal/research use;
 *   no redistribution.
 * - No benchmark: the provider leaves `benchmarkId`/`benchmarkName`
 *   undefined, so the §9 calculation stores nulls for benchmark fields rather
 *   than fabricating them (spec §9, §17).
 *
 * Failure discipline: `getPrices` NEVER throws for missing data — unknown
 * tickers, HTTP errors, rate limits and malformed payloads all yield `[]`,
 * and the pipeline stores nulls downstream (spec §17).
 */
import type { MarketDataProvider, PriceBar, SecurityRef } from "../types.js";

export const YAHOO_PROVIDER_NAME = "yahoo";

export const YAHOO_LICENSE =
  "Yahoo Finance unofficial chart API — delayed quotes (~15 min) for " +
  "personal/research use; no redistribution. Not investment advice.";

const REQUEST_TIMEOUT_MS = 15_000;

function yahooSymbol(security: SecurityRef): string | null {
  if (security.exchange === "NSE") return `${security.ticker}.NS`;
  if (security.exchange === "BSE") return `${security.ticker}.BO`;
  // Global listings map to Yahoo's exchange suffixes; NYSE/NASDAQ need none.
  if (security.exchange === "NYSE" || security.exchange === "NASDAQ")
    return security.ticker;
  if (security.exchange === "LSE") return `${security.ticker}.L`;
  if (security.exchange === "EPA") return `${security.ticker}.PA`;
  if (security.exchange === "XETRA") return `${security.ticker}.DE`;
  if (security.exchange === "SWX") return `${security.ticker}.SW`;
  if (security.exchange === "TSE") return `${security.ticker}.T`;
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: {
        "User-Agent": "BiocatalystIndia/1.0 (personal research use; market-data ingestion)",
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Yahoo Finance request failed: HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

export class YahooFinanceProvider implements MarketDataProvider {
  readonly providerName = YAHOO_PROVIDER_NAME;
  readonly licenseMetadata = YAHOO_LICENSE;
  // No benchmarkId/benchmarkName: no licensed benchmark — callers store nulls.
  readonly benchmarkId?: string;
  readonly benchmarkName?: string;

  private readonly fetchImpl: typeof fetch;

  /** `fetchImpl` is injectable so tests can stub the API. */
  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
  }

  async getPrices(security: SecurityRef, from: string, to: string): Promise<PriceBar[]> {
    try {
      const symbol = yahooSymbol(security);
      if (!symbol) return [];
      const period1 = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
      const period2 = Math.floor(new Date(`${to}T00:00:00Z`).getTime() / 1000) + 86_400;
      if (!Number.isFinite(period1) || !Number.isFinite(period2) || period2 < period1) return [];
      const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?period1=${period1}&period2=${period2}&interval=1d`;
      const data = (await getJson(this.fetchImpl, url)) as {
        chart?: { result?: unknown[]; error?: unknown };
      };
      const result = data?.chart?.result?.[0] as
        | {
            timestamp?: unknown[];
            indicators?: { quote?: { open?: unknown[]; high?: unknown[]; low?: unknown[]; close?: unknown[]; volume?: unknown[] }[] };
          }
        | undefined;
      if (!result) return [];
      const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
      const quote = result.indicators?.quote?.[0] ?? {};
      const bars: PriceBar[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = num(timestamps[i]);
        const close = num(quote.close?.[i]);
        if (ts === null || close === null) continue; // missing bar — skip, never fabricate
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        if (date < from || date > to) continue;
        const bar: PriceBar = { date, close: round2(close) };
        const open = num(quote.open?.[i]);
        if (open !== null) bar.open = round2(open);
        const high = num(quote.high?.[i]);
        if (high !== null) bar.high = round2(high);
        const low = num(quote.low?.[i]);
        if (low !== null) bar.low = round2(low);
        const volume = num(quote.volume?.[i]);
        if (volume !== null) bar.volume = Math.round(volume);
        bars.push(bar);
      }
      return bars; // Yahoo returns ascending timestamps
    } catch {
      return []; // never throw for missing data — nulls downstream
    }
  }
}
