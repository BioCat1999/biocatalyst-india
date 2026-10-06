/**
 * BSE/NSE fixture adapter — Milestone 7, source #2.
 *
 * This is a FIXTURE-BASED MOCK of an Indian stock-exchange corporate
 * announcement feed (BSE/NSE Regulation 30 disclosures). It makes NO network
 * requests: it loads hand-curated records from
 * `adapters/fixtures/bse/*.json` that resemble real exchange filings but are
 * fictional. Rationale for fixture-based sources: docs/decisions.md (M3
 * entry) — the same access-control/redistribution reasoning applies here.
 *
 * Coverage is deliberately complementary to the CTRI adapter's clinical
 * coverage (spec §7: add sources one at a time): regulatory_approval,
 * regulatory_submission, licensing_or_partnership, acquisition_or_divestiture
 * (plus one clinical_trial_result used for the M7 cross-source dedupe pair).
 *
 * Entity discipline (spec §17): `companyNames`/`drugNames` only ever name
 * the listed issuer and its program — both must resolve against the
 * canonical catalog or the candidate is rejected. Counterparties named in
 * the filing (licensing partners, acquisition targets) are fictional
 * text-only mentions: they appear in headlines/summaries but NEVER in the
 * entity lists, so the conservative resolver never creates phantom links.
 *
 * `fetchSince` filters on `published_at`; the cursor is an ISO-8601 string.
 * `normalize` maps the record's structured fields to a NormalizedCandidate
 * using deterministic templates — unknown categories map to null, never
 * guessed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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
  crossSourceKey,
  eventFingerprint,
  isoDatePart,
  parseIso,
} from "../normalize.js";

/** Raw shape of one exchange-announcement fixture record. */
export interface BseRecord {
  record_type?: unknown;
  announcement_id?: unknown;
  exchange?: unknown;
  company_name?: unknown;
  ticker_symbol?: unknown;
  category?: unknown;
  announcement_date?: unknown;
  published_at?: unknown;
  public_title?: unknown;
  drug_name?: unknown;
  indication?: unknown;
  trial_id?: unknown;
  primary_outcome?: unknown;
  primary_outcome_met?: unknown;
  partner_name?: unknown;
  acquired_company?: unknown;
  deal_summary?: unknown;
  source_url?: unknown;
}

const DEFAULT_FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "bse",
);

const PUBLISHER = "BSE / NSE corporate announcements (fixture)";

/** Exchange filing category → closed taxonomy event type (spec §6). */
function mapCategoryToEventType(category: string | null): string | null {
  switch ((category ?? "").toLowerCase()) {
    case "regulatory_approval":
      return "regulatory_approval";
    case "regulatory_submission":
      return "regulatory_submission";
    case "licensing_or_partnership":
      return "licensing_or_partnership";
    case "acquisition_or_divestiture":
      return "acquisition_or_divestiture";
    case "clinical_trial_result":
      return "clinical_trial_result";
    default:
      return null; // unknown categories stay null — never guessed (spec §17)
  }
}

/** Parse a trial id into a registry-qualified ref; null when unparseable. */
function parseTrialRef(trialId: string | null): { registry: string; registryTrialId: string } | null {
  if (!trialId) return null;
  if (trialId.startsWith("CTRI/")) return { registry: "CTRI", registryTrialId: trialId };
  if (/^NCT\d{8}$/.test(trialId)) return { registry: "ClinicalTrials.gov", registryTrialId: trialId };
  return null;
}

function outcomeLabel(record: BseRecord): string | null {
  if (record.primary_outcome_met === true) return "primary_endpoint_met";
  if (record.primary_outcome_met === false) return "primary_endpoint_missed";
  return null;
}

function outcomeDisplayLabel(outcome: string | null): string | null {
  if (outcome === "primary_endpoint_met") return "primary endpoint met";
  if (outcome === "primary_endpoint_missed") return "primary endpoint missed";
  return null;
}

function buildHeadline(o: {
  eventType: string;
  company: string;
  drug: string | null;
  indication: string | null;
  trialId: string | null;
  partner: string | null;
  acquired: string | null;
  outcome: string | null;
}): string {
  const program = o.drug ?? "its program";
  switch (o.eventType) {
    case "regulatory_approval":
      return `${o.company} receives marketing authorisation for ${program}${o.indication ? ` in ${o.indication}` : ""}`;
    case "regulatory_submission":
      return `${o.company} files for marketing authorisation for ${program}${o.indication ? ` in ${o.indication}` : ""}`;
    case "licensing_or_partnership":
      return `${o.company} signs licensing agreement for ${program}${o.partner ? ` with ${o.partner}` : ""}`;
    case "acquisition_or_divestiture":
      return `${o.company} to acquire ${o.acquired ?? "a target company"}`;
    case "clinical_trial_result":
      return (
        `${o.company} announces Phase 3 results for ${program}` +
        `${o.trialId ? ` (${o.trialId})` : ""}` +
        `${o.outcome ? `: ${outcomeDisplayLabel(o.outcome)}` : ""}`
      );
    default:
      return `${o.company} announces update for ${program}`;
  }
}

