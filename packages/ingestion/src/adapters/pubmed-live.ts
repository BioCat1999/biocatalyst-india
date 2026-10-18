/**
 * Live PubMed adapter using NCBI E-utilities (free, official, no key needed).
 *
 * Publications are searched by tracked-company affiliation. The company is
 * therefore supplied by the exact query that returned the PMID rather than
 * guessed from the article title. We ingest citation metadata only; no
 * copyrighted full text or abstract is copied into the database.
 */
import type {
  Cursor,
  NormalizedCandidate,
  RawSourceDocument,
  SourceAdapter,
} from "../adapter.js";
import { contentHash, eventFingerprint } from "../normalize.js";
import { matchDrugName } from "./company-map.js";
import { fetchJson } from "./http.js";

export const PUBMED_SOURCE_NAME = "pubmed";
const API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const FIRST_RUN_LOOKBACK_DAYS = 30;
const REQUEST_TIMEOUT_MS = 20_000;
const RETMAX_PER_COMPANY = 8;
const USER_AGENT = "BiocatalystIndia/1.0 (research citation monitoring)";

export interface PubmedCompanyQuery {
  companyName: string;
  affiliation: string;
}

/** High-signal Indian issuers. Extend independently as coverage expands. */
export const PUBMED_COMPANY_QUERIES: PubmedCompanyQuery[] = [
  { companyName: "Sun Pharmaceutical Industries Ltd", affiliation: "Sun Pharmaceutical" },
  { companyName: "Dr. Reddy's Laboratories Ltd", affiliation: "Dr Reddy's Laboratories" },
  { companyName: "Cipla Ltd", affiliation: "Cipla" },
  { companyName: "Biocon Ltd", affiliation: "Biocon" },
  { companyName: "Divi's Laboratories Ltd", affiliation: "Divi's Laboratories" },
  { companyName: "Lupin Ltd", affiliation: "Lupin" },
  { companyName: "Aurobindo Pharma Ltd", affiliation: "Aurobindo Pharma" },
  { companyName: "Zydus Lifesciences Ltd", affiliation: "Zydus" },
  { companyName: "Torrent Pharmaceuticals Ltd", affiliation: "Torrent Pharmaceuticals" },
  { companyName: "Mankind Pharma Ltd", affiliation: "Mankind Pharma" },
];

interface ESearchResponse {
  esearchresult?: { idlist?: unknown[] };
}

export interface PubmedSummary {
  uid?: unknown;
  title?: unknown;
  source?: unknown;
  fulljournalname?: unknown;
  sortpubdate?: unknown;
  pubdate?: unknown;
  authors?: Array<{ name?: unknown }>;
  articleids?: Array<{ idtype?: unknown; value?: unknown }>;
}

