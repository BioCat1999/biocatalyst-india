/**
 * Feed-card text helpers (same logic as the mobile app's lib/text).
 *
 * Ingested events sometimes carry a `fact` that is also the opening of the
 * `summary` (or vice versa). Rendering both repeats the same sentence on the
 * card. `dedupeEventText` collapses the overlap so each card shows the
 * information once.
 */

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Longest word-aware suffix of `fact` that is a prefix of `summary`. */
function overlapLen(fact: string, summary: string): number {
  const max = Math.min(fact.length, summary.length);
  let best = 0;
  for (let len = 12; len <= max; len++) {
    const tail = fact.slice(fact.length - len);
    if (summary.startsWith(tail)) {
      const prev = fact[fact.length - len - 1];
      if (len === fact.length || prev === undefined || /\s/.test(prev) || /\s/.test(tail[0])) {
        best = len;
      }
    }
  }
  return best;
}

export interface DedupedEventText {
  /** Fact line to render, or null when it is fully covered by the summary. */
  fact: string | null;
  /** Summary with any fact-overlap removed. */
  summary: string;
}

export function dedupeEventText(rawFact: string, rawSummary: string): DedupedEventText {
  const fact = norm(rawFact ?? "");
  const summary = norm(rawSummary ?? "");
  if (!fact) return { fact: null, summary };
  if (!summary) return { fact, summary: "" };
  if (fact === summary) return { fact: null, summary };
  const factCore = fact.replace(/[.…,;!?]+$/, "");
  if (summary.includes(fact) || (factCore.length >= 24 && summary.includes(factCore))) {
    // The summary already says it; promote its first sentence to the fact line.
    const m = summary.match(/^(.{24,300}?[.!?])\s+(.+)$/);
    return m ? { fact: m[1], summary: m[2] } : { fact: null, summary };
  }
  if (fact.includes(summary)) return { fact, summary: "" };
  const overlap = overlapLen(fact, summary);
  if (overlap > 0) {
    return { fact, summary: summary.slice(overlap).replace(/^[\s,;:\-]+/, "") };
  }
  return { fact, summary };
}
