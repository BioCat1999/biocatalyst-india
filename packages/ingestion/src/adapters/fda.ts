/**
 * openFDA live adapter — US regulatory events with India impact.
 *
 * Source: the FDA's openFDA API (`https://api.fda.gov`), a free public JSON
 * API that needs no key (1,000 requests/day per IP without one; a free key
 * via the `FDA_API_KEY` env var raises the cap). Three endpoints:
 *   - `/drug/drugsfda.json` — drug approvals (submission_status AP), mapped
 *     to `regulatory_approval`. The applicant/sponsor resolves through the
 *     company matcher, so Indian companies' US approvals (ANDA/NDA) and
 *     global majors' approvals both land as events.
 *   - `/drug/enforcement.json` — recalls. Class I → `safety_signal`,
 *     Class II/III → `manufacturing_or_inspection_update` (often a plant
 *     quality issue — the kind of news that moves Indian API/formulation
 *     stocks when the recalling firm is Indian).
 *   - `/drug/shortages.json` — current unavailable/limited products, mapped
 *     to `drug_shortage` when the reporting company resolves to a tracked
 *     company. Availability and the FDA's stated reason are kept verbatim.
 *
 * openFDA is a primary source (`isPrimary: true`): approvals carry 0.9
 * confidence (auto-publish), recalls 0.85 (pending review — recalling-firm
 * strings are messier than sponsor names).
 *
 * Cursor semantics: ISO-8601 date (YYYY-MM-DD) of the newest record seen;
 * filtering is inclusive (>=) and the runner's (source_name, canonical_url)
 * + content-hash dedupe absorbs boundary re-fetches. First run looks back
 * 30 days. Records whose sponsor/firm matches no tracked company are
 * dropped at normalize time (entity discipline, spec §17).
 */
import type {
  Cursor,
  NormalizedCandidate,
  RawSourceDocument,
  SourceAdapter,
} from "../adapter.js";
import { contentHash, eventFingerprint, TEMPLATE_CONFIDENCE } from "../normalize.js";
import { matchCompanyName } from "./company-map.js";
import { fetchJson } from "./http.js";

export const FDA_SOURCE_NAME = "openfda";
const API_BASE = "https://api.fda.gov";
const REQUEST_TIMEOUT_MS = 20_000;
const FIRST_RUN_LOOKBACK_DAYS = 30;
// Drugs@FDA caps a single response at 99 records (the enforcement endpoint's
// cap is higher), so use the lower shared limit for both queries.
const PAGE_LIMIT = 99;
const USER_AGENT = "BiocatalystIndia/1.0 (personal research use; openFDA ingestion)";

const RECALL_CONFIDENCE = 0.85;

function apiKeyParam(): string {
  const key = process.env.FDA_API_KEY;
  return key ? `&api_key=${encodeURIComponent(key)}` : "";
}

function yyyymmdd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

/** YYYYMMDD → ISO date, or null when unparseable. */
export function fdaDateToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
}

/** Minimal drugsfda record shape (fields we use). */
export interface FdaApprovalRecord {
  application_number?: unknown;
  sponsor_name?: unknown;
  products?: Array<{
    brand_name?: unknown;
    active_ingredients?: Array<{ name?: unknown }>;
  }>;
  submissions?: Array<{
    submission_type?: unknown;
    submission_status?: unknown;
    submission_status_date?: unknown;
  }>;
}

/** Minimal enforcement record shape (fields we use). */
export interface FdaRecallRecord {
  recall_number?: unknown;
  recalling_firm?: unknown;
  product_description?: unknown;
  reason_for_recall?: unknown;
  classification?: unknown;
  status?: unknown;
  recall_initiation_date?: unknown;
}

/** Minimal drug-shortage record shape (fields we use). */
export interface FdaShortageRecord {
  package_ndc?: unknown;
  generic_name?: unknown;
  proprietary_name?: unknown;
  company_name?: unknown;
  availability?: unknown;
  status?: unknown;
  update_type?: unknown;
  shortage_reason?: unknown;
  update_date?: unknown;
}

