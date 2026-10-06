/**
 * Market-reaction calculation — Milestone 5, spec §9 implemented exactly.
 *
 *   event_time       = timestamp of the public event, if known
 *   price_before     = latest permitted price immediately before event window
 *   price_after      = selected close / delayed price after event window
 *   pct_change       = (price_after / price_before − 1) × 100
 *   benchmark_change = same calculation for the selected benchmark
 *   relative_change  = pct_change − benchmark_change
 *
 * Rules enforced here:
 * - The measurement window is always determined and described (never implied).
 * - Missing prices are stored as NULL — never fabricated or interpolated.
 * - Benchmark fields are omitted (null) when benchmark data is unavailable
 *   for the window, rather than fabricated (spec §9).
 * - Nothing here implies causation; it is a timing-overlap measurement only.
 */
import type { Exchange } from "@biocatalyst/types";
import type { PriceBar } from "./types.js";

export interface ReactionInput {
  /** ISO-8601 timestamp of the public event (spec §9 `event_time`). */
  eventTime: string;
  /**
   * False when only the calendar date is known — then a clearly labeled
   * daily window is used instead of a time-of-day window (spec §9).
   */
  eventTimeKnown?: boolean;
  exchange: Exchange;
  securityTicker: string;
  /** Daily bars for the security; their dates define the trading calendar. */
  securityBars: PriceBar[];
  /** Daily bars for the benchmark; absent → benchmark fields stay null. */
  benchmarkBars?: PriceBar[];
  benchmarkName?: string;
  providerName: string;
  licenseMetadata?: string;
}

export interface ComputedReaction {
  securityTicker: string;
  exchange: Exchange;
  priceBefore: number | null;
  priceAfter: number | null;
  pctChange: number | null;
  benchmarkName: string | null;
  benchmarkPctChange: number | null;
  relativeChange: number | null;
  /** Exact measurement window, human readable — always present. */
  windowDefinition: string;
  /** Window bounds as exchange-local close timestamps (ISO 8601). */
  windowStart: string | null;
  windowEnd: string | null;
  provider: string;
  licenseMetadata?: string;
}

/** NSE/BSE regular close, 15:30 IST. */
const CLOSE_MINUTES = 15 * 60 + 30;

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (before: number, after: number) => round2((after / before - 1) * 100);

/** Split an ISO timestamp into IST calendar date + time parts. */
function istParts(iso: string): { date: string; minutes: number; hm: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid eventTime: ${iso}`);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  // Some ICU builds emit "24" for midnight with hour12:false — normalize.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(hour) * 60 + Number(parts.minute),
    hm: `${hour}:${parts.minute}`,
  };
}

function closeOn(bars: PriceBar[], date: string | undefined): number | null {
  if (!date) return null;
  return bars.find((b) => b.date === date)?.close ?? null;
}

/**
 * Compute the §9 market reaction. Returns null only when no measurement
 * window can be formed at all (no usable bar dates); any partial data gap
 * inside a formable window yields nulls for the missing pieces.
 */
export function computeReaction(input: ReactionInput): ComputedReaction | null {
  const {
    eventTime,
    eventTimeKnown = true,
    exchange,
    securityTicker,
    securityBars,
    benchmarkBars,
    benchmarkName,
    providerName,
    licenseMetadata,
  } = input;

  const dates = [...new Set(securityBars.map((b) => b.date))].sort();
  if (dates.length === 0) return null;

  const { date: d, minutes: t, hm } = istParts(eventTime);

  let before: string | undefined;
  let after: string | undefined;
  let timingNote: string;

  if (!eventTimeKnown) {
    before = dates.filter((x) => x < d).pop();
    after = dates.find((x) => x >= d);
    timingNote = "daily window — exact announcement time unknown";
  } else if (dates.includes(d) && t >= CLOSE_MINUTES) {
    // Announced on a trading day after the close: the event-day close is
    // legitimately "before"; the reaction shows up on the next close.
    before = d;
    after = dates.find((x) => x > d);
    timingNote = `announcement ${d} ${hm} IST — after market close`;
  } else {
    // Before the open, during market hours, or on a non-trading day: the
    // last close strictly before the event day is "before".
    before = dates.filter((x) => x < d).pop();
    after = dates.find((x) => x >= d);
    if (!dates.includes(d)) {
      timingNote = `announcement ${d} ${hm} IST — non-trading day`;
    } else if (t < 9 * 60 + 15) {
      timingNote = `announcement ${d} ${hm} IST — before market open`;
    } else {
      timingNote = `announcement ${d} ${hm} IST — during market hours`;
    }
  }

  if (before === undefined && after === undefined) return null;

  const priceBefore = closeOn(securityBars, before);
  const priceAfter = closeOn(securityBars, after);
  const pctChange = priceBefore != null && priceAfter != null ? pct(priceBefore, priceAfter) : null;

  let outBenchmarkName: string | null = null;
  let benchmarkPctChange: number | null = null;
  if (benchmarkBars) {
    outBenchmarkName = benchmarkName ?? null;
    const benchBefore = closeOn(benchmarkBars, before);
    const benchAfter = closeOn(benchmarkBars, after);
    benchmarkPctChange =
      benchBefore != null && benchAfter != null ? pct(benchBefore, benchAfter) : null;
  }
  const relativeChange =
    pctChange != null && benchmarkPctChange != null
      ? round2(pctChange - benchmarkPctChange)
      : null;

  const beforeLabel = before ? `${exchange} close on ${before}` : "no earlier price data";
  const afterLabel = after ? `${exchange} close on ${after}` : "no later price data";
  const windowDefinition = `${beforeLabel} → ${afterLabel} (${timingNote})`;

  return {
    securityTicker,
    exchange,
    priceBefore,
    priceAfter,
    pctChange,
    benchmarkName: outBenchmarkName,
    benchmarkPctChange,
    relativeChange,
    windowDefinition,
    windowStart: before ? `${before}T15:30:00+05:30` : null,
    windowEnd: after ? `${after}T15:30:00+05:30` : null,
    provider: providerName,
    ...(licenseMetadata ? { licenseMetadata } : {}),
  };
}
