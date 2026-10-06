/**
 * §9 calculation tests — hand-verified examples, window edge cases, and
 * benchmark-relative math. All expected values were computed by hand from
 * the inputs below (see comments), not copied from the implementation.
 */
import { describe, expect, it } from "vitest";
import { computeReaction } from "./calculate.js";
import type { PriceBar } from "./types.js";

const bars = (pairs: [string, number][]): PriceBar[] =>
  pairs.map(([date, close]) => ({ date, close }));

const SEC_BARS = bars([
  ["2026-09-25", 100.0],
  ["2026-09-28", 102.0],
  ["2026-09-29", 105.06],
]);
const BENCH_BARS = bars([
  ["2026-09-25", 1000.0],
  ["2026-09-28", 1005.0],
  ["2026-09-29", 1010.0],
]);

const BASE = {
  exchange: "NSE" as const,
  securityTicker: "TEST",
  securityBars: SEC_BARS,
  benchmarkBars: BENCH_BARS,
  benchmarkName: "NIFTY Pharma (fixture)",
  providerName: "fixture",
  licenseMetadata: "fixture license",
};

describe("computeReaction — §9 math (hand-verified)", () => {
  it("before market open: prev close → event-day close", () => {
    // event 2026-09-29 08:15 IST → before = 09-28 (102.00), after = 09-29 (105.06)
    // pct = (105.06/102 − 1)*100 = 3.00
    // bench = (1010/1005 − 1)*100 = 0.4975… → 0.50
    // relative = 3.00 − 0.50 = 2.50
    const r = computeReaction({ ...BASE, eventTime: "2026-09-29T08:15:00+05:30" })!;
    expect(r.priceBefore).toBe(102.0);
    expect(r.priceAfter).toBe(105.06);
    expect(r.pctChange).toBe(3.0);
    expect(r.benchmarkPctChange).toBe(0.5);
    expect(r.relativeChange).toBe(2.5);
    expect(r.windowDefinition).toBe(
      "NSE close on 2026-09-28 → NSE close on 2026-09-29 " +
        "(announcement 2026-09-29 08:15 IST — before market open)",
    );
    expect(r.windowStart).toBe("2026-09-28T15:30:00+05:30");
    expect(r.windowEnd).toBe("2026-09-29T15:30:00+05:30");
    expect(r.provider).toBe("fixture");
  });

  it("during market hours: prev trading-day close → event-day close", () => {
    // event 2026-09-28 14:00 IST → before = 09-25 (100.00), after = 09-28 (102.00)
    // pct = 2.00; bench = (1005/1000−1)*100 = 0.50; relative = 1.50
    const r = computeReaction({ ...BASE, eventTime: "2026-09-28T14:00:00+05:30" })!;
    expect(r.priceBefore).toBe(100.0);
    expect(r.priceAfter).toBe(102.0);
    expect(r.pctChange).toBe(2.0);
    expect(r.benchmarkPctChange).toBe(0.5);
    expect(r.relativeChange).toBe(1.5);
    expect(r.windowDefinition).toContain("during market hours");
  });

  it("after market close: event-day close → next trading-day close", () => {
    // event 2026-09-25 18:30 IST → before = 09-25 (100.00), after = 09-28 (102.00)
    const r = computeReaction({ ...BASE, eventTime: "2026-09-25T18:30:00+05:30" })!;
    expect(r.priceBefore).toBe(100.0);
    expect(r.priceAfter).toBe(102.0);
    expect(r.pctChange).toBe(2.0);
    expect(r.windowDefinition).toContain("after market close");
  });

  it("weekend event: prev close → next trading-day close", () => {
    // 2026-09-26 is a Saturday → before = 09-25 (100.00), after = 09-28 (102.00)
    const r = computeReaction({ ...BASE, eventTime: "2026-09-26T10:00:00+05:30" })!;
    expect(r.priceBefore).toBe(100.0);
    expect(r.priceAfter).toBe(102.0);
    expect(r.pctChange).toBe(2.0);
    expect(r.windowDefinition).toContain("non-trading day");
  });

  it("negative move math", () => {
    const down = bars([
      ["2026-09-28", 200.0],
      ["2026-09-29", 190.0],
    ]);
    // pct = (190/200−1)*100 = −5.00
    const r = computeReaction({
      ...BASE,
      securityBars: down,
      benchmarkBars: undefined,
      eventTime: "2026-09-29T08:15:00+05:30",
    })!;
    expect(r.pctChange).toBe(-5.0);
    expect(r.benchmarkName).toBeNull();
    expect(r.relativeChange).toBeNull();
  });
});

