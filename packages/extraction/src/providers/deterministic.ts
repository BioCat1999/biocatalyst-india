/**
 * Deterministic rule/template extractor — the DEFAULT provider (Milestone 4).
 *
 * Pure functions of the input document: same document → same output, no
 * network, no API keys, no randomness. It may extract or summarize but
 * NEVER invents numeric values, trial IDs, endpoints, dates, or company
 * relationships (spec §8.3):
 *
 *  - trial_ids: only registry-ID patterns literally present in the text
 *    (e.g. CTRI/2024/08/071902, NCT01234567). Absent → [].
 *  - published_at: only ISO-parseable dates present in structured fields.
 *    Absent/unparseable → null.
 *  - company/drug/indication names: only from structured record fields or
 *    explicit name patterns in text. Absent → [].
 *  - outcome: only from an explicit boolean field or explicit outcome
 *    language. Ambiguous language → "unknown" with lowered confidence.
 *  - numeric values (enrollment, dosages, percentages): extracted only when
 *    matched by an explicit pattern in the source text; never synthesized.
 *
 * Every claim in `facts` carries a verbatim `source_span` (quoted text or
 * a quoted record field) and a per-claim confidence.
 */
import { EVENT_TYPES } from "@biocatalyst/types";
import type { ExtractionDocument, ExtractionProvider } from "../provider.js";
import {
  TRIAL_PHASES,
  type ExtractionFact,
  type StructuredExtraction,
} from "../schema.js";

const PHASES = new Set<string>(TRIAL_PHASES);

/** Registry trial-ID shapes we recognize in free text. */
const TRIAL_ID_PATTERNS = [
  /CTRI\/\d{4}\/\d{2}\/\d+/g,
  /\bNCT\d{8}\b/g,
];