function buildFactualSummary(o: {
  eventType: string;
  company: string;
  drug: string | null;
  indication: string | null;
  trialId: string | null;
  partner: string | null;
  acquired: string | null;
  deal: string | null;
  outcome: string | null;
  primaryOutcome: string | null;
  exchange: string | null;
  announcementId: string | null;
  date: string;
}): string {
  const program = o.drug ?? "its program";
  const filing = `the ${o.exchange ?? "exchange"} filing${o.announcementId ? ` (${o.announcementId})` : ""} dated ${o.date}`;
  const trial = o.trialId ? ` The linked trial is ${o.trialId}.` : "";
  switch (o.eventType) {
    case "regulatory_approval":
      return (
        `${o.company} announced that it has received marketing authorisation for ${program}` +
        `${o.indication ? ` for the treatment of ${o.indication}` : ""}, according to ${filing}.${trial}`
      );
    case "regulatory_submission":
      return (
        `${o.company} announced that it has filed for marketing authorisation for ${program}` +
        `${o.indication ? ` in ${o.indication}` : ""}, according to ${filing}.` +
        `${o.primaryOutcome ? ` The stated primary outcome of the supporting study is: ${o.primaryOutcome}.` : ""}${trial}`
      );
    case "licensing_or_partnership":
      return (
        `${o.company} announced a licensing and supply agreement for ${program}` +
        `${o.partner ? ` with ${o.partner}` : ""}, according to ${filing}.` +
        `${o.deal ? ` Deal terms stated in the filing: ${o.deal}` : ""}`
      );
    case "acquisition_or_divestiture":
      return (
        `${o.company} announced the acquisition of ${o.acquired ?? "a target company"}, according to ${filing}.` +
        `${o.deal ? ` Deal terms stated in the filing: ${o.deal}` : ""}`
      );
    case "clinical_trial_result":
      return (
        `${o.company} announced Phase 3 results for ${program} in ${filing}.${trial}` +
        `${o.primaryOutcome ? ` The stated primary outcome is: ${o.primaryOutcome}.` : ""}` +
        `${o.outcome ? ` The announcement states the ${outcomeDisplayLabel(o.outcome)}.` : " The announcement does not disclose the primary endpoint outcome."}`
      );
    default:
      return `${o.company} announced an update for ${program}, according to ${filing}.`;
  }
}

function buildCatalystSummary(eventType: string): string {
  switch (eventType) {
    case "regulatory_approval":
      return (
        "Regulatory approval changes the program's status from investigational to authorized in the relevant jurisdiction. " +
        "Manufacturing scale-up and launch execution are the next operational steps. Not investment advice."
      );
    case "regulatory_submission":
      return (
        "A regulatory submission starts a formal review process. The regulator's decision or further information requests are the next observable milestones. " +
        "Not investment advice."
      );
    case "licensing_or_partnership":
      return (
        "A licensing agreement changes how the program is developed or commercialized in the covered territories. " +
        "Development milestones in the agreement are the next observable steps. Not investment advice."
      );
    case "acquisition_or_divestiture":
      return (
        "A change in ownership affects who develops the acquired pipeline. Integration plans and any program decisions by the new owner are the next observable steps. " +
        "Not investment advice."
      );
    default:
      return (
        "Trial results disclosed via an exchange filing are a factual record of the readout. " +
        "Detailed efficacy and safety results await the underlying publication. Not investment advice."
      );
  }
}

export class BseFixtureAdapter implements SourceAdapter {
  readonly sourceName: string = "bse-fixture";
  private readonly fixtureDir: string;
  private docs: RawSourceDocument[] | null = null;
  private lastCursor: Cursor = "";

  /** `fixtureDir` is injectable so tests can supply edge-case records. */
  constructor(fixtureDir?: string) {
    this.fixtureDir = fixtureDir ?? DEFAULT_FIXTURE_DIR;
  }

