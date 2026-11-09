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

/**
 * Regular trading session per exchange, in the exchange's own time zone.
 * Before/after closes are chosen against these hours, so a 09:00 New York
 * release counts as "before the NYSE open", not "after the NSE close".
 */
interface Session {
  timeZone: string;
  label: string;
  openMinutes: number;
  closeMinutes: number;
}
const hm = (h: number, m = 0) => h * 60 + m;
const INDIA: Session = { timeZone: "Asia/Kolkata", label: "IST", openMinutes: hm(9, 15), closeMinutes: hm(15, 30) };
const SESSIONS: Record<Exchange, Session> = {
  NSE: INDIA,
  BSE: INDIA,
  NYSE: { timeZone: "America/New_York", label: "New York time", openMinutes: hm(9, 30), closeMinutes: hm(16) },
  NASDAQ: { timeZone: "America/New_York", label: "New York time", openMinutes: hm(9, 30), closeMinutes: hm(16) },
  LSE: { timeZone: "Europe/London", label: "London time", openMinutes: hm(8), closeMinutes: hm(16, 30) },
  EPA: { timeZone: "Europe/Paris", label: "Paris time", openMinutes: hm(9), closeMinutes: hm(17, 30) },
  XETRA: { timeZone: "Europe/Berlin", label: "Frankfurt time", openMinutes: hm(9), closeMinutes: hm(17, 30) },
  SWX: { timeZone: "Europe/Zurich", label: "Zurich time", openMinutes: hm(9), closeMinutes: hm(17, 30) },
  TSE: { timeZone: "Asia/Tokyo", label: "Tokyo time", openMinutes: hm(9), closeMinutes: hm(15, 30) },
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (before: number, after: number) => round2((after / before - 1) * 100);

/** Split an ISO timestamp into the exchange-local calendar date + time. */
function localParts(iso: string, timeZone: string): { date: string; minutes: number; hm: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid eventTime: ${iso}`);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
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

/** The exchange close on `date` as ISO 8601 with that day's UTC offset. */
function closeTimestamp(date: string, session: Session): string {
  const hh = String(Math.floor(session.closeMinutes / 60)).padStart(2, "0");
  const mm = String(session.closeMinutes % 60).padStart(2, "0");
  // Offset at noon UTC that day (no exchange closes inside a DST switch hour).
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: session.timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = name === "GMT" ? "+00:00" : name.replace("GMT", "");
  return `${date}T${hh}:${mm}:00${offset}`;
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

  const session = SESSIONS[exchange] ?? INDIA;
  const { date: d, minutes: t, hm: at } = localParts(eventTime, session.timeZone);
  const when = `${d} ${at} ${session.label}`;

  let before: string | undefined;
  let after: string | undefined;
  let timingNote: string;

  if (!eventTimeKnown) {
    before = dates.filter((x) => x < d).pop();
    after = dates.find((x) => x >= d);
    timingNote = "daily window — exact announcement time unknown";
  } else if (dates.includes(d) && t >= session.closeMinutes) {
    // Announced on a trading day after the close: the event-day close is
    // legitimately "before"; the reaction shows up on the next close.
    before = d;
    after = dates.find((x) => x > d);
    timingNote = `announcement ${when} — after market close`;
  } else {
    // Before the open, during market hours, or on a non-trading day: the
    // last close strictly before the event day is "before".
    before = dates.filter((x) => x < d).pop();
    after = dates.find((x) => x >= d);
    if (!dates.includes(d)) {
      timingNote = `announcement ${when} — non-trading day`;
    } else if (t < session.openMinutes) {
      timingNote = `announcement ${when} — before market open`;
    } else {
      timingNote = `announcement ${when} — during market hours`;
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
    windowStart: before ? closeTimestamp(before, session) : null,
    windowEnd: after ? closeTimestamp(after, session) : null,
    provider: providerName,
    ...(licenseMetadata ? { licenseMetadata } : {}),
  };
}
