/**
 * Fixture provider tests: series shape, unknown-security behavior (→ []),
 * benchmark access, determinism, and MARKET_DATA_PROVIDER selection.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FixtureMarketDataProvider,
  FIXTURE_LICENSE,
  FIXTURE_PRICE_SERIES,
  NIFTY_PHARMA_FIXTURE_BARS,
  NIFTY_PHARMA_FIXTURE_ID,
  NIFTY_PHARMA_FIXTURE_NAME,
} from "./providers/fixture.js";
import { MARKET_DATA_PROVIDER_ENV, selectProvider } from "./provider.js";

describe("FixtureMarketDataProvider", () => {
  const p = new FixtureMarketDataProvider();

  it("exposes the stable provider name and license metadata", () => {
    expect(p.providerName).toBe("fixture");
    expect(p.licenseMetadata).toBe(FIXTURE_LICENSE);
    expect(p.licenseMetadata.length).toBeGreaterThan(0);
    expect(p.benchmarkId).toBe(NIFTY_PHARMA_FIXTURE_ID);
    expect(p.benchmarkName).toBe(NIFTY_PHARMA_FIXTURE_NAME);
  });

  it("returns ascending bars within the requested range", async () => {
    const bars = await p.getPrices(
      { exchange: "NSE", ticker: "SUNPHARMA" },
      "2026-09-01",
      "2026-09-30",
    );
    expect(bars.length).toBeGreaterThan(10);
    for (const b of bars) {
      expect(b.date >= "2026-09-01" && b.date <= "2026-09-30").toBe(true);
      expect(b.close).toBeGreaterThan(0);
    }
    const dates = bars.map((b) => b.date);
    expect([...dates].sort()).toEqual(dates);
    // weekdays only — no weekend bars in the fixture calendar
    for (const d of dates) {
      const dow = new Date(d + "T00:00:00Z").getUTCDay();
      expect(dow).toBeGreaterThanOrEqual(1);
      expect(dow).toBeLessThanOrEqual(5);
    }
  });

  it("covers the seeded tickers except the MANKIND canary", () => {
    expect(Object.keys(FIXTURE_PRICE_SERIES).sort()).toEqual([
      "AUROPHARMA",
      "BIOCON",
      "CIPLA",
      "DIVISLAB",
      "DRREDDY",
      "LUPIN",
      "SUNPHARMA",
      "TORNTPHARM",
      "ZYDUSLIFE",
    ]);
  });

  it("unknown ticker and the MANKIND canary → [] (no fabrication)", async () => {
    expect(
      await p.getPrices({ exchange: "NSE", ticker: "NOPE" }, "2026-09-01", "2026-09-30"),
    ).toEqual([]);
    expect(
      await p.getPrices({ exchange: "NSE", ticker: "MANKIND" }, "2026-09-01", "2026-09-30"),
    ).toEqual([]);
  });

  it("is deterministic across calls (no randomness, no network)", async () => {
    const a = await p.getPrices({ exchange: "NSE", ticker: "DRREDDY" }, "2026-08-01", "2026-09-30");
    const b = await p.getPrices({ exchange: "NSE", ticker: "DRREDDY" }, "2026-08-01", "2026-09-30");
    expect(a).toEqual(b);
  });

  it("serves the NIFTY-Pharma-like fixture benchmark; unknown id → []", async () => {
    const bars = await p.getBenchmarkPrices!(
      NIFTY_PHARMA_FIXTURE_ID,
      "2026-09-01",
      "2026-09-30",
    );
    expect(bars.length).toBeGreaterThan(10);
    expect(bars).toEqual(
      NIFTY_PHARMA_FIXTURE_BARS.filter((x) => x.date >= "2026-09-01" && x.date <= "2026-09-30"),
    );
    expect(await p.getBenchmarkPrices!("SOME_OTHER_INDEX", "2026-09-01", "2026-09-30")).toEqual(
      [],
    );
  });
});

describe("selectProvider", () => {
  afterEach(() => {
    delete process.env[MARKET_DATA_PROVIDER_ENV];
    vi.restoreAllMocks();
  });

  it("defaults to the fixture provider", async () => {
    const p = await selectProvider();
    expect(p.providerName).toBe("fixture");
  });

  it("selects fixture explicitly via MARKET_DATA_PROVIDER=fixture", async () => {
    process.env[MARKET_DATA_PROVIDER_ENV] = "fixture";
    expect((await selectProvider()).providerName).toBe("fixture");
  });

  it("selects the Yahoo Finance provider via MARKET_DATA_PROVIDER=yahoo", async () => {
    process.env[MARKET_DATA_PROVIDER_ENV] = "yahoo";
    const p = await selectProvider();
    expect(p.providerName).toBe("yahoo");
    expect(p.licenseMetadata.length).toBeGreaterThan(0);
    expect(p.benchmarkId).toBeUndefined(); // no licensed benchmark — nulls downstream
  });

  it("unknown value warns and falls back to fixture (always works offline)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[MARKET_DATA_PROVIDER_ENV] = "bloomberg-terminal";
    const p = await selectProvider();
    expect(p.providerName).toBe("fixture");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("falling back"));
  });
});
