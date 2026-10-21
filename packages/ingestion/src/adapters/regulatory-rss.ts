/** Official UK and European medicines-regulator feeds (free, keyless). */
import type {
  Cursor,
  NormalizedCandidate,
  RawSourceDocument,
  SourceAdapter,
} from "../adapter.js";
import { canonicalizeUrl, contentHash, eventFingerprint } from "../normalize.js";
import { fetchText } from "./http.js";
import { parseRss, type RssItem } from "./rss.js";

export interface RegulatoryFeed {
  url: string;
  publisher: string;
  country: string;
  defaultEventType: "safety_signal" | "regulatory_approval" | "manufacturing_or_inspection_update";
}

export const MHRA_SOURCE_NAME = "mhra-rss";
export const EMA_SOURCE_NAME = "ema-rss";

export const MHRA_FEEDS: RegulatoryFeed[] = [{
  url: "https://www.gov.uk/drug-safety-update.atom",
  publisher: "UK Medicines and Healthcare products Regulatory Agency",
  country: "United Kingdom",
  defaultEventType: "safety_signal",
}];

export const EMA_FEEDS: RegulatoryFeed[] = [
  {
    url: "https://www.ema.europa.eu/en/new-human-medicine-new.xml",
    publisher: "European Medicines Agency",
    country: "European Union",
    defaultEventType: "regulatory_approval",
  },
  {
    url: "https://www.ema.europa.eu/en/inspections.xml",
    publisher: "European Medicines Agency",
    country: "European Union",
    defaultEventType: "manufacturing_or_inspection_update",
  },
];

const FIRST_RUN_LOOKBACK_DAYS = 45;
const USER_AGENT = "BiocatalystIndia/1.0 (official regulatory-feed monitoring)";

function classify(item: RssItem, fallback: RegulatoryFeed["defaultEventType"]): string {
  const text = `${item.title} ${item.description ?? ""}`.toLowerCase();
  if (/withdraw|refus|reject|negative opinion|deficien/.test(text)) {
    return "regulatory_rejection_or_deficiency";
  }
  if (/submit|application|filing|under review/.test(text)) return "regulatory_submission";
  if (/safety|adverse|risk|contraindicat|recall|side effect/.test(text)) return "safety_signal";
  if (/inspection|gmp|manufactur|quality defect/.test(text)) {
    return "manufacturing_or_inspection_update";
  }
  return fallback;
}

export class RegulatoryRssAdapter implements SourceAdapter {
  private lastCursor: Cursor = "";

  constructor(
    readonly sourceName: string,
    private readonly feeds: RegulatoryFeed[],
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async fetchSince(cursor: Cursor): Promise<RawSourceDocument[]> {
    const now = new Date();
    const since = cursor || new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000).toISOString();
    const docs: RawSourceDocument[] = [];
    const seen = new Set<string>();
    let newest = since;
    let successes = 0;
    let firstError: unknown;

    for (const feed of this.feeds) {
      try {
        const xml = await fetchText(this.fetchImpl, feed.url, {
          userAgent: USER_AGENT,
          timeoutMs: 20_000,
        });
        successes += 1;
        for (const item of parseRss(xml)) {
          if (!item.pubDate || item.pubDate < since) continue;
          let canonicalUrl: string;
          try {
            canonicalUrl = canonicalizeUrl(item.link);
          } catch {
            continue;
          }
          if (seen.has(canonicalUrl)) continue;
          seen.add(canonicalUrl);
          const raw = { ...item, feed };
          docs.push({
            sourceName: this.sourceName,
            canonicalUrl,
            contentHash: contentHash(raw),
            retrievedAt: now.toISOString(),
            publishedAt: item.pubDate,
            raw,
          });
          if (item.pubDate > newest) newest = item.pubDate;
        }
      } catch (error) {
        firstError ??= error;
      }
    }
    if (successes === 0 && firstError) throw firstError;
    docs.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    this.lastCursor = newest;
    return docs;
  }

  getNextCursor(): Cursor {
    return this.lastCursor;
  }

  async normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]> {
    const raw = doc.raw as RssItem & { feed?: RegulatoryFeed };
    if (!raw.feed || !doc.publishedAt) return [];
    const eventType = classify(raw, raw.feed.defaultEventType);
    const description = raw.description?.slice(0, 1200);
    return [{
      sourceName: this.sourceName,
      canonicalUrl: doc.canonicalUrl,
      contentHash: doc.contentHash,
      retrievedAt: doc.retrievedAt,
      publishedAt: doc.publishedAt,
      eventType,
      occurredAt: doc.publishedAt,
      headline: raw.title.slice(0, 500),
      factualSummary: description || raw.title,
      catalystSummary:
        `Official ${raw.feed.country} regulatory update. Review the linked regulator record for ` +
        "affected products, populations, timing and required action.",
      confidence: 0.9,
      indication: null,
      phase: null,
      outcome: null,
      trialRefs: [],
      companyNames: [],
      drugNames: [],
      sourceTitle: raw.title,
      publisher: raw.feed.publisher,
      isPrimary: true,
      fingerprint: eventFingerprint({
        sourceName: this.sourceName,
        eventType,
        occurredDate: doc.publishedAt.slice(0, 10),
        entityKey: doc.canonicalUrl,
      }),
      rawSnapshot: raw,
    }];
  }
}

export class MhraRssAdapter extends RegulatoryRssAdapter {
  constructor(fetchImpl?: typeof fetch, feeds: RegulatoryFeed[] = MHRA_FEEDS) {
    super(MHRA_SOURCE_NAME, feeds, fetchImpl);
  }
}

export class EmaRssAdapter extends RegulatoryRssAdapter {
  constructor(fetchImpl?: typeof fetch, feeds: RegulatoryFeed[] = EMA_FEEDS) {
    super(EMA_SOURCE_NAME, feeds, fetchImpl);
  }
}