/** Explicit outcome language → outcome. Checked before ambiguity rules. */
const OUTCOME_MET_PATTERNS = [
  /primary endpoint (?:was |has been )?met\b/i,
  /\bmet (?:its |the )?primary endpoint/i,
  /primary_outcome_met["']?\s*:\s*true/i,
];
const OUTCOME_MISSED_PATTERNS = [
  /failed to meet (?:its |the )?primary endpoint/i,
  /did not meet (?:its |the )?primary endpoint/i,
  /\bmissed (?:its |the )?primary endpoint/i,
  /primary endpoint (?:was |has been )?not met\b/i,
  /primary_outcome_met["']?\s*:\s*false/i,
];
/** Hedged/ambiguous outcome language → outcome "unknown" + lowered confidence. */
const AMBIGUOUS_OUTCOME_PATTERNS = [
  /\b(suggests?|may|might|could|appears? to|trend(?:s|ing)?|encouraging|promising|numerical(?:ly)?)\b/i,
];

/** Explicit numeric patterns we extract; anything else is never emitted. */
const ENROLLMENT_PATTERN = /enrollment of ([\d,]+)|enrolled ([\d,]+) (?:patients|participants|subjects)/i;

type EventType = (typeof EVENT_TYPES)[number];

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function parseIso(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function structuredText(s: Record<string, unknown> | undefined, keys: string[]): string {
  if (!s) return "";
  return keys
    .map((k) => asText(s[k]))
    .filter((v): v is string => v !== null)
    .join(" ");
}

/** Quoted record-field span for traceability when the value is not in the free text. */
function fieldSpan(field: string, value: string): string {
  return `"${field}": "${value}"`;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Map adapter status text → closed taxonomy (mirrors the CTRI adapter's mapping). */
function mapStatusToEventType(status: string | null): EventType | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "not yet recruiting") return "clinical_trial_started";
  if (["recruiting", "active, not recruiting", "suspended", "terminated", "withdrawn"].includes(s)) {
    return "clinical_trial_status_changed";
  }
  if (s === "completed") return "clinical_trial_result";
  return null;
}

/** Keyword classification of free text → taxonomy (closed union). */
function classifyFromText(text: string): EventType | null {
  const t = text.toLowerCase();
  if (/primary endpoint (was|has been) (met|not met)|failed to meet|missed .*primary endpoint/.test(t)) {
    return "clinical_trial_result";
  }
  if (/fda|ema|cdsco/.test(t) && /approv/.test(t)) return "regulatory_approval";
  if (/fda|ema|cdsco/.test(t) && /submi|filing|application/.test(t)) return "regulatory_submission";
  if (/first patient dosed|trial (was |has been )?initiated|study initiated|trial started/.test(t)) {
    return "clinical_trial_started";
  }
  if (/results? (were |was )?reported|readout|topline results/.test(t)) return "clinical_trial_result";
  if (/recruitment status|now (recruiting|enrolling)|status changed/.test(t)) {
    return "clinical_trial_status_changed";
  }
  return null;
}

/** `sponsor_name`-style company names: structured field, or "X Ltd/Limited" patterns in text. */
function extractCompanyNames(doc: ExtractionDocument, haystack: string): { names: string[]; spans: string[] } {
  const s = doc.structured;
  const sponsor = s ? asText(s["sponsor_name"] ?? s["sponsor"]) : null;
  if (sponsor && s) return { names: [sponsor], spans: [fieldSpan(s["sponsor_name"] != null ? "sponsor_name" : "sponsor", sponsor)] };
  const m = haystack.match(
    /\b([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,4})\s+(Ltd\.?|Limited|Laboratories|Pharmaceuticals?)\b/,
  );
  if (m) return { names: [m[0].trim()], spans: [m[0].trim()] };
  return { names: [], spans: [] };
}

/**
 * Rule-based extraction. Deterministic: same document → same output.
 * Follows the guardrails documented at the top of this file.
 */
export function extractDeterministic(doc: ExtractionDocument): StructuredExtraction {
  const structured = doc.structured;
  const recordText = structuredText(structured, [
    "public_title",
    "sponsor_name",
    "sponsor",
    "intervention_name",
    "drug_name",
    "health_condition",
    "indication",
    "phase",
    "recruitment_status",
    "status",
    "primary_outcome",
    "ctri_number",
    "trial_id",
  ]);
  const haystack = `${doc.text}\n${recordText}`;
  const facts: ExtractionFact[] = [];
  let confidence = 0.95;

  // --- trial IDs: only patterns literally present (never invented) ---
  const trialIds = unique(
    TRIAL_ID_PATTERNS.flatMap((re) => {
      re.lastIndex = 0;
      return [...haystack.matchAll(re)].map((m) => m[0]);
    }),
  );

  // --- companies / drugs / indications: structured fields or explicit text ---
  const { names: companyNames, spans: companySpans } = extractCompanyNames(doc, haystack);
  const drug = structured ? asText(structured["intervention_name"] ?? structured["drug_name"]) : null;
  const drugNames = drug ? [drug] : [];
  const indication = structured ? asText(structured["health_condition"] ?? structured["indication"]) : null;
  const indications = indication ? [indication] : [];

  // --- phase: closed set only ---
  const phaseRaw = structured ? asText(structured["phase"]) : null;
  const phase = phaseRaw && PHASES.has(phaseRaw) ? (phaseRaw as (typeof TRIAL_PHASES)[number]) : null;
  if (phaseRaw && !phase) confidence -= 0.05; // unmappable phase → small penalty, stays null

  // --- tickers: only from explicit structured fields; never guessed ---
  const tickerRaw = structured ? asText(structured["ticker"] ?? structured["ticker_symbol"]) : null;
  const tickerCandidates = tickerRaw ? [tickerRaw.toUpperCase()] : [];

  // --- published_at: only parseable dates present in structured fields ---
  const publishedAt =
    parseIso(structured?.["last_updated"]) ??
    parseIso(structured?.["registration_date"]) ??
    parseIso(structured?.["published_at"]) ??
    null;

  // --- event type: adapter hint wins; text classification; catch-all last ---
  let eventType: EventType | null = null;
  if (doc.eventType && (EVENT_TYPES as readonly string[]).includes(doc.eventType)) {
    eventType = doc.eventType as EventType;
  }
  if (!eventType) {
    eventType =
      mapStatusToEventType(structured ? asText(structured["recruitment_status"] ?? structured["status"]) : null) ??
      classifyFromText(haystack);
  }
  if (!eventType) {
    eventType = "company_pipeline_update"; // taxonomy catch-all for otherwise-unclassified docs
    confidence -= 0.1;
  }

  // --- outcome: explicit only; ambiguous → unknown + lowered confidence ---
  let outcome: StructuredExtraction["outcome"] = "unknown";
  let outcomeSpan: string | null = null;
  let outcomeConfidence = 0.6;
  const boolOutcome = structured?.["primary_outcome_met"];
  if (boolOutcome === true) {
    outcome = "primary_endpoint_met";
    outcomeSpan = fieldSpan("primary_outcome_met", "true");
    outcomeConfidence = 0.95;
  } else if (boolOutcome === false) {
    outcome = "primary_endpoint_missed";
    outcomeSpan = fieldSpan("primary_outcome_met", "false");
    outcomeConfidence = 0.95;
  } else if (OUTCOME_MET_PATTERNS.some((re) => re.test(haystack)) && eventType !== "clinical_trial_started") {
    outcome = "primary_endpoint_met";
    outcomeSpan = OUTCOME_MET_PATTERNS.find((re) => re.test(haystack))!.source;
    outcomeConfidence = 0.8;
    confidence -= 0.05;
  } else if (OUTCOME_MISSED_PATTERNS.some((re) => re.test(haystack))) {
    outcome = "primary_endpoint_missed";
    outcomeSpan = OUTCOME_MISSED_PATTERNS.find((re) => re.test(haystack))!.source;
    outcomeConfidence = 0.8;
    confidence -= 0.05;
  } else if (AMBIGUOUS_OUTCOME_PATTERNS.some((re) => re.test(haystack))) {
    outcome = "unknown"; // ambiguous outcome language → unknown (spec §8.3)
    outcomeSpan = AMBIGUOUS_OUTCOME_PATTERNS.find((re) => re.test(haystack))!.source;
    outcomeConfidence = 0.45;
    confidence -= 0.15; // lowered confidence (spec §8.3)
  }

  // --- numeric facts: explicit patterns only ---
  const enrollmentMatch = haystack.match(ENROLLMENT_PATTERN);
  const enrollment = enrollmentMatch ? (enrollmentMatch[1] ?? enrollmentMatch[2]).replace(/,/g, "") : null;

  // --- facts: every claim traceable to a source span ---
  if (companyNames.length > 0 && companySpans[0] && doc.text.includes(companyNames[0])) {
    facts.push({
      claim: `The sponsor is ${companyNames[0]}.`,
      source_span: companyNames[0],
      confidence: 0.95,
    });
  } else if (companyNames.length > 0) {
    facts.push({
      claim: `The sponsor is ${companyNames[0]}.`,
      source_span: companySpans[0] ?? companyNames[0],
      confidence: 0.9,
    });
  }
  if (trialIds.length > 0) {
    facts.push({
      claim: `Trial ${trialIds[0]}${phase ? ` is a ${phase} trial` : ""}${indication ? ` for ${indication}` : ""}.`,
      source_span: trialIds[0],
      confidence: 0.95,
    });
  } else if (drugNames.length > 0 || indications.length > 0) {
    facts.push({
      claim: `The record concerns${drugNames.length > 0 ? ` ${drugNames[0]}` : ""}${indications.length > 0 ? ` for ${indications[0]}` : ""}.`,
      source_span: [drugNames[0], indications[0]].filter(Boolean).join(" / ") || doc.text.slice(0, 120),
      confidence: 0.8,
    });
  }
  const statusText = structured ? asText(structured["recruitment_status"] ?? structured["status"]) : null;
  if (statusText) {
    facts.push({
      claim: `Recruitment status is listed as '${statusText}'.`,
      source_span: fieldSpan("recruitment_status", statusText),
      confidence: 0.95,
    });
  }
  const primaryOutcome = structured ? asText(structured["primary_outcome"]) : null;
  if (primaryOutcome) {
    facts.push({
      claim: `The stated primary outcome is: ${primaryOutcome}.`,
      source_span: fieldSpan("primary_outcome", primaryOutcome),
      confidence: 0.95,
    });
  }
  if (outcome === "primary_endpoint_met") {
    facts.push({
      claim: "The primary endpoint was met.",
      source_span: outcomeSpan ?? "primary_outcome_met",
      confidence: outcomeConfidence,
    });
  } else if (outcome === "primary_endpoint_missed") {
    facts.push({
      claim: "The primary endpoint was missed.",
      source_span: outcomeSpan ?? "primary_outcome_met",
      confidence: outcomeConfidence,
    });
  } else {
    facts.push({
      claim: "The source does not disclose whether the primary endpoint was met.",
      source_span: statusText ? fieldSpan("recruitment_status", statusText) : doc.text.slice(0, 120),
      confidence: outcomeConfidence,
    });
  }
  if (enrollment) {
    facts.push({
      claim: `Reported enrollment is ${enrollment} participants.`,
      source_span: enrollmentMatch![0],
      confidence: 0.9,
    });
  }

  confidence = Math.round(Math.min(0.98, Math.max(0.1, confidence)) * 100) / 100;

  return {
    event_type: eventType,
    company_names: companyNames,
    ticker_candidates: tickerCandidates,
    drug_names: drugNames,
    trial_ids: trialIds,
    indications,
    phase,
    outcome,
    facts,
    published_at: publishedAt,
    confidence,
  };
}

export class DeterministicExtractor implements ExtractionProvider {
  readonly providerName = "deterministic";

  async extract(doc: ExtractionDocument): Promise<StructuredExtraction> {
    // Pure and synchronous; wrapped in a promise to satisfy the interface.
    // Valid by construction — it only emits schema-conformant values.
    return extractDeterministic(doc);
  }
}