interface ESummaryResponse {
  result?: Record<string, unknown> & { uids?: unknown[] };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const exact = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(raw);
  if (exact) return `${exact[1]}-${exact[2]}-${exact[3]}T00:00:00.000Z`;
  const yearMonth = /^(\d{4})\s+([A-Z][a-z]{2})/.exec(raw);
  if (yearMonth) {
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(yearMonth[2]);
    if (month >= 0) return `${yearMonth[1]}-${String(month + 1).padStart(2, "0")}-01T00:00:00.000Z`;
  }
  return null;
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function queryParams(extra: Record<string, string>): string {
  const params = new URLSearchParams({ db: "pubmed", retmode: "json", ...extra });
  const key = process.env.NCBI_API_KEY;
  if (key) params.set("api_key", key);
  const email = process.env.NCBI_EMAIL;
  if (email) params.set("email", email);
  params.set("tool", "biocatalyst-india");
  return params.toString();
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PubmedAdapter implements SourceAdapter {
  readonly sourceName = PUBMED_SOURCE_NAME;
  private readonly fetchImpl: typeof fetch;
  private readonly queries: PubmedCompanyQuery[];
  private readonly delayMs: number;
  private lastCursor: Cursor = "";

  constructor(fetchImpl?: typeof fetch, queries?: PubmedCompanyQuery[], delayMs?: number) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    this.queries = queries ?? PUBMED_COMPANY_QUERIES;
    // Keep NCBI politeness delays in production, but do not make stubbed
    // integration tests wait between requests that never leave the process.
    this.delayMs = delayMs ?? (process.env.NODE_ENV === "test" ? 0 : process.env.NCBI_API_KEY ? 120 : 350);
  }

  async fetchSince(cursor: Cursor): Promise<RawSourceDocument[]> {
    const now = new Date();
    const since = cursor || day(new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000));
    const companiesByPmid = new Map<string, Set<string>>();

    for (let i = 0; i < this.queries.length; i += 1) {
      const query = this.queries[i];
      const url = `${API_BASE}/esearch.fcgi?${queryParams({
        term: `\"${query.affiliation}\"[Affiliation]`,
        datetype: "pdat",
        mindate: since,
        maxdate: day(now),
        retmax: String(RETMAX_PER_COMPANY),
        sort: "pub date",
      })}`;
      const response = (await fetchJson(this.fetchImpl, url, {
        userAgent: USER_AGENT,
        timeoutMs: REQUEST_TIMEOUT_MS,
      })) as ESearchResponse;
      const ids = Array.isArray(response.esearchresult?.idlist)
        ? response.esearchresult!.idlist!.map(text).filter((id): id is string => Boolean(id))
        : [];
      for (const id of ids) {
        const names = companiesByPmid.get(id) ?? new Set<string>();
        names.add(query.companyName);
        companiesByPmid.set(id, names);
      }
      if (i < this.queries.length - 1 && this.delayMs > 0) await pause(this.delayMs);
    }

    const pmids = [...companiesByPmid.keys()];
    if (pmids.length === 0) {
      this.lastCursor = since;
      return [];
    }
    const summaryUrl = `${API_BASE}/esummary.fcgi?${queryParams({ id: pmids.join(",") })}`;
    const summaryResponse = (await fetchJson(this.fetchImpl, summaryUrl, {
      userAgent: USER_AGENT,
      timeoutMs: REQUEST_TIMEOUT_MS,
    })) as ESummaryResponse;
    const result = summaryResponse.result ?? {};
    const retrievedAt = now.toISOString();
    const docs: RawSourceDocument[] = [];
    let newest = since;

    for (const pmid of pmids) {
      const summary = result[pmid] as PubmedSummary | undefined;
      if (!summary) continue;
      const publishedAt = isoDate(summary.sortpubdate) ?? isoDate(summary.pubdate);
      if (!publishedAt || publishedAt.slice(0, 10) < since) continue;
      const raw = { pmid, matchedCompanies: [...(companiesByPmid.get(pmid) ?? [])], summary };
      docs.push({
        sourceName: this.sourceName,
        canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        contentHash: contentHash(raw),
        retrievedAt,
        publishedAt,
        raw,
      });
      if (publishedAt.slice(0, 10) > newest) newest = publishedAt.slice(0, 10);
    }
    docs.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    this.lastCursor = newest;
    return docs;
  }

  getNextCursor(): Cursor {
    return this.lastCursor;
  }

  async normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]> {
    const raw = doc.raw as { pmid?: unknown; matchedCompanies?: unknown; summary?: PubmedSummary };
    const pmid = text(raw.pmid);
    const title = text(raw.summary?.title);
    const journal = text(raw.summary?.fulljournalname) ?? text(raw.summary?.source);
    const companies = Array.isArray(raw.matchedCompanies)
      ? raw.matchedCompanies.map(text).filter((name): name is string => Boolean(name))
      : [];
    if (!pmid || !title || companies.length === 0 || !doc.publishedAt) return [];
    const author = text(raw.summary?.authors?.[0]?.name);
    const drug = matchDrugName(title);
    const headline = `New PubMed publication: ${title}`;
    return [{
      sourceName: this.sourceName,
      canonicalUrl: doc.canonicalUrl,
      contentHash: doc.contentHash,
      retrievedAt: doc.retrievedAt,
      publishedAt: doc.publishedAt,
      eventType: "scientific_publication",
      occurredAt: doc.publishedAt,
      headline,
      factualSummary:
        `PubMed indexed “${title}”${journal ? ` in ${journal}` : ""}` +
        `${author ? `, led by ${author}` : ""}. The record matched a tracked-company affiliation.`,
      catalystSummary:
        "A newly indexed scientific publication can add evidence about a company program. " +
        "The article should be reviewed directly before drawing conclusions about efficacy or safety.",
      confidence: 0.86,
      indication: null,
      phase: null,
      outcome: null,
      trialRefs: [],
      companyNames: companies,
      drugNames: drug ? [drug] : [],
      sourceTitle: title,
      publisher: "PubMed / National Library of Medicine",
      isPrimary: false,
      fingerprint: eventFingerprint({
        sourceName: this.sourceName,
        eventType: "scientific_publication",
        occurredDate: doc.publishedAt.slice(0, 10),
        entityKey: pmid,
      }),
      rawSnapshot: raw,
    }];
  }
}
