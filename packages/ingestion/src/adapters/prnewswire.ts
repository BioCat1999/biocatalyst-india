/**
 * PR Newswire wire adapter — live ingestion source (no API keys).
 *
 * Why this exists: Sun Pharma (and, over time, other tracked companies)
 * publish congress readouts and data announcements on PR Newswire, not on
 * their corporate blogs — e.g. the two-year LEQSELVI (deuruxolitinib) EADV
 * data of 2026-10-01, which the Sun-only press-RSS feed could never see.
 * PR Newswire has no company-specific feeds, so this adapter polls two
 * multi-company category feeds and attributes each item to a tracked
 * company by name-matching (the GDELT discipline), instead of the
 * feed-owner attribution used by `press-rss`.
 *
 * Feed verification (2026-10-07, live checks): both category RSS feeds
 * return HTTP 200 with dated <item>s from a non-browser client:
 *   - Pharmaceuticals — https://www.prnewswire.com/rss/health-latest-news/pharmaceuticals-list.rss
 *   - Clinical Trials & Medical Discoveries — https://www.prnewswire.com/rss/health-latest-news/clinical-trials-medical-discoveries-list.rss
 * Each feed carries only ~20 items spanning <24h (observed window
 * ~7–8 hours), so a daily poll misses most releases — this source only
 * closes the gap when polled HOURLY (see the repo's GitHub Actions
 * workflow `ingest-prnewswire-hourly`, which pings the source-gated
 * ingestion endpoint). Vercel's IPs are unproven until a post-deploy
 * run: PR Newswire has 403'd automated clients before, so a failed run
 * (not silent success) is the expected signal if that happens.
 *
 * Attribution discipline (spec §17 — never guess):
 *   - The company comes from `matchCompanyNameBounded`: the headline
 *     first, then the first 500 chars of the body, where a wire release
 *     names its issuer ("Sun Pharmaceutical Industries Ltd … today
 *     announced"). The LEQSELVI headline itself names no company — the
 *     issuer is in the body. Items matching no tracked company are
 *     dropped, never attributed by feed or topic. Bounded (word-token)
 *     matching is required: plain substring matching attributes
 *     "Supporting…" to Ortin (`ortin`) and "Single Cell…" to NGL
 *     (`ngl`) — both observed live on 2026-10-07.
 *   - English items only (the pipeline's templates/UI are English, as in
 *     the GDELT adapter); the feed's per-item language tag is honored
 *     when present.
 *   - Classification reuses `classifyPressRelease` (closed taxonomy;
 *     null → runner drops). Confidence: 0.9 (auto-publish) only for a
 *     regulator-named approval attributed by the HEADLINE; everything
 *     else is 0.8 (→ pending review). Unlike `press-rss`, attribution
 *     here is heuristic, so body-attributed approvals don't auto-publish.
 *
 * Cursor semantics: ISO-8601 date of the newest item seen, INCLUSIVE
 * filtering (>=) — the runner's (source_name, canonical_url) +
 * content-hash dedupe absorbs boundary re-fetches. First run looks back
 * 2 days; the feed window is <24h, so a longer lookback only matters
 * for items still sitting in the window.
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
import { extractRegulatoryMilestones } from "../milestones.js";
import { matchCompanyNameBounded, matchDrugNameBounded } from "./company-map.js";
import { fetchText } from "./http.js";
import { classifyPressRelease, parseRss } from "./rss.js";

export const PRNEWSWIRE_SOURCE_NAME = "prnewswire";
const REQUEST_TIMEOUT_MS = 20_000;
const BETWEEN_FEED_DELAY_MS = 500;
const FIRST_RUN_LOOKBACK_DAYS = 2;
const USER_AGENT = "BiocatalystIndia/1.0 (personal research use; press-release ingestion)";
const PUBLISHER = "PR Newswire";
/** Wire releases name the issuer up front; don't scan whole bodies. */
const BODY_MATCH_CHARS = 500;

export const PRNEWSWIRE_FEEDS: string[] = [
  "https://www.prnewswire.com/rss/health-latest-news/pharmaceuticals-list.rss",
  "https://www.prnewswire.com/rss/health-latest-news/clinical-trials-medical-discoveries-list.rss",
];

/** Per-item language tag, when the feed provides one (`en-US`, `de`…). */
export function itemLanguage(itemXml: string): string | null {
  const m = itemXml.match(/<(?:[a-z]+:)?language[^>]*>([^<]+)</i);
  return m ? m[1].trim().toLowerCase() : null;
}

