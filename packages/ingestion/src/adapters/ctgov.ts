/**
 * ClinicalTrials.gov live adapter — trials from the real registry.
 *
 * Source: the ClinicalTrials.gov API v2 (`https://clinicaltrials.gov/api/v2`),
 * a free public API that requires no key. One `query.spons` search per
 * tracked company (see `SPONSOR_QUERIES` in company-map.ts), paged via
 * `nextPageToken`. Makes outbound HTTPS requests — the only network-calling
 * ingestion adapter besides `gdelt`.
 *
 * Cursor semantics: ISO-8601 date of the newest record seen (the API reports
 * last-update at day precision). Filtering is INCLUSIVE (`>=`) because two
 * runs can share the boundary day; the runner's (source_name,
 * canonical_url) + content-hash dedupe makes re-fetched boundary records a
 * no-op. A first run (empty cursor) looks back 90 days so it produces recent
 * trials rather than the registry's full history.
 *
 * Entity discipline (spec §17): the lead sponsor is mapped to a canonical
 * company via `matchCompanyName`; records whose lead sponsor is not one of
 * the tracked companies are dropped (never emitted with a guessed name).
 * Real NCT ids are NOT emitted as `trialRefs` — the canonical trial catalog
 * is fixture-seeded and cannot resolve them, and the runner rejects
 * unresolvable trial refs. The NCT id still anchors the event fingerprint.
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
  parseIso,
} from "../normalize.js";
import { SPONSOR_QUERIES, matchCompanyName, matchDrugName } from "./company-map.js";
import { fetchJson } from "./http.js";

export const CTGOV_SOURCE_NAME = "ctgov";
const API_BASE = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = 100;
const MAX_PAGES_PER_SPONSOR = 5;
const REQUEST_TIMEOUT_MS = 20_000;
const BETWEEN_SPONSOR_DELAY_MS = 250;
const FIRST_RUN_LOOKBACK_DAYS = 90;
const USER_AGENT = "BiocatalystIndia/1.0 (personal research use; clinical-trials ingestion)";

/** Minimal shape of a ClinicalTrials.gov v2 study record (fields we use). */
export interface CtgovStudy {
  protocolSection?: {
    identificationModule?: { nctId?: unknown; briefTitle?: unknown; officialTitle?: unknown };
    statusModule?: {
      overallStatus?: unknown;
      lastUpdatePostDateStruct?: { date?: unknown };
      lastUpdateSubmitDate?: unknown;
      startDateStruct?: { date?: unknown };
      primaryCompletionDateStruct?: { date?: unknown };
      studyFirstPostDateStruct?: { date?: unknown };
      studyFirstSubmitDate?: unknown;
    };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: unknown } };
    designModule?: { phases?: unknown; enrollmentInfo?: { count?: unknown } };
    conditionsModule?: { conditions?: unknown };
    armsInterventionsModule?: { interventions?: { name?: unknown; type?: unknown }[] };
    outcomesModule?: { primaryOutcomes?: { measure?: unknown }[] };
    descriptionModule?: { briefSummary?: unknown };
  };
}

const PUBLISHER = "ClinicalTrials.gov";

/** ClinicalTrials.gov overallStatus → closed taxonomy event type (spec §6). */
function mapStatusToEventType(status: string | null): string | null {
  if (!status) return null;
  switch (status.toUpperCase()) {
    case "NOT_YET_RECRUITING":
      return "clinical_trial_started";
    case "RECRUITING":
    case "ACTIVE_NOT_RECRUITING":
    case "ENROLLING_BY_INVITATION":
    case "SUSPENDED":
    case "TERMINATED":
    case "WITHDRAWN":
      return "clinical_trial_status_changed";
    case "COMPLETED":
      return "clinical_trial_result";
    default:
      return null; // unknown statuses stay null — never guessed (spec §17)
  }
}

function statusLabel(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}

/** "PHASE2" / "PHASE2/PHASE3" → "Phase 2" / "Phase 2/3"; unrecognized → null. */
function mapPhase(phases: unknown): string | null {
  if (!Array.isArray(phases)) return null;
  const parts: string[] = [];
  for (const p of phases) {
    const t = asText(p);
    if (!t) continue;
    const m = /^PHASE(\d)(?:[/_]PHASE(\d))?$/.exec(t.toUpperCase());
    if (m) parts.push(m[2] ? `Phase ${m[1]}/${m[2]}` : `Phase ${m[1]}`);
  }
  return parts.length ? parts.join(", ") : null;
}

/**
 * Best available "last touched" date for cursoring (YYYY-MM-DD), or null.
 * Falls back to first-post dates so records missing update metadata are
 * still ingestible instead of silently dropped.
 */
