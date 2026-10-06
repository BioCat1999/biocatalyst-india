/**
 * CTRI fixture adapter — Milestone 3's single compliant source adapter.
 *
 * This is a FIXTURE-BASED MOCK of a Clinical Trials Registry - India
 * (CTRI) public-record adapter (spec §7 explicitly permits fixture-based
 * mocks where live access is blocked or redistribution terms are unclear;
 * rationale in docs/decisions.md). It makes NO network requests: it loads
 * hand-curated records from `adapters/fixtures/ctri/*.json` that resemble
 * real CTRI public records but are fictional.
 *
 * `fetchSince` filters on the record's `last_updated` timestamp; the cursor
 * is an ISO-8601 string. `normalize` maps the record's structured fields to
 * a NormalizedCandidate using deterministic templates (spec §8.1) — unknown
 * statuses/phases map to null, never guessed.
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
  eventFingerprint,
  isoDatePart,
  parseIso,
} from "../normalize.js";

/** Raw shape of one CTRI fixture record (mirrors CTRI public-record fields). */
export interface CtriRecord {
  record_type?: unknown;
  ctri_number?: unknown;
  public_title?: unknown;
  sponsor_name?: unknown;
  phase?: unknown;
  recruitment_status?: unknown;
  intervention_name?: unknown;
  health_condition?: unknown;
  primary_outcome?: unknown;
  primary_outcome_met?: unknown;
  registration_date?: unknown;
  last_updated?: unknown;
  source_url?: unknown;
}

const DEFAULT_FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "ctri",
);

const PUBLISHER = "Clinical Trials Registry - India (CTRI)";

/** CTRI recruitment status → closed taxonomy event type (spec §6). */
function mapStatusToEventType(status: string | null): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "not yet recruiting") return "clinical_trial_started";
  if (
    s === "recruiting" ||
    s === "active, not recruiting" ||
    s === "suspended" ||
    s === "terminated" ||
    s === "withdrawn"
  ) {
    return "clinical_trial_status_changed";
  }
  if (s === "completed") return "clinical_trial_result";
  return null; // unknown statuses stay null — never guessed (spec §17)
}

function mapOutcome(record: CtriRecord): string | null {
  if (record.primary_outcome_met === true) return "primary_endpoint_met";
  if (record.primary_outcome_met === false) return "primary_endpoint_missed";
  return null;
}

const TRIAL_PHASES = new Set([
  "Phase 1",
  "Phase 1/2",
  "Phase 2",
  "Phase 2/3",
  "Phase 3",
  "Phase 4",
  "Preclinical",
]);

function outcomeLabel(outcome: string | null): string {
  if (outcome === "primary_endpoint_met") return "primary endpoint met";
  if (outcome === "primary_endpoint_missed") return "primary endpoint missed";
  return "outcome not disclosed";
}

function buildHeadline(o: {
  eventType: string;
  sponsor: string;
  phase: string;
  drug: string;
  indication: string;
  ctriNumber: string;
  status: string;
  outcome: string | null;
}): string {
  if (o.eventType === "clinical_trial_started") {
    return `${o.sponsor} starts ${o.phase} trial of ${o.drug} in ${o.indication} (${o.ctriNumber})`;
  }
  if (o.eventType === "clinical_trial_result") {
    return `${o.sponsor} reports ${o.phase} results for ${o.drug} (${o.ctriNumber}): ${outcomeLabel(o.outcome)}`;
  }
  return `${o.sponsor} updates ${o.phase} trial of ${o.drug} (${o.ctriNumber}): ${o.status}`;
}

function buildFactualSummary(o: {
  eventType: string;
  sponsor: string;
  phase: string;
  drug: string;
  indication: string;
  ctriNumber: string;
  status: string;
  primaryOutcome: string | null;
  outcome: string | null;
  lastUpdated: string;
}): string {
  const rec = `the CTRI public record (last updated ${o.lastUpdated})`;
  if (o.eventType === "clinical_trial_started") {
    return (
      `${o.sponsor} registered a ${o.phase} trial of ${o.drug} for ${o.indication} ` +
      `(${o.ctriNumber}). Recruitment status is listed as '${o.status}' in ${rec}.`
    );
  }
  if (o.eventType === "clinical_trial_result") {
    const po = o.primaryOutcome ? ` The stated primary outcome is: ${o.primaryOutcome}.` : "";
    return (
      `The ${o.phase} trial of ${o.drug} (${o.ctriNumber}), sponsored by ${o.sponsor}, ` +
      `is listed as completed in ${rec}.${po} The record indicates the primary endpoint was ` +
      `${outcomeLabel(o.outcome)}.`
    );
  }
  return (
    `The CTRI record for ${o.drug} (${o.ctriNumber}), sponsored by ${o.sponsor}, ` +
    `now lists recruitment status '${o.status}'. The ${o.phase} trial targets ${o.indication}; ` +
    `${rec}.`
  );
}

