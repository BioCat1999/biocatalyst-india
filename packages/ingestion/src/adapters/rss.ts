/**
 * Company press-release RSS adapter — live ingestion source (no API keys).
 *
 * Each tracked company with a working press-release RSS feed is polled;
 * items are parsed, classified into the closed event taxonomy, and emitted
 * as candidates. The feed owner is the event's company — no name-guessing.
 *
 * Feed verification (2026-10-02, live checks): of the 20 tracked companies,
 * only Sun Pharma's site serves a current, item-bearing press-release RSS
 * feed. The others 404, serve empty WordPress feeds, or are stale/blocked.
 * Add feeds to PRESS_FEEDS only after verifying they return HTTP 200 with
 * dated <item>s.
 *
 * Classification is keyword-based and conservative: items that don't map to
 * the closed taxonomy (earnings, CSR, appointments) get eventType null and
 * the runner drops them — the source row is still recorded for provenance.
 * Confidence is 0.9 for regulatory approvals (a company's own approval
 * announcement naming the regulator is high-signal → auto-publishes) and
 * 0.8 for everything else (→ pending_review for admin approval).
 *
 * Cursor semantics: ISO-8601 date of the newest item seen, INCLUSIVE
 * filtering (>=) — the runner's (source_name, canonical_url) + content-hash
 * dedupe absorbs boundary re-fetches. First run looks back 30 days (press
 * feeds are short; older items are stale news).
 */
import type {
  Cursor,
  NormalizedCandidate,
  RawSourceDocument,
  SourceAdapter,
} from "../adapter.js";
import {
  canonicalizeUrl,
  contentHash,
  eventFingerprint,
} from "../normalize.js";
import { matchDrugName } from "./company-map.js";
import { fetchText } from "./http.js";

export const PRESS_RSS_SOURCE_NAME = "press-rss";
const REQUEST_TIMEOUT_MS = 20_000;
const BETWEEN_FEED_DELAY_MS = 500;
const FIRST_RUN_LOOKBACK_DAYS = 30;
const USER_AGENT = "BiocatalystIndia/1.0 (personal research use; press-release ingestion)";

export interface PressFeed {
  /** Canonical company name — used verbatim as the event's company. */
  companyName: string;
  /** Publisher label for provenance. */
  publisher: string;
  feedUrl: string;
}

export const PRESS_FEEDS: PressFeed[] = [
  {
    companyName: "Sun Pharmaceutical Industries Ltd",
    publisher: "Sun Pharma",
    feedUrl: "https://www.sunpharma.com/feed/",
  },
];

/** One parsed feed item. */
export interface RssItem {
  title: string;
  link: string;
  /** ISO 8601, or null when the feed gives no parseable date. */
  pubDate: string | null;
  /** Plain-text description (HTML stripped), or null. */
  description: string | null;
  /** Raw item XML chunk — kept verbatim for the snapshot store. */
  xml: string;
}

function innerTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