  private loadDocs(): RawSourceDocument[] {
    if (this.docs) return this.docs;
    const retrievedAt = new Date().toISOString();
    const files = readdirSync(this.fixtureDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const docs: RawSourceDocument[] = [];
    for (const file of files) {
      let record: BseRecord;
      try {
        record = JSON.parse(readFileSync(join(this.fixtureDir, file), "utf8")) as BseRecord;
      } catch {
        continue; // corrupt fixture file — skip, never crash ingestion
      }
      const url = asText(record.source_url);
      const announcementId = asText(record.announcement_id);
      if (!url || !announcementId) continue; // no identity → cannot dedupe; skip
      let canonicalUrl: string;
      try {
        canonicalUrl = canonicalizeUrl(url);
      } catch {
        continue;
      }
      const publishedAt = parseIso(record.published_at) ?? parseIso(record.announcement_date);
      docs.push({
        sourceName: this.sourceName,
        canonicalUrl,
        contentHash: contentHash(record),
        retrievedAt,
        publishedAt,
        raw: record,
      });
    }
    docs.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
    this.docs = docs;
    return docs;
  }

  async fetchSince(cursor: Cursor): Promise<RawSourceDocument[]> {
    const docs = this.loadDocs().filter((d) => (d.publishedAt ?? "") > cursor);
    const newest = docs.length ? (docs[docs.length - 1].publishedAt ?? "") : cursor;
    this.lastCursor = newest > cursor ? newest : cursor;
    return docs;
  }

  getNextCursor(): Cursor {
    return this.lastCursor;
  }

  async normalize(doc: RawSourceDocument): Promise<NormalizedCandidate[]> {
    const r = doc.raw as BseRecord;
    if (!r || typeof r !== "object") return [];

    const company = asText(r.company_name);
    const drug = asText(r.drug_name);
    const indication = asText(r.indication);
    const trialId = asText(r.trial_id);
    const partner = asText(r.partner_name);
    const acquired = asText(r.acquired_company);
    const deal = asText(r.deal_summary);
    const exchange = asText(r.exchange);
    const announcementId = asText(r.announcement_id);
    const primaryOutcome = asText(r.primary_outcome);
    const title = asText(r.public_title) ?? `Exchange announcement ${announcementId ?? ""}`;

    const eventType = mapCategoryToEventType(asText(r.category));
    const occurredAt = parseIso(r.published_at) ?? parseIso(r.announcement_date);
    const outcome = eventType === "clinical_trial_result" ? outcomeLabel(r) : null;
    const date = doc.publishedAt ? doc.publishedAt.slice(0, 10) : "an unknown date";

    const headline =
      company
        ? buildHeadline({ eventType: eventType ?? "", company, drug, indication, trialId, partner, acquired, outcome })
        : title;

    const factualSummary =
      company
        ? buildFactualSummary({
            eventType: eventType ?? "",
            company,
            drug,
            indication,
            trialId,
            partner,
            acquired,
            deal,
            outcome,
            primaryOutcome,
            exchange,
            announcementId,
            date,
          })
        : title;

    const trialRef = parseTrialRef(trialId);

    return [
      {
        sourceName: this.sourceName,
        canonicalUrl: doc.canonicalUrl,
        contentHash: doc.contentHash,
        retrievedAt: doc.retrievedAt,
        publishedAt: doc.publishedAt,
        eventType, // null when the category can't be mapped — runner rejects
        occurredAt, // null when no usable date — runner rejects
        headline,
        factualSummary,
        catalystSummary: buildCatalystSummary(eventType ?? ""),
        confidence: TEMPLATE_CONFIDENCE,
        indication,
        phase: null, // exchange filings carry no structured phase
        outcome,
        trialRefs: trialRef ? [trialRef] : [],
        // NOTE: partner/acquired-company names are deliberately excluded —
        // they are fictional counterparties, not canonical entities.
        companyNames: company ? [company] : [],
        drugNames: drug ? [drug] : [],
        sourceTitle: title,
        publisher: PUBLISHER,
        isPrimary: true,
        fingerprint: eventFingerprint({
          sourceName: this.sourceName,
          eventType: eventType ?? "unknown",
          occurredDate: occurredAt ? isoDatePart(occurredAt) : "unknown",
          trialKey: trialRef ? `${trialRef.registry}/${trialRef.registryTrialId}` : undefined,
          entityKey: drug ?? company ?? undefined,
        }),
        // Trial-anchored cross-source dedupe (M7): the same readout filed
        // with the exchange and published in a journal merges into one event.
        crossSourceKey: trialRef ? crossSourceKey(trialRef) : null,
        rawSnapshot: r,
      },
    ];
  }
}
