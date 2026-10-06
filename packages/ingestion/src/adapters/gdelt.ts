/**
 * GDELT live adapter — news about the tracked companies.
 *
 * Source: the GDELT Project DOC 2.0 API
 * (`https://api.gdeltproject.org/api/v2/doc/doc`), a free public API that
 * requires no key. Two `artlist` queries per pass, OR-ing quoted company
 * phrases (see `NEWS_PHRASES` / `GLOBAL_NEWS_PHRASES` in company-map.ts):
 * the original India-focused list, plus global pharma majors and the IPO
 * watchlist — bounded by `startdatetime`/`enddatetime`.
 * Makes outbound HTTPS requests — the only network-calling ingestion adapter
 * besides `ctgov`.
 *
 * Cursor semantics: ISO-8601 timestamp of the newest article seen. GDELT
 * reports `seendate` as `YYYYMMDDHHMMSSZ`; filtering is inclusive (`>=`)
 * because two runs can share the boundary minute, and the runner's
 * (source_name, canonical_url) + content-hash dedupe absorbs the overlap. A
 * first run (empty cursor) looks back 7 days; the DOC API only covers roughly
 * the last 3 months, so older cursors are clamped to that window.
 *
 * Precision: GDELT matches the query phrase in the article title OR body, so
 * `fetchSince` keeps only articles whose TITLE names a tracked company
 * (`matchCompanyName`) — body-only matches are too noisy for an event feed.
 * English-language articles only: the pipeline's templates and UI are
 * English, and a non-English title would produce a misleading summary.
 *
 * Entity discipline (spec §17): the company comes from the title match;
 * drugs map via `matchDrugName` and are omitted when unknown. News is a
 * secondary source (`isPrimary: false`); the event type is keyword-mapped to
 * the closed taxonomy with a `company_pipeline_update` fallback — the
 * headline itself always carries the real news.
 */
import type {
  Cursor,
  NormalizedCandidate,
  RawSourceDocument,
  SourceAdapter,
} from "../adapter.js";
import {
  TEMPLATE_CONFIDENCE,
  asText,
  canonicalizeUrl,
  contentHash,
  eventFingerprint,
  isoDatePart,
} from "../normalize.js";
import { NEWS_PHRASES, GLOBAL_NEWS_PHRASES, matchCompanyName, matchDrugName } from "./company-map.js";
import { fetchJson } from "./http.js";

export const GDELT_SOURCE_NAME = "gdelt";
const API_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_RECORDS = 100;
const REQUEST_TIMEOUT_MS = 20_000;
const FIRST_RUN_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 90; // DOC API covers roughly the last 3 months
const USER_AGENT = "BiocatalystIndia/1.0 (personal research use; news ingestion)";

/** Minimal shape of a GDELT DOC 2.0 artlist article (fields we use). */
export interface GdeltArticle {
  url?: unknown;
  title?: unknown;
  seendate?: unknown;
  domain?: unknown;
  language?: unknown;
  sourcecountry?: unknown;
}

const PUBLISHER_PREFIX = "GDELT";

/**
 * Keyword-map a news headline to the closed taxonomy (spec §6).
 * Order matters: rejection patterns are checked before approval so "fails
 * to win approval" does not map to `regulatory_approval`. Falls back to
 * `company_pipeline_update` — never null, so genuine company news is kept.
 */
export function classifyNews(title: string): string {
  const t = title.toLowerCase();
  // IPO news is checked before everything else: listing-day headlines
  // ("lists on NSE at 12% premium") must not fall into generic buckets.
  if (/lists on|listing gains|market debut|debuts on|shares list|lists at/.test(t)) {
    return "ipo_listing";
  }
  if (
    /\bipo\b|drhp|draft red herring|red herring prospectus|price band|issue opens|issue closes|files.*prospectus|sebi.*(nod|approval).*ipo|ipo.*sebi/.test(
      t,
    )
  ) {
    return "ipo_filing";
  }
  if (
    /reject|deficien|complete response letter|\bcrl\b|fails to (win|secure|gain)|denies approval|refuses approval|declines to approve/.test(t)
  ) {
    return "regulatory_rejection_or_deficiency";
  }
  if (/approv/.test(t)) return "regulatory_approval";
  if (/submits|files.*(nda|bla|maa)|regulatory filing|seeks approval/.test(t)) {
    return "regulatory_submission";
  }
  if (/(trial|study).*(result|readout)|reports.*(phase\s*[123]).*data/.test(t)) {
    return "clinical_trial_result";
  }
  if (/starts.*(trial|study)|(trial|study).*(begins|initiated|launched)/.test(t)) {
    return "clinical_trial_started";
  }
  if (/warning letter|form 483|483 observation|plant.*inspect|facility.*inspect|manufacturing.*(halt|shutdown)/.test(t)) {
    return "manufacturing_or_inspection_update";
  }
  if (/recall|safety signal|adverse event|side effect/.test(t)) return "safety_signal";
  if (/acqui|merger|takeover|buyout|takes stake|stake in/.test(t)) {
    return "acquisition_or_divestiture";
  }
  if (/partner|licen[sc]e|licensing|collaborat|tie-up|joint venture/.test(t)) {
    return "licensing_or_partnership";
  }
  if (/phase\s*[123]/.test(t)) return "company_pipeline_update";
  return "company_pipeline_update";
}

