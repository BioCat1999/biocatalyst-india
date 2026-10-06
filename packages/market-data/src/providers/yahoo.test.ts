/**
 * Tests for the Yahoo Finance market-data provider.
 *
 * The chart API is stubbed via an injected `fetch` — no network in tests.
 * Fixture payloads mirror the real v8 chart shape observed on 2026-10-01
 * (`chart.result[0].timestamp`, `indicators.quote[0]` with
 * open/high/low/close/volume arrays).
 */
import { describe, expect, it, vi } from "vitest";
import { YahooFinanceProvider, YAHOO_PROVIDER_NAME } from "./yahoo.js";

function chartJson(overrides: Record<string, unknown> = {}) {
  return {
    chart: {
      result: [
        {
          timestamp: [1789948800, 1790035200, 1790121600], // 2026-09-21..23 UTC
          indicators: {
            quote: [
              {
                open: [388.3, 394.3, null],
                high: [396.15, 396.25, 397.2],
                low: [387.6, 389.0, 388.6],
                close: [395.0, 390.0, 395.0],
                volume: [3037626, 2816261, 2665586],
              },
            ],
          },
        },
      ],
      error: null,
      ...overrides,
    },
  };
}

function stubFetch(payload: unknown, ok = true, status = 200) {
  const mock = vi.fn(async (..._args: unknown[]) => ({
    ok,
    status,
    json: async () => payload,
  }));
  return { fetchImpl: mock as unknown as typeof fetch, calls: mock.mock.calls };
}

describe("YahooFinanceProvider", () => {
  it("maps NSE/BSE tickers to Yahoo symbols and parses daily bars", async () => {
    const { fetchImpl, calls } = stubFetch(chartJson());
    const provider = new YahooFinanceProvider(fetchImpl);
    expect(provider.providerName).toBe(YAHOO_PROVIDER_NAME);
    expect(provider.benchmarkId).toBeUndefined();

    const bars = await provider.getPrices({ exchange: "NSE", ticker: "BIOCON" }, "2026-09-21", "2026-09-23");
    expect(bars).toHaveLength(3);
    expect(bars[0]).toMatchObject({ date: "2026-09-21", close: 395.0, open: 388.3, volume: 3037626 });
    expect(bars[2].open).toBeUndefined(); // null open stays absent, never fabricated

    const calledUrl = String(calls[0][0]);
    expect(calledUrl).toContain("/chart/BIOCON.NS?");
    expect(calledUrl).toContain("interval=1d");
  });

  it("uses .BO for BSE securities", async () => {
    const { fetchImpl, calls } = stubFetch(chartJson());
    const provider = new YahooFinanceProvider(fetchImpl);
    await provider.getPrices({ exchange: "BSE", ticker: "BIOCON" }, "2026-09-21", "2026-09-23");
    expect(String(calls[0][0])).toContain("/chart/BIOCON.BO?");
  });

  it("returns [] on HTTP errors instead of throwing", async () => {
    const provider = new YahooFinanceProvider(stubFetch({}, false, 429).fetchImpl);
    await expect(
      provider.getPrices({ exchange: "NSE", ticker: "BIOCON" }, "2026-09-21", "2026-09-23"),
    ).resolves.toEqual([]);
  });

  it("returns [] for unknown tickers (no chart result)", async () => {
    const provider = new YahooFinanceProvider(stubFetch({ chart: { result: [], error: { code: "Not Found" } } }).fetchImpl);
    await expect(
      provider.getPrices({ exchange: "NSE", ticker: "NOPE" }, "2026-09-21", "2026-09-23"),
    ).resolves.toEqual([]);
  });

  it("skips bars with missing closes and clips to the requested range", async () => {
    const payload = chartJson();
    const quote = (payload.chart.result[0] as { indicators: { quote: { close: (number | null)[] }[] } }).indicators.quote[0];
    quote.close = [395.0, null, 395.0];
    const provider = new YahooFinanceProvider(stubFetch(payload).fetchImpl);
    const bars = await provider.getPrices({ exchange: "NSE", ticker: "BIOCON" }, "2026-09-21", "2026-09-22");
    expect(bars.map((b) => b.date)).toEqual(["2026-09-21"]); // null close skipped, 09-23 out of range
  });

  it("returns [] for invalid date ranges instead of throwing", async () => {
    const provider = new YahooFinanceProvider(stubFetch(chartJson()).fetchImpl);
    await expect(
      provider.getPrices({ exchange: "NSE", ticker: "BIOCON" }, "not-a-date", "2026-09-23"),
    ).resolves.toEqual([]);
  });
});