function asText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** MM/DD/YYYY → ISO date, or null when unparseable. */
export function fdaSlashDateToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T00:00:00.000Z`;
}

function latestApprovalSubmission(
  r: FdaApprovalRecord,
): { type: string; date: string } | null {
  const subs = Array.isArray(r.submissions) ? r.submissions : [];
  let best: { type: string; date: string } | null = null;
  for (const s of subs) {
    if (asText(s.submission_status) !== "AP") continue;
    const date = asText(s.submission_status_date);
    const type = asText(s.submission_type);
    if (!date || !type) continue;
    if (!best || date > best.date) best = { type, date };
  }
  return best;
}

function brandName(r: FdaApprovalRecord): string | null {
  const products = Array.isArray(r.products) ? r.products : [];
  for (const p of products) {
    const b = asText(p.brand_name);
    if (b) return b;
  }
  return null;
}

function activeIngredient(r: FdaApprovalRecord): string | null {
  const products = Array.isArray(r.products) ? r.products : [];
  for (const p of products) {
    const ings = Array.isArray(p.active_ingredients) ? p.active_ingredients : [];
    const n = asText(ings[0]?.name);
    if (n) return n;
  }
  return null;
}

export class OpenFdaAdapter implements SourceAdapter {
  readonly sourceName = FDA_SOURCE_NAME;
  private fetchImpl: typeof fetch;
  private lastCursor: Cursor = "";

  /** `fetchImpl` is injectable so tests can stub the API. */
  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
  }

  private async query(path: string, search: string, sort?: string): Promise<unknown[]> {
    const url =
      `${API_BASE}${path}?search=${encodeURIComponent(search)}` +
      `${sort ? `&sort=${encodeURIComponent(sort)}` : ""}` +
      `&limit=${PAGE_LIMIT}${apiKeyParam()}`;
    let data: { results?: unknown[]; error?: unknown };
    try {
      data = (await fetchJson(this.fetchImpl, url, {
        userAgent: USER_AGENT,
        timeoutMs: REQUEST_TIMEOUT_MS,
      })) as { results?: unknown[]; error?: unknown };
    } catch (err) {
      // openFDA uses HTTP 404 for a valid query with no matching records.
      // A quiet source window is not an ingestion failure.
      if (err instanceof Error && /HTTP 404\b/.test(err.message)) return [];
      throw err;
    }
    if (data.error) return [];
    return Array.isArray(data.results) ? data.results : [];
  }

  async fetchSince(cursor: Cursor): Promise<RawSourceDocument[]> {
    const now = new Date();
    const since =
      cursor || new Date(now.getTime() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const range = `[${yyyymmdd(new Date(since))} TO ${yyyymmdd(now)}]`;

    const approvals = await this.query(
      "/drug/drugsfda.json",
      `submissions.submission_status:AP AND submissions.submission_status_date:${range}`,
    );
    const recalls = await this.query(
      "/drug/enforcement.json",
      `recall_initiation_date:${range}`,
    );
    const shortages = await this.query(
      "/drug/shortages.json",
      "status:Current AND -availability:Available",
      "update_date:desc",
    );

    const retrievedAt = now.toISOString();
    const docs: RawSourceDocument[] = [];
    const seen = new Set<string>();
    let newest = since;

    const push = (kind: "approval" | "recall" | "shortage", record: unknown, dateIso: string | null, key: string) => {
      if (!dateIso || dateIso.slice(0, 10) < since) return;
      const dataset = kind === "approval" ? "drugsfda" : kind === "recall" ? "enforcement" : "shortages";
      const canonicalUrl = `${API_BASE}/drug/${dataset}.json?record=${encodeURIComponent(key)}`;
      if (seen.has(canonicalUrl)) return;
      seen.add(canonicalUrl);
      docs.push({
        sourceName: this.sourceName,
        canonicalUrl,
        contentHash: contentHash({ url: canonicalUrl, record }),
        retrievedAt,
        publishedAt: dateIso,
        raw: { kind, record },
      });
      if (dateIso.slice(0, 10) > newest) newest = dateIso.slice(0, 10);
    };

    for (const r of approvals) {
      const rec = r as FdaApprovalRecord;
      const sub = latestApprovalSubmission(rec);
      const appNo = asText(rec.application_number) ?? "unknown";
      push("approval", rec, sub ? fdaDateToIso(sub.date) : null, appNo);
    }
    for (const r of recalls) {
      const rec = r as FdaRecallRecord;
      push("recall", rec, fdaDateToIso(asText(rec.recall_initiation_date)), asText(rec.recall_number) ?? "unknown");
    }
    for (const r of shortages) {
      const rec = r as FdaShortageRecord;
      const identity = [
        asText(rec.package_ndc),
        asText(rec.company_name),
        asText(rec.generic_name),
      ].filter(Boolean).join(":") || "unknown";
      push("shortage", rec, fdaSlashDateToIso(asText(rec.update_date)), identity);
    }

    docs.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    this.lastCursor = newest;
    return docs;
  }

  getNextCursor(): Cursor {
    return this.lastCursor;
  }

  async normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]> {
    const { kind, record } = doc.raw as { kind: string; record: unknown };
    if (kind === "approval") return [normalizeApproval(doc, record as FdaApprovalRecord)].filter(Boolean) as NormalizedCandidate[];
    if (kind === "shortage") return [normalizeShortage(doc, record as FdaShortageRecord)].filter(Boolean) as NormalizedCandidate[];
    return [normalizeRecall(doc, record as FdaRecallRecord)].filter(Boolean) as NormalizedCandidate[];
  }
}

function baseCandidate(doc: RawSourceDocument): Omit<
  NormalizedCandidate,
  | "eventType" | "occurredAt" | "headline" | "factualSummary" | "catalystSummary"
  | "confidence" | "companyNames" | "fingerprint"
> {
  return {
    sourceName: doc.sourceName,
    canonicalUrl: doc.canonicalUrl,
    contentHash: doc.contentHash,
    retrievedAt: doc.retrievedAt,
    publishedAt: doc.publishedAt,
    indication: null,
    phase: null,
    outcome: null,
    trialRefs: [],
    drugNames: [],
    sourceTitle: "",
    publisher: "US FDA via openFDA",
    isPrimary: true,
    rawSnapshot: doc.raw,
  };
}

function normalizeApproval(
  doc: RawSourceDocument,
  r: FdaApprovalRecord,
): NormalizedCandidate | null {
  const sponsor = asText(r.sponsor_name);
  const company = matchCompanyName(sponsor);
  if (!company) return null; // entity discipline: not a tracked company
  const sub = latestApprovalSubmission(r);
  if (!sub) return null;
  const brand = brandName(r) ?? "a drug product";
  const ingredient = activeIngredient(r);
  const headline = `FDA approves ${brand}${ingredient ? ` (${ingredient})` : ""} — ${sub.type}`;
  const occurredAt = fdaDateToIso(sub.date);
  return {
    ...baseCandidate(doc),
    eventType: "regulatory_approval",
    occurredAt,
    headline,
    factualSummary:
      `The US FDA granted ${sub.type} approval for ${brand} ` +
      `(sponsor: ${sponsor}). Approval status date ${sub.date}.`,
    catalystSummary:
      `A US FDA approval for ${company}. For Indian companies this can mean ` +
      `a US launch and revenue ramp; for global innovators it can reset ` +
      `competitive dynamics for Indian generics makers in the same class.`,
    confidence: TEMPLATE_CONFIDENCE,
    companyNames: [company],
    sourceTitle: headline,
    fingerprint: eventFingerprint({
      sourceName: doc.sourceName,
      eventType: "regulatory_approval",
      occurredDate: occurredAt ? occurredAt.slice(0, 10) : "unknown",
      entityKey: `${company}:${brand}:${sub.type}`,
    }),
  };
}

function normalizeRecall(
  doc: RawSourceDocument,
  r: FdaRecallRecord,
): NormalizedCandidate | null {
  const firm = asText(r.recalling_firm);
  const company = matchCompanyName(firm);
  if (!company) return null; // entity discipline: not a tracked company
  const classification = asText(r.classification) ?? "";
  const eventType = /^class\s*i\b/i.test(classification)
    ? "safety_signal"
    : "manufacturing_or_inspection_update";
  const product = asText(r.product_description) ?? "a drug product";
  const reason = asText(r.reason_for_recall);
  const headline = `FDA ${classification || "recall"}: ${firm} recalls ${product}`;
  const occurredAt = doc.publishedAt;
  return {
    ...baseCandidate(doc),
    eventType,
    occurredAt,
    headline,
    factualSummary:
      `The US FDA records a ${classification || "recall"} by ${firm} for ` +
      `${product}.${reason ? ` Reason: ${reason}.` : ""}`,
    catalystSummary:
      `A US recall involving ${company}. Recalls can signal manufacturing ` +
      `quality issues and have preceded FDA warning letters or import alerts ` +
      `for Indian manufacturers in the past.`,
    confidence: RECALL_CONFIDENCE,
    companyNames: [company],
    sourceTitle: headline,
    fingerprint: eventFingerprint({
      sourceName: doc.sourceName,
      eventType,
      occurredDate: occurredAt ? occurredAt.slice(0, 10) : "unknown",
      entityKey: `${company}:${asText(r.recall_number) ?? product}`,
    }),
  };
}

function normalizeShortage(
  doc: RawSourceDocument,
  r: FdaShortageRecord,
): NormalizedCandidate | null {
  const reporter = asText(r.company_name);
  const company = matchCompanyName(reporter);
  if (!company) return null;
  const medicine = asText(r.generic_name) ?? asText(r.proprietary_name) ?? "a drug product";
  const availability = asText(r.availability) ?? "limited availability";
  const reason = asText(r.shortage_reason);
  const updateType = asText(r.update_type);
  const occurredAt = fdaSlashDateToIso(asText(r.update_date)) ?? doc.publishedAt;
  const headline = `FDA shortage: ${medicine} — ${availability}`;
  return {
    ...baseCandidate(doc),
    eventType: "drug_shortage",
    occurredAt,
    headline,
    factualSummary:
      `The US FDA lists ${medicine} from ${reporter} as ${availability.toLowerCase()}.` +
      `${reason ? ` Stated reason: ${reason}.` : ""}` +
      `${updateType ? ` Update type: ${updateType}.` : ""}`,
    catalystSummary:
      `A current US supply constraint involving ${company}. Shortages can affect ` +
      `near-term product availability and may create opportunities for alternative suppliers.`,
    confidence: TEMPLATE_CONFIDENCE,
    companyNames: [company],
    sourceTitle: headline,
    fingerprint: eventFingerprint({
      sourceName: doc.sourceName,
      eventType: "drug_shortage",
      occurredDate: occurredAt ? occurredAt.slice(0, 10) : "unknown",
      entityKey: `${company}:${medicine}:${availability}`,
    }),
  };
}