describe("computeReaction — missing data → nulls, never fabricated", () => {
  it("missing after-bar → nulls, no crash", () => {
    const short = bars([["2026-09-28", 102.0]]);
    const r = computeReaction({
      ...BASE,
      securityBars: short,
      benchmarkBars: bars([["2026-09-28", 1005.0]]),
      eventTime: "2026-09-29T08:15:00+05:30",
    })!;
    expect(r.priceBefore).toBe(102.0);
    expect(r.priceAfter).toBeNull();
    expect(r.pctChange).toBeNull();
    expect(r.benchmarkPctChange).toBeNull();
    expect(r.relativeChange).toBeNull();
    expect(r.windowDefinition).toContain("no later price data");
    expect(r.windowEnd).toBeNull();
  });

  it("missing before-bar → nulls, no crash", () => {
    const short = bars([["2026-09-28", 102.0]]);
    const r = computeReaction({
      ...BASE,
      securityBars: short,
      benchmarkBars: bars([["2026-09-28", 1005.0]]),
      eventTime: "2026-09-27T10:00:00+05:30", // Sunday, before first bar
    })!;
    expect(r.priceBefore).toBeNull();
    expect(r.priceAfter).toBe(102.0);
    expect(r.pctChange).toBeNull();
    expect(r.windowDefinition).toContain("no earlier price data");
    expect(r.windowStart).toBeNull();
  });

  it("empty bars → null (no window can be formed)", () => {
    const r = computeReaction({
      ...BASE,
      securityBars: [],
      eventTime: "2026-09-29T08:15:00+05:30",
    });
    expect(r).toBeNull();
  });

  it("no benchmark bars → benchmark fields null, security math still computed", () => {
    const r = computeReaction({
      ...BASE,
      benchmarkBars: undefined,
      eventTime: "2026-09-29T08:15:00+05:30",
    })!;
    expect(r.pctChange).toBe(3.0);
    expect(r.benchmarkName).toBeNull();
    expect(r.benchmarkPctChange).toBeNull();
    expect(r.relativeChange).toBeNull();
  });

  it("benchmark missing for the window → benchmark nulls, not fabricated", () => {
    const r = computeReaction({
      ...BASE,
      benchmarkBars: bars([["2026-09-28", 1005.0]]), // no 09-29 bar
      eventTime: "2026-09-29T08:15:00+05:30",
    })!;
    expect(r.pctChange).toBe(3.0);
    expect(r.benchmarkName).toBe("NIFTY Pharma (fixture)");
    expect(r.benchmarkPctChange).toBeNull();
    expect(r.relativeChange).toBeNull();
  });

  it("unknown time → clearly labeled daily window", () => {
    const r = computeReaction({
      ...BASE,
      eventTimeKnown: false,
      eventTime: "2026-09-28T00:00:00+05:30",
    })!;
    expect(r.priceBefore).toBe(100.0); // last close strictly before the date
    expect(r.priceAfter).toBe(102.0); // first close on/after the date
    expect(r.windowDefinition).toContain("daily window — exact announcement time unknown");
  });

  it("invalid eventTime throws a clear error", () => {
    expect(() =>
      computeReaction({ ...BASE, eventTime: "not-a-date" }),
    ).toThrow(/invalid eventTime/);
  });
});