/** "20260925T064500Z" → "2026-09-25T06:45:00.000Z", or null when unparseable. */
export function parseSeendate(seendate: string | null): string | null {
  if (!seendate) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
}

/** GDELT startdatetime/enddatetime format: YYYYMMDDHHMMSS. */
function gdeltTimestamp(d: Date): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

function buildQueryUrl(phrases: string[], start: Date, end: Date): string {
  const query = phrases.map((p) => `"${p}"`).join(" OR ");
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: String(MAX_RECORDS),
    startdatetime: gdeltTimestamp(start),
    enddatetime: gdeltTimestamp(end),
  });
  return `${API_URL}?${params.toString()}`;
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  return fetchJson(fetchImpl, url, { userAgent: USER_AGENT, timeoutMs: REQUEST_TIMEOUT_MS });
}

function buildCatalystSummary(company: string): string {
  return (
    `This is a news report about ${company}. News flow can precede pipeline, ` +
    `regulatory or corporate developments; this summary reflects only the ` +
    `reported headline, not an assessment of the company. Not investment advice.`
  );
}

export class GdeltAdapter implements SourceAdapter {
  readonly sourceName: string = GDELT_SOURCE_NAME;
  private readonly fetchImpl: typeof fetch;
  private lastCursor: Cursor = "";

  /** `fetchImpl` is injectable so tests can stub the API. */
  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
  }

  async fetchSince(cursor: Cursor): Promise<RawSourceDocument[]> {
    const now = new Date();
    let since = cursor || new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000).toISOString();
    const oldestAllowed = new Date(now.getTime() - MAX_LOOKBACK_DAYS * 86_400_000).toISOString();
    if (since < oldestAllowed) since = oldestAllowed;

    const data = { articles: [] as GdeltArticle[] };
    // Two queries over the same window: the original India-focused phrases
    // plus the global-pharma / IPO-watchlist phrases. Same cursor semantics;
    // per-URL dedupe below absorbs any overlap.
    for (const phrases of [NEWS_PHRASES, GLOBAL_NEWS_PHRASES]) {
      const page = (await getJson(
        this.fetchImpl,
        buildQueryUrl(phrases, new Date(since), now),
      )) as { articles?: GdeltArticle[] };
      for (const a of page.articles ?? []) data.articles.push(a);
    }

    const retrievedAt = now.toISOString();
    const docs: RawSourceDocument[] = [];
    const seen = new Set<string>();
    let newest = since;

    for (const article of data.articles ?? []) {
      const url = asText(article.url);
      const title = asText(article.title);
      if (!url || !title) continue;
      // Precision gates: English title that names a tracked company.
      if (!/^english/i.test(asText(article.language) ?? "")) continue;
      if (!matchCompanyName(title)) continue;
      const publishedAt = parseSeendate(asText(article.seendate));
      if (!publishedAt || publishedAt < since) continue;
      let canonicalUrl: string;
      try {
        canonicalUrl = canonicalizeUrl(url);
      } catch {
        continue;
      }
      if (seen.has(canonicalUrl)) continue;
      seen.add(canonicalUrl);
      docs.push({
        sourceName: this.sourceName,
        canonicalUrl,
        contentHash: contentHash({ url: canonicalUrl, title }),
        retrievedAt,
        publishedAt,
        raw: article,
      });
      if (publishedAt > newest) newest = publishedAt;
    }

    docs.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    this.lastCursor = newest;
    return docs;
  }

  getNextCursor(): Cursor {
    return this.lastCursor;
  }

  async normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]> {
    const article = doc.raw as GdeltArticle;
    const title = asText(article.title);
    if (!title) return [];
    const company = matchCompanyName(title);
    // Precision gate (mirrors fetchSince): only titled company news.
    if (!company) return [];

    const drug = matchDrugName(title);
    const eventType = classifyNews(title);
    const occurredAt = doc.publishedAt;
    const domain = asText(article.domain) ?? "unknown outlet";
    const date = occurredAt ? occurredAt.slice(0, 10) : "an unknown date";

    return [
      {
        sourceName: this.sourceName,
        canonicalUrl: doc.canonicalUrl,
        contentHash: doc.contentHash,
        retrievedAt: doc.retrievedAt,
        publishedAt: doc.publishedAt,
        eventType,
        occurredAt,
        headline: title,
        factualSummary: `${title} (reported by ${domain} on ${date}).`,
        catalystSummary: buildCatalystSummary(company),
        confidence: TEMPLATE_CONFIDENCE,
        indication: null, // headlines don't reliably state indications — stays null (spec §17)
        phase: null,
        outcome: null,
        trialRefs: [],
        companyNames: [company],
        drugNames: drug ? [drug] : [],
        sourceTitle: title,
        publisher: `${PUBLISHER_PREFIX} via ${domain}`,
        isPrimary: false, // news is secondary reporting
        fingerprint: eventFingerprint({
          sourceName: this.sourceName,
          eventType,
          occurredDate: occurredAt ? isoDatePart(occurredAt) : "unknown",
          entityKey: company,
        }),
        rawSnapshot: article,
      },
    ];
  }
}
