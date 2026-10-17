/** Live SEBI RSS adapter for official securities-regulatory actions. */
import type {
  Cursor,
  NormalizedCandidate,
  RawSourceDocument,
  SourceAdapter,
} from "../adapter.js";
import { canonicalizeUrl, contentHash, eventFingerprint } from "../normalize.js";
import { matchCompanyName } from "./company-map.js";
import { fetchText } from "./http.js";
import { parseRss, type RssItem } from "./rss.js";

export const SEBI_SOURCE_NAME = "sebi-rss";
export const SEBI_RSS_URL = "https://www.sebi.gov.in/sebirss.xml";
const FIRST_RUN_LOOKBACK_DAYS = 30;
const USER_AGENT = "BiocatalystIndia/1.0 (official regulatory-feed monitoring)";

function isRegulatoryAction(item: RssItem): boolean {
  const text = `${item.title} ${item.link}`.toLowerCase();
  return /enforcement|order|penalt|adjudicat|prohibitory|settlement/.test(text);
}

export class SebiRssAdapter implements SourceAdapter {
  readonly sourceName = SEBI_SOURCE_NAME;
  private readonly fetchImpl: typeof fetch;
  private lastCursor: Cursor = "";

  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
  }

  async fetchSince(cursor: Cursor): Promise<RawSourceDocument[]> {
    const now = new Date();
    const since = cursor || new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000).toISOString();
    const xml = await fetchText(this.fetchImpl, SEBI_RSS_URL, {
      userAgent: USER_AGENT,
      timeoutMs: 20_000,
    });
    const docs: RawSourceDocument[] = [];
    let newest = since;
    for (const item of parseRss(xml)) {
      if (!item.pubDate || item.pubDate < since || !isRegulatoryAction(item)) continue;
      const searchable = `${item.title} ${item.description ?? ""}`;
      const companyName = matchCompanyName(searchable);
      if (!companyName) continue;
      let canonicalUrl: string;
      try {
        canonicalUrl = canonicalizeUrl(item.link);
      } catch {
        continue;
      }
      const raw = { ...item, companyName };
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
    docs.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    this.lastCursor = newest;
    return docs;
  }

  getNextCursor(): Cursor {
    return this.lastCursor;
  }

  async normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]> {
    const raw = doc.raw as RssItem & { companyName?: string };
    if (!raw.companyName || !doc.publishedAt) return [];
    return [{
      sourceName: this.sourceName,
      canonicalUrl: doc.canonicalUrl,
      contentHash: doc.contentHash,
      retrievedAt: doc.retrievedAt,
      publishedAt: doc.publishedAt,
      eventType: "securities_regulatory_action",
      occurredAt: doc.publishedAt,
      headline: raw.title,
      factualSummary: raw.description ?? raw.title,
      catalystSummary:
        "An official SEBI action involving a tracked company. The source order should be reviewed " +
        "for scope, financial exposure and whether the matter remains subject to appeal.",
      confidence: 0.9,
      indication: null,
      phase: null,
      outcome: null,
      trialRefs: [],
      companyNames: [raw.companyName],
      drugNames: [],
      sourceTitle: raw.title,
      publisher: "Securities and Exchange Board of India",
      isPrimary: true,
      fingerprint: eventFingerprint({
        sourceName: this.sourceName,
        eventType: "securities_regulatory_action",
        occurredDate: doc.publishedAt.slice(0, 10),
        entityKey: `${raw.companyName}:${doc.canonicalUrl}`,
      }),
      rawSnapshot: raw,
    }];
  }
}
