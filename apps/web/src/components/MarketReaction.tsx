import type { MarketReaction } from "@biocatalyst/types";
import { formatPct, mrClass } from "@/lib/format";

/**
 * Market reaction panel — spec §9.
 * Shows the exact measurement window and provider; never implies causation.
 * Prices may be null when no price data covers that side of the window —
 * per spec §9, missing data is shown as unavailable, never interpolated.
 */
export function MarketReactionPanel({ mr }: { mr: MarketReaction }) {
  return (
    <div>
      <dl className="kv">
        <dt>Window</dt>
        <dd>{mr.windowDefinition}</dd>
        <dt>Security</dt>
        <dd>
          {mr.securityTicker} ({mr.exchange})
        </dd>
        <dt>Price before</dt>
        <dd>{mr.priceBefore != null ? `₹${mr.priceBefore.toFixed(2)}` : "Not available"}</dd>
        <dt>Price after</dt>
        <dd>{mr.priceAfter != null ? `₹${mr.priceAfter.toFixed(2)}` : "Not available"}</dd>
        {mr.pctChange != null && (
          <>
            <dt>Change</dt>
            <dd className={mrClass(mr.pctChange)} style={{ fontWeight: 700 }}>
              {formatPct(mr.pctChange)}
            </dd>
          </>
        )}
        {mr.benchmarkName && mr.benchmarkPctChange != null && (
          <>
            <dt>Benchmark</dt>
            <dd>
              {mr.benchmarkName} ({formatPct(mr.benchmarkPctChange)})
            </dd>
          </>
        )}
        {mr.relativeChange != null && (
          <>
            <dt>Relative change</dt>
            <dd className={mrClass(mr.relativeChange)} style={{ fontWeight: 700 }}>
              {formatPct(mr.relativeChange)}
            </dd>
          </>
        )}
        <dt>Provider</dt>
        <dd>{mr.provider}</dd>
      </dl>
      {mr.licenseMetadata && (
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>
          Data note: {mr.licenseMetadata}
        </p>
      )}
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12 }}>
        Market reaction around the event — timing overlap does not imply the
        event caused the move.
      </p>
    </div>
  );
}