function recordDate(study: CtgovStudy): string | null {
  const sm = study.protocolSection?.statusModule;
  return (
    asText(sm?.lastUpdatePostDateStruct?.date) ??
    asText(sm?.lastUpdateSubmitDate)?.slice(0, 10) ??
    asText(sm?.studyFirstPostDateStruct?.date) ??
    asText(sm?.studyFirstSubmitDate)?.slice(0, 10) ??
    null
  );
}

function nctIdOf(study: CtgovStudy): string | null {
  return asText(study.protocolSection?.identificationModule?.nctId);
}

function exactDate(raw: unknown): string | null {
  const value = asText(raw);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function enrollmentOf(study: CtgovStudy): number | null {
  const raw = study.protocolSection?.designModule?.enrollmentInfo?.count;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  return fetchJson(fetchImpl, url, { userAgent: USER_AGENT, timeoutMs: REQUEST_TIMEOUT_MS });
}

function buildSearchUrl(sponsorQuery: string, pageToken?: string): string {
  const params = new URLSearchParams({
    "query.spons": sponsorQuery,
    pageSize: String(PAGE_SIZE),
    format: "json",
    countTotal: "true",
  });
  if (pageToken) params.set("pageToken", pageToken);
  return `${API_BASE}?${params.toString()}`;
}

function buildHeadline(o: {
  eventType: string;
  company: string;
  phase: string | null;
  title: string;
  nctId: string;
  status: string;
}): string {
  const what = o.phase ? `${o.phase} trial` : "trial";
  if (o.eventType === "clinical_trial_started") {
    return `${o.company} starts ${what}: ${o.title} (${o.nctId})`;
  }
  if (o.eventType === "clinical_trial_result") {
    return `${o.company} completes ${what}: ${o.title} (${o.nctId})`;
  }
  return `${o.company} ${what} update: ${o.title} (${o.nctId}) — now ${statusLabel(o.status)}`;
}

export class CtgovAdapter implements SourceAdapter {
  readonly sourceName: string = CTGOV_SOURCE_NAME;
  private readonly fetchImpl: typeof fetch;
  private readonly politenessDelayMs: number;
  private lastCursor: Cursor = "";

  /**
   * `fetchImpl` is injectable so tests can stub the API. `politenessDelayMs`
   * spaces out the per-sponsor searches against the public API (tests pass 0).
   */
  constructor(fetchImpl?: typeof fetch, opts?: { politenessDelayMs?: number }) {
    this.fetchImpl = fetchImpl ?? globalThis.fetch;
    this.politenessDelayMs = opts?.politenessDelayMs ?? BETWEEN_SPONSOR_DELAY_MS;
  }

  async fetchSince(cursor: Cursor): Promise<RawSourceDocument[]> {
    // Inclusive boundary: day-precision dates mean two runs can share the
    // boundary day; runner dedupe absorbs the overlap.
    const since = cursor || daysAgoIso(FIRST_RUN_LOOKBACK_DAYS);
    const sinceDay = since.slice(0, 10);
    const retrievedAt = new Date().toISOString();
    const docs: RawSourceDocument[] = [];
    const seen = new Set<string>();
    let newest = since;

    for (const sponsorQuery of SPONSOR_QUERIES) {
      let pageToken: string | undefined;
      let pages = 0;
      do {
        const data = (await getJson(this.fetchImpl, buildSearchUrl(sponsorQuery, pageToken))) as {
          studies?: CtgovStudy[];
          nextPageToken?: unknown;
        };
        for (const study of data.studies ?? []) {
          const nctId = nctIdOf(study);
          if (!nctId || seen.has(nctId)) continue;
          seen.add(nctId);
          const date = recordDate(study);
          if (!date || date < sinceDay) continue;
          let canonicalUrl: string;
          try {
            canonicalUrl = canonicalizeUrl(`https://clinicaltrials.gov/study/${nctId}`);
          } catch {
            continue;
          }
          const publishedAt = `${date}T00:00:00.000Z`;
          docs.push({
            sourceName: this.sourceName,
            canonicalUrl,
            contentHash: contentHash(study),
            retrievedAt,
            publishedAt,
            raw: study,
          });
          if (publishedAt > newest) newest = publishedAt;
        }
        pageToken = asText(data.nextPageToken) ?? undefined;
        pages += 1;
      } while (pageToken && pages < MAX_PAGES_PER_SPONSOR);
      if (this.politenessDelayMs > 0) await sleep(this.politenessDelayMs);
    }

    docs.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    this.lastCursor = newest;
    return docs;
  }

  getNextCursor(): Cursor {
    return this.lastCursor;
  }

  async normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]> {
    const study = doc.raw as CtgovStudy;
    const ps = study?.protocolSection;
    if (!ps) return [];

    const nctId = nctIdOf(study);
    if (!nctId) return [];

    const leadSponsor = asText(ps.sponsorCollaboratorsModule?.leadSponsor?.name);
    const company = matchCompanyName(leadSponsor);
    // Precision gate: only trials led by a tracked company become events.
    // Anything else would fail entity resolution and be rejected anyway.
    if (!company) return [];

    const status = asText(ps.statusModule?.overallStatus);
    const eventType = mapStatusToEventType(status);
    const occurredAt = doc.publishedAt; // cursor date, full ISO
    const phase = mapPhase(ps.designModule?.phases);
    const conditions = Array.isArray(ps.conditionsModule?.conditions)
      ? (ps.conditionsModule.conditions as unknown[]).map(asText).filter((c): c is string => !!c)
      : [];
    const indication = conditions[0] ?? null;

    const seen = new Set<string>();
    const drugNames: string[] = [];
    const interventions = ps.armsInterventionsModule?.interventions ?? [];
    if (Array.isArray(interventions)) {
      for (const iv of interventions) {
        const mapped = matchDrugName(asText(iv?.name));
        if (mapped && !seen.has(mapped)) {
          seen.add(mapped);
          drugNames.push(mapped);
        }
      }
    }

    const title =
      asText(ps.identificationModule?.briefTitle) ??
      asText(ps.identificationModule?.officialTitle) ??
      `ClinicalTrials.gov record ${nctId}`;
    const primaryCompletion = exactDate(ps.statusModule?.primaryCompletionDateStruct?.date);
    const startDate = exactDate(ps.statusModule?.startDateStruct?.date);
    const primaryEndpoints = Array.isArray(ps.outcomesModule?.primaryOutcomes)
      ? ps.outcomesModule.primaryOutcomes
          .map((outcome) => asText(outcome?.measure))
          .filter((measure): measure is string => Boolean(measure))
          .slice(0, 20)
      : [];

    const headline =
      eventType && status
        ? buildHeadline({ eventType, company, phase, title, nctId, status })
        : title;

    let factualSummary = headline + ".";
    if (eventType === "clinical_trial_started" && startDate) {
      factualSummary += ` Start date listed as ${startDate}.`;
    }
    if (eventType === "clinical_trial_result" && primaryCompletion) {
      factualSummary += ` Primary completion date listed as ${primaryCompletion}.`;
    }
    factualSummary += ` Source: the ClinicalTrials.gov registry record (last updated ${doc.publishedAt?.slice(0, 10) ?? "unknown"}).`;

    const catalystSummary =
      eventType === "clinical_trial_started"
        ? "Trial initiation marks the start of clinical evaluation for this program. Enrollment progress and any future readout are the next observable steps; this is a factual registry update, not an assessment of the program."
        : eventType === "clinical_trial_result"
          ? "A completed trial may support the next regulatory step for the program. This summary reflects only the registry record; detailed efficacy and safety results await the underlying publication. Not investment advice."
          : "Recruitment-status changes move a program toward or away from a data readout; completion or results disclosure is typically the next catalyst. Not investment advice.";

    return [
      {
        sourceName: this.sourceName,
        canonicalUrl: doc.canonicalUrl,
        contentHash: doc.contentHash,
        retrievedAt: doc.retrievedAt,
        publishedAt: doc.publishedAt,
        eventType, // null when the status can't be mapped — runner rejects
        occurredAt, // null when no usable date — runner rejects
        headline,
        factualSummary,
        catalystSummary,
        confidence: TEMPLATE_CONFIDENCE,
        indication,
        phase,
        outcome: null, // registry data can't establish endpoint outcomes — stays null (spec §17)
        trialRefs: [{ registry: "ClinicalTrials.gov", registryTrialId: nctId }],
        companyNames: [company],
        drugNames,
        sourceTitle: title,
        publisher: PUBLISHER,
        isPrimary: true,
        fingerprint: eventFingerprint({
          sourceName: this.sourceName,
          eventType: eventType ?? "unknown",
          occurredDate: occurredAt ? isoDatePart(occurredAt) : "unknown",
          trialKey: `NCT/${nctId}`,
          entityKey: company,
        }),
        // No crossSourceKey: each status snapshot of a trial is its own
        // event (a bare NCT key would merge later status changes into the
        // first event and swallow the signal).
        rawSnapshot: study,
        trialRecord: {
          registry: "ClinicalTrials.gov",
          registryTrialId: nctId,
          title,
          phase,
          status,
          enrollment: enrollmentOf(study),
          sponsorCompanyName: company,
          startDate,
          primaryCompletionDate: primaryCompletion,
          sourceUrl: doc.canonicalUrl,
          primaryEndpoints,
          indications: conditions,
          drugNames,
        },
      },
    ];
  }
}