/** CDATA → content, strip tags, decode common entities, collapse space. */
export function cleanText(s: string): string {
  let t = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  t = t.replace(/<[^>]*>/g, " ");
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function itemLink(itemXml: string): string | null {
  const direct = innerTag(itemXml, "link");
  if (direct) {
    const cleaned = cleanText(direct);
    if (/^https?:\/\//i.test(cleaned)) return cleaned;
  }
  // Atom-style <link href="…"/>
  const m = itemXml.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
  return m ? m[1].trim() : null;
}

function parsePubDate(raw: string | null): string | null {
  if (!raw) return null;
  // A few official Indian feeds publish RFC-822-like dates with a comma
  // between the month and year (for example `16 Oct, 2026 +0530`). Node's
  // date parser rejects that otherwise-valid timestamp, so normalize that
  // one punctuation variant before parsing.
  const cleaned = cleanText(raw);
  const sebiDateOnly = cleaned.match(
    /^(\d{1,2}\s+[A-Z][a-z]{2}),\s+(\d{4})\s+([+-]\d{4})$/,
  );
  const normalized = sebiDateOnly
    ? `${sebiDateOnly[1]} ${sebiDateOnly[2]} 00:00:00 ${sebiDateOnly[3]}`
    : cleaned.replace(/^(\d{1,2}\s+[A-Z][a-z]{2}),\s+(\d{4})/, "$1 $2");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Parse an RSS 2.0 (or Atom) feed document into items. Namespace-tolerant:
 * falls back from <description> to <content:encoded>, <item> to <entry>.
 * Exported for testing.
 */
export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const chunks = xml.match(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  for (const chunk of chunks) {
    const titleRaw = innerTag(chunk, "title");
    const link = itemLink(chunk);
    if (!titleRaw || !link) continue;
    const title = cleanText(titleRaw);
    if (!title) continue;
    const descRaw = innerTag(chunk, "description") ?? innerTag(chunk, "content:encoded");
    items.push({
      title,
      link,
      pubDate: parsePubDate(innerTag(chunk, "pubDate") ?? innerTag(chunk, "published") ?? innerTag(chunk, "updated")),
      description: descRaw ? cleanText(descRaw).slice(0, 2000) || null : null,
      xml: chunk,
    });
  }
  return items;
}

/**
 * Map a press-release headline onto the closed event taxonomy.
 * Returns null when the headline isn't a catalyst (earnings, CSR,
 * appointments…) — the runner drops null-type candidates.
 * Exported for testing.
 */
export function classifyPressRelease(title: string): string | null {
  const t = title.toLowerCase();
  const has = (...words: string[]): boolean => words.some((w) => t.includes(w));

  // Regulatory approval — strict gate: an approval word AND a regulator or
  // application type, so "board approves dividend" doesn't qualify.
  if (
    (/\bapprov\w*/.test(t) || has("receives approval", "granted approval", "approval granted")) &&
    has("usfda", "u.s. fda", "fda", "ema", "cdsco", "dcgi", "mhra", "health canada", "nda", "anda", "bla", "snda")
  ) {
    return "regulatory_approval";
  }
  // Regulatory submission.
  if (/\b(nda|anda|bla|maa|snda)\b/.test(t) && has("fil", "submi", "accept")) {
    return "regulatory_submission";
  }
  // Trial readouts.
  if (has("primary endpoint") && has("met", "achieved", "demonstrated")) {
    return "primary_endpoint_met";
  }
  if (
    has("phase 1", "phase 2", "phase 3", "phase i", "phase ii", "phase iii", "clinical trial", "clinical study") &&
    has("result", "readout", "data", "endpoint", "efficacy")
  ) {
    return "clinical_trial_result";
  }
  // Long-term / congress data readouts for marketed products carry no phase
  // keyword (e.g. "Two-Year Data … Showed Sustained Efficacy and Safety at
  // EADV Congress", "open-label extension … two years of treatment").
  // Without this branch the runner drops them (eventType null) even though
  // durability data is a genuine catalyst.
  if (
    has(
      "open-label extension",
      "open label extension",
      "long-term data",
      "two-year data",
      "2-year data",
      "three-year data",
      "3-year data",
      "durability of response",
    ) &&
    has("efficacy", "safety", "endpoint", "readout", "data")
  ) {
    return "clinical_trial_result";
  }
  // Corporate.
  if (has("partnership", "collaborat", "licensing agreement", "license agreement", "joint venture", "strategic alliance")) {
    return "licensing_or_partnership";
  }
  if (has("acquisition", "acquires", "to acquire", "merger", "divest", "spin-off", "spinoff")) {
    return "acquisition_or_divestiture";
  }
  // Product launch → pipeline update (the taxonomy has no launch type).
  if (has("launches", "launch of", "commercial launch", "introduces")) {
    return "company_pipeline_update";
  }
  return null;
}

function buildCatalystSummary(publisher: string, eventType: string): string {
  return (
    `Company-issued press release (${publisher}) classified as ${eventType.replaceAll("_", " ")}. ` +
    `Company announcements can move the stock when the development was not already anticipated. ` +
    `Not investment advice.`
  );
}

export class PressRssAdapter implements SourceAdapter {
  readonly sourceName: string = PRESS_RSS_SOURCE_NAME;
  private readonly fetchImpl: typeof fetch;
  private readonly feeds: PressFeed[];
  private lastCursor: Cursor = "";

  /** `fetchImpl` and `feeds` are injectable so tests can stub the network. */
  constructor(fetchImpl?: typeof fetch, feeds?: PressFeed[]) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    this.feeds = feeds ?? PRESS_FEEDS;
  }

  async fetchSince(cursor: Cursor): Promise<RawSourceDocument[]> {
    const now = new Date();
    const since =
      cursor || new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000).toISOString();
    const retrievedAt = now.toISOString();
    const docs: RawSourceDocument[] = [];
    const seen = new Set<string>();
    let newest = since;
    let succeeded = 0;
    let firstError: unknown = null;

    for (const feed of this.feeds) {
      try {
        const xml = await fetchText(this.fetchImpl, feed.feedUrl, {
          userAgent: USER_AGENT,
          timeoutMs: REQUEST_TIMEOUT_MS,
        });
        succeeded += 1;
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
          docs.push({
            sourceName: this.sourceName,
            canonicalUrl,
            contentHash: contentHash({ url: canonicalUrl, title: item.title, date: item.pubDate }),
            retrievedAt,
            publishedAt: item.pubDate,
            // Feed identity travels with the doc so normalize() is stateless.
            raw: { feedUrl: feed.feedUrl, companyName: feed.companyName, publisher: feed.publisher, ...item },
          });
          if (item.pubDate > newest) newest = item.pubDate;
        }
      } catch (err) {
        // One bad feed must not sink the others; but if EVERY feed failed,
        // throw so the runner records a failed run instead of a false success.
        if (!firstError) firstError = err;
      }
      await sleep(BETWEEN_FEED_DELAY_MS);
    }

    if (succeeded === 0 && firstError) throw firstError;
    docs.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    this.lastCursor = newest;
    return docs;
  }

  getNextCursor(): Cursor {
    return this.lastCursor;
  }

  async normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]> {
    const raw = doc.raw as RssItem & { feedUrl?: string; companyName?: string; publisher?: string };
    // The feed owner is the event's company — carried on the doc, never guessed.
    const companyName = raw.companyName;
    const publisher = raw.publisher ?? "company press release";
    if (!companyName) return [];
    const eventType = classifyPressRelease(raw.title);
    // Null type → the runner drops the candidate (spec §17: don't guess).
    const drug = matchDrugName(raw.title);
    const occurredAt = doc.publishedAt;
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
        headline: raw.title,
        factualSummary:
          raw.description && raw.description.length > 0
            ? `${raw.title} ${raw.description.slice(0, 500)} (announced by ${publisher} on ${date}).`
            : `${raw.title} (announced by ${publisher} on ${date}).`,
        catalystSummary: buildCatalystSummary(publisher, eventType ?? "unclassified"),
        // Own-press-release approval naming the regulator is high-signal;
        // everything else waits for admin review.
        confidence: eventType === "regulatory_approval" ? 0.9 : 0.8,
        indication: null,
        phase: null,
        outcome: null,
        trialRefs: [],
        companyNames: [companyName],
        drugNames: drug ? [drug] : [],
        sourceTitle: raw.title,
        publisher,
        isPrimary: true, // the company's own announcement
        fingerprint: eventFingerprint({
          sourceName: this.sourceName,
          eventType: eventType ?? "unclassified",
          occurredDate: occurredAt ? occurredAt.slice(0, 10) : "unknown",
          entityKey: companyName,
        }),
        rawSnapshot: raw,
      },
    ];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