function buildCatalystSummary(eventType: string): string {
  if (eventType === "clinical_trial_started") {
    return (
      "Trial initiation marks the start of clinical evaluation for this program. " +
      "Enrollment progress and any future readout are the next observable steps; " +
      "this is a factual registry update, not an assessment of the program."
    );
  }
  if (eventType === "clinical_trial_result") {
    return (
      "Completed-trial results may support the next regulatory step for the program. " +
      "This summary reflects only the registry record; detailed efficacy and safety " +
      "results await the underlying publication. Not investment advice."
    );
  }
  return (
    "Recruitment-status changes move a program toward or away from a data readout; " +
    "completion or results disclosure is typically the next catalyst. " +
    "Not investment advice."
  );
}

export class CtriFixtureAdapter implements SourceAdapter {
  readonly sourceName: string = "ctri-fixture";
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
      let record: CtriRecord;
      try {
        record = JSON.parse(readFileSync(join(this.fixtureDir, file), "utf8")) as CtriRecord;
      } catch {
        continue; // corrupt fixture file — skip, never crash ingestion
      }
      const url = asText(record.source_url);
      const ctriNumber = asText(record.ctri_number);
      if (!url || !ctriNumber) continue; // no identity → cannot dedupe; skip
      let canonicalUrl: string;
      try {
        canonicalUrl = canonicalizeUrl(url);
      } catch {
        continue;
      }
      const publishedAt = parseIso(record.last_updated) ?? parseIso(record.registration_date);
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
    const r = doc.raw as CtriRecord;
    if (!r || typeof r !== "object") return [];

    const ctriNumber = asText(r.ctri_number);
    const sponsor = asText(r.sponsor_name);
    const drug = asText(r.intervention_name);
    const status = asText(r.recruitment_status);
    const indication = asText(r.health_condition);
    const phaseRaw = asText(r.phase);
    const phase = phaseRaw && TRIAL_PHASES.has(phaseRaw) ? phaseRaw : null;
    const primaryOutcome = asText(r.primary_outcome);
    const title = asText(r.public_title) ?? `CTRI trial record ${ctriNumber ?? ""}`;

    const eventType = mapStatusToEventType(status);
    const occurredAt = parseIso(r.last_updated) ?? parseIso(r.registration_date);
    const outcome = eventType === "clinical_trial_result" ? mapOutcome(r) : null;
    const lastUpdated = doc.publishedAt ? doc.publishedAt.slice(0, 10) : "an unknown date";

    const headline =
      sponsor && phase && drug && indication && status
        ? buildHeadline({
            eventType: eventType ?? "",
            sponsor,
            phase,
            drug,
            indication,
            ctriNumber: ctriNumber ?? "",
            status,
            outcome,
          })
        : title;

    const factualSummary =
      sponsor && phase && drug && indication && status
        ? buildFactualSummary({
            eventType: eventType ?? "",
            sponsor,
            phase,
            drug,
            indication,
            ctriNumber: ctriNumber ?? "",
            status,
            primaryOutcome,
            outcome,
            lastUpdated,
          })
        : title;

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
        catalystSummary: buildCatalystSummary(eventType ?? ""),
        confidence: TEMPLATE_CONFIDENCE,
        indication,
        phase,
        outcome,
        trialRefs: ctriNumber ? [{ registry: "CTRI", registryTrialId: ctriNumber }] : [],
        companyNames: sponsor ? [sponsor] : [],
        drugNames: drug ? [drug] : [],
        sourceTitle: title,
        publisher: PUBLISHER,
        isPrimary: true,
        fingerprint: eventFingerprint({
          sourceName: this.sourceName,
          eventType: eventType ?? "unknown",
          occurredDate: occurredAt ? isoDatePart(occurredAt) : "unknown",
          trialKey: ctriNumber ? `CTRI/${ctriNumber}` : undefined,
          entityKey: drug ?? undefined,
        }),
        rawSnapshot: r,
      },
    ];
  }
}
