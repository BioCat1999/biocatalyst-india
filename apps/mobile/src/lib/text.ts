/**
 * Feed-card text helpers.
 *
 * Ingested events sometimes carry a `fact` that is also the opening of the
 * `summary` (or vice versa). Rendering both then repeats the same sentence
 * on the card, as users noticed. `dedupeEventText` collapses the overlap so
 * each card shows the information once.
 */

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Split off the longest suffix of `fact` that is a prefix of `summary`
 * (word-aware), so the summary can be shown without repeating the fact.
 */
function overlapLen(fact: string, summary: string): number {
  const max = Math.min(fact.length, summary.length);
  let best = 0;
  for (let len = 12; len <= max; len++) {
    const tail = fact.slice(fact.length - len);
    if (summary.startsWith(tail)) {
      // Prefer word boundaries so we don't cut mid-word.
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
  // Summary already contains the whole fact — the fact line is redundant.
  // Ignore trailing sentence punctuation so "…GLP1." matches "…GLP1,".
  const factCore = fact.replace(/[.…,;!?]+$/, "");
  if (summary.includes(fact) || (factCore.length >= 24 && summary.includes(factCore))) {
    return { fact: null, summary };
  }
  // Fact already contains the whole summary — keep the fact, drop the summary.
  if (fact.includes(summary)) return { fact, summary: "" };
  // Partial overlap: fact's tail == summary's head — trim it from the summary.
  const overlap = overlapLen(fact, summary);
  if (overlap > 0) {
    return { fact, summary: summary.slice(overlap).replace(/^[\s,;:\-]+/, "") };
  }
  return { fact, summary };
}