/**
 * Attribute a wire item to a tracked company: headline first (the GDELT
 * precision gate), then the body's opening, where the issuer is named.
 * Returns null for "not ours" — the item is dropped, never guessed.
 * `viaTitle` distinguishes headline attribution (the release is *by* the
 * named company) from body attribution (heuristic issuer extraction);
 * normalize uses it to gate auto-publish confidence.
 */
export function attributeCompany(
  title: string,
  description: string | null,
): { company: string; viaTitle: boolean } | null {
  const titleMatch = matchCompanyNameBounded(title);
  if (titleMatch) return { company: titleMatch, viaTitle: true };
  if (description) {
    const bodyMatch = matchCompanyNameBounded(description.slice(0, BODY_MATCH_CHARS));
    if (bodyMatch) return { company: bodyMatch, viaTitle: false };
  }
  return null;
}

function buildCatalystSummary(company: string, eventType: string): string {
  return (
    `Wire press release via ${PUBLISHER} classified as ${eventType.replaceAll("_", " ")} for ${company}. ` +
    `Company announcements can move the stock when the development was not already anticipated. ` +
    `Not investment advice.`
  );
}

export class PrNewswireAdapter implements SourceAdapter {
  readonly sourceName: string = PRNEWSWIRE_SOURCE_NAME;
  private readonly fetchImpl: typeof fetch;
  private readonly feeds: string[];
  private lastCursor: Cursor = "";

  /** `fetchImpl` and `feeds` are injectable so tests can stub the network. */
  constructor(fetchImpl?: typeof fetch, feeds?: string[]) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    this.feeds = feeds ?? PRNEWSWIRE_FEEDS;
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

    for (const feedUrl of this.feeds) {
      try {
        const xml = await fetchText(this.fetchImpl, feedUrl, {
          userAgent: USER_AGENT,
          timeoutMs: REQUEST_TIMEOUT_MS,
        });
        succeeded += 1;
        for (const item of parseRss(xml)) {
          if (!item.pubDate || item.pubDate < since) continue;
          // English-only, like GDELT: the feed mixes de/es/fr releases.
          const lang = itemLanguage(item.xml);
          if (lang && !lang.startsWith("en")) continue;
          // Attribution pre-filter: don't snapshot items we can't own.
          if (!attributeCompany(item.title, item.description)) continue;
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
            raw: { feedUrl, ...item },
          });
          if (item.pubDate > newest) newest = item.pubDate;
        }
      } catch (err) {
        // One bad feed must not sink the other; but if EVERY feed failed,
        // throw so the runner records a failed run instead of a false
        // success (this is the post-deploy 403 tripwire).
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
    const raw = doc.raw as { title: string; description: string | null; feedUrl?: string };
    // Re-derived here (fetchSince pre-filters) so normalize is correct
    // for any stored snapshot, not just fresh fetches.
    const attribution = attributeCompany(raw.title, raw.description);
    if (!attribution) return [];
    const { company } = attribution;
    const eventType = classifyPressRelease(raw.title);
    const drug = matchDrugNameBounded(raw.title);
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
            ? `${raw.title} ${raw.description.slice(0, 500)} (announced via ${PUBLISHER} on ${date}).`
            : `${raw.title} (announced via ${PUBLISHER} on ${date}).`,
        catalystSummary: buildCatalystSummary(company, eventType ?? "unclassified"),
        // The wire release is the company's own announcement (primary).
        // Auto-publish (0.9) requires BOTH a regulator-named approval
        // AND headline attribution; body-attributed items and all other
        // types wait in the review queue (0.8) — attribution here is
        // heuristic, unlike the single-owner `press-rss` feed.
        confidence: eventType === "regulatory_approval" && attribution.viaTitle ? 0.9 : 0.8,
        indication: null,
        phase: null,
        outcome: null,
        trialRefs: [],
        companyNames: [company],
        drugNames: drug ? [drug] : [],
        sourceTitle: raw.title,
        publisher: PUBLISHER,
        isPrimary: true,
        fingerprint: eventFingerprint({
          sourceName: this.sourceName,
          eventType: eventType ?? "unclassified",
          occurredDate: occurredAt ? occurredAt.slice(0, 10) : "unknown",
          entityKey: company,
        }),
        rawSnapshot: raw,
        calendarMilestones: extractRegulatoryMilestones(
          `${raw.title} ${raw.description ?? ""}`,
          company,
        ),
      },
    ];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
