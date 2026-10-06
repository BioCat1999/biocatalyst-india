/**
 * Market-reaction panel copy tests — spec §9.
 *
 * The panel must show the exact measurement window, the provider, and
 * benchmark-relative values when present — and must NEVER use causation
 * language ("market reaction around the event", never "caused by").
 * Rendered with react-dom/server so no DOM/test-library is needed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MarketReaction } from "@biocatalyst/types";
import { MarketReactionPanel } from "./MarketReaction";

const FULL: MarketReaction = {
  windowDefinition:
    "NSE close on 2026-09-28 → NSE close on 2026-09-29 (announcement 2026-09-29 08:15 IST — before market open)",
  windowStart: "2026-09-28T15:30:00+05:30",
  windowEnd: "2026-09-29T15:30:00+05:30",
  securityTicker: "SUNPHARMA",
  exchange: "NSE",
  priceBefore: 1842.5,
  priceAfter: 1931.2,
  pctChange: 4.81,
  benchmarkName: "NIFTY Pharma (fixture)",
  benchmarkPctChange: 0.6,
  relativeChange: 4.21,
  provider: "fixture",
  licenseMetadata: "Illustrative fixture prices — not real market data.",
};

const NULLS: MarketReaction = {
  windowDefinition: "no earlier price data → NSE close on 2026-09-28 (announcement 2026-09-27 10:00 IST — non-trading day)",
  windowStart: null,
  windowEnd: "2026-09-28T15:30:00+05:30",
  securityTicker: "SUNPHARMA",
  exchange: "NSE",
  priceBefore: null,
  priceAfter: 1842.5,
  pctChange: null,
  provider: "fixture",
};

const CAUSATION_WORDS = [
  "caused by",
  "due to the event",
  "triggered by",
  "drove the",
  "led to the",
  "result of the event",
  "because of the event",
];
// The one allowed "caus*" occurrence: the explicit non-causal disclaimer.
const ALLOWED_CAUSATION_SENTENCE = "does not imply the event caused the move";

describe("MarketReactionPanel copy (spec §9)", () => {
  it("shows the exact measurement window, provider, and benchmark-relative values", () => {
    const html = renderToStaticMarkup(<MarketReactionPanel mr={FULL} />);
    expect(html).toContain(FULL.windowDefinition);
    expect(html).toContain("fixture");
    expect(html).toContain("NIFTY Pharma (fixture)");
    expect(html).toContain("+4.21%"); // relative change
    expect(html).toContain("Illustrative fixture prices");
  });

  it("renders nulls as unavailable instead of crashing or inventing numbers", () => {
    const html = renderToStaticMarkup(<MarketReactionPanel mr={NULLS} />);
    expect(html).toContain("Not available");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Relative change");
  });

  it("never uses causation language", () => {
    for (const mr of [FULL, NULLS]) {
      const html = renderToStaticMarkup(<MarketReactionPanel mr={mr} />).toLowerCase();
      for (const phrase of CAUSATION_WORDS) {
        expect(html, `panel copy must not contain "${phrase}"`).not.toContain(phrase);
      }
      // Any "caus*" wording must be the explicit non-causal disclaimer, not
      // an attribution of the move to the event.
      const stripped = html.split(ALLOWED_CAUSATION_SENTENCE).join("");
      expect(stripped, 'unexpected "caus*" wording outside the disclaimer').not.toContain("caus");
      // The required non-causal framing is present.
      expect(html).toContain("market reaction around the event");
      expect(html).toContain(ALLOWED_CAUSATION_SENTENCE);
    }
  });
});
